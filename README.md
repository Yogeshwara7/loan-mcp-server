# Loan MCP Server

A production-grade **Model Context Protocol (MCP)** server for a Loan Management
System backed by **Microsoft Dataverse**. It exposes read/analytics tools that
MCP clients (Claude Desktop, Copilot Studio, etc.) can call to look up and
report on loan applications.

- **Transports:** **stdio** (for Claude Desktop) and **Streamable HTTP** (for
  Copilot Studio / remote clients) — same server, same tools, **JSON-RPC 2.0**
  (official `@modelcontextprotocol/sdk`)
- **Auth:** Microsoft Entra ID **Client Credentials** flow (`@azure/msal-node`)
- **Data:** Dataverse **Web API v9.2** directly (no Power Automate, no connectors)
- **Language:** TypeScript (strict) on **Node.js 22+**

---

## Table of contents

- [Tools](#tools)
- [Architecture](#architecture)
- [Authentication flow](#authentication-flow)
- [Dataverse integration](#dataverse-integration)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Connect to Claude Desktop](#connect-to-claude-desktop)
- [Connect to Copilot Studio](#connect-to-copilot-studio)
- [Example requests & responses](#example-mcp-requests--responses)
- [Error handling](#error-handling)
- [Troubleshooting](#troubleshooting)

---

## Tools

All tools return **business-friendly field names** — Dataverse logical names are
never exposed.

### Customer tools

| Tool                   | Input             | Returns                                                         |
| ---------------------- | ----------------- | -------------------------------------------------------------- |
| `GetLoanSummary`       | `referenceNumber` | Full loan summary (applicant, amounts, status, officer, …)     |
| `GetLoanStatus`        | `referenceNumber` | Status, eligibility, assigned officer, review-required         |
| `SearchLoansByPhone`   | `phoneNumber`     | All loans for a phone number                                   |
| `GetApplicantHistory`  | `applicantEmail`  | All applications for an applicant                              |
| `TrackLoanTimeline`    | `referenceNumber` | Chronological milestones (created, eligibility, officer, …)    |
| `ExplainEligibility`   | `referenceNumber` | Eligibility status/remarks + business-friendly explanation     |
| `GetRequiredDocuments` | `loanType`        | Required document checklist for the loan type                  |

### Internal tools

| Tool                   | Input          | Returns                                                        |
| ---------------------- | -------------- | ------------------------------------------------------------- |
| `ListPendingReviews`   | —              | Loans currently `Under Review`                                |
| `GetOfficerWorkload`   | `officerName`  | Assigned loans, pending reviews, status breakdown             |
| `SearchLoansByStatus`  | `status`       | All loans matching a status label                             |
| `SearchLoansByOfficer` | `officerName`  | All loans assigned to an officer                              |
| `GetLoanAnalytics`     | —              | Totals by status; average/highest/lowest loan amount          |

---

## Architecture

```
                         ┌──────────────────────────────┐
   MCP client            │        index.ts (stdio)      │
 (Claude / Copilot) ◄───►│   JSON-RPC 2.0 over stdio    │
                         └───────────────┬──────────────┘
                                         │
                         ┌───────────────▼──────────────┐
                         │          server.ts           │  composition root (DI)
                         │  wires config → auth →        │
                         │  service → tool registry      │
                         └───────┬───────────────┬───────┘
                                 │               │
                 ┌───────────────▼──┐     ┌──────▼──────────────┐
                 │  tools/*  (12)   │     │  auth/auth.ts       │
                 │  defineTool()    │     │  Entra ID tokens    │
                 │  schemas (zod)   │     │  (MSAL, cached)     │
                 └───────┬──────────┘     └──────┬──────────────┘
                         │                       │ bearer token
                 ┌───────▼───────────────────────▼──────────────┐
                 │        services/dataverseService.ts          │
                 │  executeQuery / finders / choice metadata    │
                 │  Axios (reused) · retry-on-401 · pagination  │
                 └───────┬──────────────────────────────────────┘
                         │  raw records (logical names)
                 ┌───────▼──────────┐     ┌────────────────────┐
                 │  models/loan.ts  │     │  errors/index.ts   │
                 │  mappers +       │     │  AppError + typed  │
                 │  domain logic    │     │  subclasses        │
                 └──────────────────┘     └────────────────────┘

     config/  (env · dataverse names · tool names · documents)   utils/logger.ts (pino → stderr)
```

**Design principles**

- **Single source of truth for logical names** — `config/dataverse.ts` holds
  every table/column logical name; `models/loan.ts` mappers are the only
  translation point to business fields.
- **Repository/service pattern** — `DataverseService` owns all HTTP; tools never
  build requests. `executeQuery()` is the single list primitive (with
  pagination); finders (`findLoanByReference`, `findLoansByPhone`, …) compose it.
- **Open/closed tools** — each tool is a declarative `defineTool({...})`; the
  wrapper adds timing, logging and error mapping. Add a tool by listing it in
  `tools/registry.ts`.
- **Dependency injection** — `createServer()` wires everything and accepts
  overrides for testing.
- **Typed errors** — `AppError` subclasses (`AuthenticationError`,
  `DataverseError`, `ValidationError`, `LoanNotFoundError`) → clean MCP results.
- **stdout is sacred** — it carries only JSON-RPC; all logs go to **stderr**.

### Project structure

```
src/
├── index.ts                     # Entrypoint: stdio transport + lifecycle
├── http.ts                      # Entrypoint: Streamable HTTP transport + sessions
├── server.ts                    # Composition root (DI) — shared by both entrypoints
├── auth/
│   └── auth.ts                  # EntraAuthProvider (MSAL, cached tokens)
├── config/
│   ├── index.ts                 # Centralized appConfig (validated once)
│   ├── env.ts                   # Env schema + parsing (the only process.env reader)
│   ├── dataverse.ts             # Table/column logical names, statuses, select set
│   ├── tools.ts                 # Canonical tool names
│   └── documents.ts             # Loan-type → required documents mapping
├── errors/
│   └── index.ts                 # AppError hierarchy + codes
├── models/
│   └── loan.ts                  # Loan + projections, mappers, domain functions
├── services/
│   └── dataverseService.ts      # Reusable Web API client
├── tools/
│   ├── shared.ts                # defineTool wrapper + result helpers
│   ├── schemas.ts               # Reusable Zod input fields
│   ├── registry.ts              # List of all tool registrars
│   └── *.ts                     # 12 tool modules
└── utils/
    └── logger.ts                # pino logger (stderr only)
```

---

## Authentication flow

```
EntraAuthProvider.getAccessToken()
      │
      ├─ valid cached token (not within 60s of expiry)? ── yes ─► return it
      │
      └─ no ─► MSAL acquireTokenByClientCredential(scope = <DATAVERSE_URL>/.default)
                 │  (concurrent callers coalesce onto one in-flight request)
                 └─► cache token + expiry ─► return it

Every Dataverse request:  Axios request interceptor attaches "Authorization: Bearer <token>".
On HTTP 401:              response interceptor forces one refresh + retries the request once.
```

- Uses the OAuth 2.0 **client-credentials** grant (app-only, no user).
- Tokens are cached in-memory and reused until ~1 minute before expiry.
- Secrets are read from the environment only and are **redacted** from logs.

---

## Dataverse integration

- Talks to the **Web API** directly: `https://<org>.crm.dynamics.com/api/data/v9.2/`.
- Reads use `$select` (business columns), `$expand` (officer lookup → name),
  `$filter` (escaped OData literals) and follow `@odata.nextLink` **pagination**.
- **Choice/Picklist** columns (`status`, `eligibilityStatus`, `loanType`) return
  integers; labels come from the formatted-value annotation. Status **filtering**
  resolves a label to its option value via cached **option-set metadata**.
- The officer lookup is resolved to a display name via `$expand` of the
  navigation property (defaults to `systemuser` → `fullname`).

> **Naming note (schema vs logical):** the names in the maker portal
> (`cr174_ReferenceNumber`) are *schema* names. The Web API uses *logical* names,
> which are always **lowercase** (`cr174_referencenumber`). All logical names
> live in `config/dataverse.ts`.

---

## Prerequisites

1. **Node.js 22+** and npm.
2. A **Microsoft Dataverse** environment (e.g. `https://yourorg.crm.dynamics.com`).
3. A loan applications table (`cr174_loanapplics`) with the documented columns.
4. Permission to create an **Entra ID App Registration** and a Dataverse
   **Application User**.

## Setup

### 1. Azure App Registration

1. **Entra ID** portal → **App registrations** → **New registration**
   (`loan-mcp-server`, single tenant).
2. Copy the **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets** → **New client secret** → copy the secret **value**.

> Client-credentials needs no redirect URI or delegated permissions. Access is
> granted via the Dataverse Application User below.

### 2. Application User in Dataverse

1. **Power Platform Admin Center** → environment → **Settings** →
   **Users + permissions** → **Application users** → **New app user**.
2. Add the app by its **Application (client) ID**.
3. Assign a **security role** with **Read** on the loan table (and read on the
   officer lookup's target table, e.g. *User*, so the officer name resolves).

### 3. Required API permissions

The token is scoped to `https://yourorg.crm.dynamics.com/.default`. No
admin-consented Graph permissions are required — the **Application User +
security role** authorize the app. Ensure the role grants at least:

- **Read** on `cr174_loanapplics`
- **Read** on `systemuser` (to resolve officer names)
- Read access to entity metadata (default for authenticated app users) so status
  option-set values can be resolved.

### 4. Environment variables

Copy `.env.example` to `.env` and fill in the four required values.

---

## Environment variables

| Variable                | Required | Default                 | Description                                            |
| ----------------------- | -------- | ----------------------- | ------------------------------------------------------ |
| `TENANT_ID`             | ✅       | –                       | Directory (tenant) ID                                  |
| `CLIENT_ID`             | ✅       | –                       | Application (client) ID                                |
| `CLIENT_SECRET`         | ✅       | –                       | Client secret **value**                                |
| `DATAVERSE_URL`         | ✅       | –                       | `https://yourorg.crm.dynamics.com` (no trailing `/`)   |
| `DATAVERSE_API_VERSION` | –        | `v9.2`                  | Web API version                                        |
| `DATAVERSE_LOAN_TABLE`  | –        | `cr174_loanapplics`     | Loan entity **set** name (data paths)                  |
| `DATAVERSE_LOAN_ENTITY` | –        | `cr174_loanapplic`      | Loan entity **logical** name (metadata paths)          |
| `OFFICER_NAV_PROPERTY`  | –        | `cr174_OfficerAssigned` | Officer lookup navigation property to `$expand`        |
| `OFFICER_NAME_FIELD`    | –        | `fullname`              | Name column on the lookup's target table               |
| `OFFICER_ENTITY_SET`    | –        | `systemusers`           | Officer target entity set (for `getOfficer`)           |
| `OFFICER_EMAIL_FIELD`   | –        | `internalemailaddress`  | Officer email column (for `getOfficer`)                |
| `HTTP_TIMEOUT_MS`       | –        | `30000`                 | Dataverse request timeout (ms)                         |
| `LOG_LEVEL`             | –        | `info`                  | `trace`…`fatal`/`silent`                               |
| `HTTP_PORT`             | –        | `3000`                  | HTTP transport port (`start:http`)                     |
| `HTTP_HOST`             | –        | `127.0.0.1`             | HTTP bind host (`0.0.0.0` when hosted behind a proxy)  |
| `MCP_HTTP_PATH`         | –        | `/mcp`                  | HTTP MCP endpoint path                                 |
| `MCP_API_KEY`           | –        | *(unset)*               | Shared secret for the HTTP endpoint (strongly advised) |
| `MCP_CORS_ORIGIN`       | –        | `*`                     | CORS allow-origin for the HTTP transport               |

Configuration is validated with Zod at startup; invalid/missing values fail fast
with an actionable message.

---

## Running locally

```bash
npm install        # install dependencies
npm run build      # compile TypeScript to dist/

# Streamable HTTP transport (default `start`; for Copilot Studio / remote / Azure)
npm start          # node dist/http.js  -> listens on HTTP_PORT (default 3000)
npm run dev:http   # from source with reload

# stdio transport (Claude Desktop launches this as a child process)
npm run start:stdio # node dist/index.js
npm run dev         # from source with reload

npm run typecheck  # type-check without emitting
```

> `npm start` runs the **HTTP** server so cloud hosts (Azure App Service) that
> invoke `npm start` work with no custom startup command. Claude Desktop launches
> the stdio entrypoint (`dist/index.js`) directly, so this doesn't affect it.

### Transports

| Transport           | Entrypoint     | Command              | Use with                       |
| ------------------- | -------------- | -------------------- | ------------------------------ |
| **Streamable HTTP** | `src/http.ts`  | `npm start`          | Copilot Studio / remote / Azure |
| **stdio**           | `src/index.ts` | `npm run start:stdio`| Claude Desktop (local)         |

Both expose the identical server, auth, service and 12 tools — only the
transport differs. The **stdio** server has no port (an MCP client launches it
and talks over stdin/stdout; stdout is reserved for JSON-RPC). The **HTTP**
server listens on `HTTP_PORT` and serves:

- `POST {MCP_HTTP_PATH}` — client→server messages (`initialize` starts a session)
- `GET {MCP_HTTP_PATH}` — server→client SSE stream for a session
- `DELETE {MCP_HTTP_PATH}` — terminate a session
- `GET /healthz` — liveness probe (unauthenticated)

Sessions are tracked via the `mcp-session-id` header; the token cache and Axios
instance are shared across sessions. Protect the HTTP endpoint with
`MCP_API_KEY` (sent as `x-api-key` or `Authorization: Bearer`) — if unset, the
endpoint is unauthenticated and a warning is logged.

> **PowerShell note (Windows):** if `npm` is blocked by execution policy, run
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or call
> `npm.cmd`.

---

## Testing

An automated MCP client drives every tool against your real environment (reads
`.env`):

```bash
npm run build
npm test            # or: npm run test:client
```

It performs the JSON-RPC handshake, asserts all 12 tools are advertised, calls
each one and checks response shapes, and verifies the error paths
(`LOAN_NOT_FOUND`, `VALIDATION_ERROR`, invalid input). A batch reporter is also
provided:

```bash
npm run test:batch                       # summary table for a set of references
node scripts/batch-test.mjs LN-XXXX LN-YYYY
```

Sample inputs can be overridden via env: `TEST_REF`, `TEST_PHONE`, `TEST_EMAIL`,
`TEST_OFFICER`, `TEST_STATUS`, `TEST_LOAN_TYPE`.

---

## Connect to Claude Desktop

Edit the config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "loan-management": {
      "command": "node",
      "args": ["C:\\Changes\\Innorve\\loan-mcp-server\\dist\\index.js"]
    }
  }
}
```

Run `npm run build` first, then fully restart Claude Desktop. The server reads
`.env` from its own folder; alternatively pass secrets via an `"env": { … }`
block in the config. All 12 tools then appear in the tools menu.

## Connect to Copilot Studio

Copilot Studio is cloud-hosted and connects to MCP servers over **HTTP** (not
stdio), so use the Streamable HTTP transport and a reachable URL.

1. **Run the HTTP transport** with an API key:
   ```bash
   npm run build
   # set MCP_API_KEY (and HTTP_HOST=0.0.0.0 if behind a proxy) in .env, then:
   npm run start:http
   ```
2. **Expose it with a public HTTPS URL** so Copilot Studio's cloud can reach it:
   - *Testing:* a tunnel to `http://localhost:3000` (VS Code dev tunnels, ngrok, …).
   - *Production:* host on Azure App Service / Container Apps and use its HTTPS URL.
3. **Register it in Copilot Studio:** your agent → **Tools** → **Add tool** →
   **Model Context Protocol**, and point it at `https://<your-host>/mcp`. Supply
   the `MCP_API_KEY` as the `x-api-key` header (or `Authorization: Bearer`).
4. The server advertises all tools via `tools/list`, so Copilot Studio discovers
   them automatically. The tool contract is identical to the Claude Desktop
   integration.

> **Security:** the HTTP endpoint calls your loan data. Always set `MCP_API_KEY`,
> serve over HTTPS (via the tunnel/host), and restrict `MCP_CORS_ORIGIN` in
> production.

Verify the HTTP transport locally at any time:

```bash
npm run start:http                 # in one terminal
MCP_API_KEY=... npm run test:http  # in another (drives it as a real MCP client)
```

---

## Connect to WhatsApp (Twilio)

WhatsApp is a messaging channel, not an MCP client, so it needs an LLM "brain"
in the middle. The built-in bridge does this:

```
WhatsApp user  ⇄  Twilio  ⇄  POST /whatsapp  ⇄  LLM tool-loop  ⇄  the 12 loan tools  ⇄  Dataverse
```

An inbound message is sent to an LLM (Hugging Face by default) with the loan
tools attached; the model calls the right tools and the reply is sent back via
Twilio. It runs **inside the same HTTP server** — no separate deployment.

**Activation:** the bridge is active only when `HUGGINGFACE_API_KEY` **and** all
`TWILIO_*` settings are present (see `.env.example`). `GET /healthz` reports
`"whatsapp":"enabled"` when configured. Until then, inbound messages are
acknowledged and ignored.

**Setup (testing):**

1. **LLM key** — a Hugging Face token (or any OpenAI-compatible endpoint via
   `LLM_BASE_URL`/`LLM_MODEL`). Set `HUGGINGFACE_API_KEY`.
2. **Twilio WhatsApp Sandbox** — Twilio Console → Messaging → Try it out →
   Send a WhatsApp message. Note the **Account SID**, **Auth Token**, sandbox
   **From** number (`whatsapp:+14155238886`) and the join code; join from your
   phone. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
3. **Webhook** — in the sandbox settings, set *"When a message comes in"* to
   `https://<your-host>/whatsapp` (POST). On Azure that's
   `https://<app>.azurewebsites.net/whatsapp`.
4. Set `TWILIO_VALIDATE_SIGNATURE=true` once the public URL is stable.

Then text the sandbox number, e.g. *"status of LN-20260708090758"* or
*"how many loans are under review?"*.

> These are separate secrets from the MCP server — set them in the host's
> environment (Azure **App settings**), never in code. The bridge adds no new npm
> dependencies.

---

## Example MCP requests & responses

**Call `GetLoanSummary`**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "GetLoanSummary",
    "arguments": { "referenceNumber": "LN-20260708090758" }
  }
}
```

**Response (success)** — `structuredContent` plus a text mirror:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "{ ...json... }" }],
    "structuredContent": {
      "referenceNumber": "LN-20260708090758",
      "applicantName": "Yogeshwara B",
      "applicantEmail": "yogeshwara567@gmail.com",
      "phoneNumber": "8197792301",
      "loanAmount": 15000000,
      "propertyValue": 0,
      "loanType": "Personal Loan",
      "status": "Under Review",
      "eligibilityStatus": "Needs Manual Review",
      "eligibilityRemarks": "Loan amount exceeds automatic approval threshold.",
      "reviewRequired": true,
      "assignedOfficer": "Akshitha S",
      "createdDate": "2026-07-08T09:07:57Z",
      "documentsUploaded": false
    }
  }
}
```

**`GetLoanAnalytics`** (no arguments) →

```json
{
  "totalApplications": 71,
  "pending": 10, "approved": 10, "rejected": 4,
  "underReview": 14, "received": 29,
  "averageLoanAmount": 9625394.68,
  "highestLoanAmount": 53214334,
  "lowestLoanAmount": 33
}
```

**`GetOfficerWorkload`** `{ "officerName": "Akshitha S" }` →

```json
{
  "officerName": "Akshitha S",
  "totalWorkload": 3,
  "pendingReviews": 3,
  "byStatus": { "received": 0, "pending": 0, "underReview": 3, "approved": 0, "rejected": 0, "other": 0 },
  "loans": [ { "referenceNumber": "LN-...", "status": "Under Review", "loanAmount": 50000000, "reviewRequired": true } ]
}
```

**Error result (loan not found)** —

```json
{
  "result": {
    "isError": true,
    "content": [{ "type": "text", "text": "{ ...json... }" }],
    "structuredContent": {
      "error": "No loan found with reference number 'LN-000'.",
      "code": "LOAN_NOT_FOUND",
      "retryable": false,
      "httpStatus": 404
    }
  }
}
```

---

## Error handling

Every failure is a typed `AppError` mapped to a structured MCP result:

| Code                    | Thrown as             | Meaning                                            |
| ----------------------- | --------------------- | -------------------------------------------------- |
| `VALIDATION_ERROR`      | `ValidationError`     | Bad input / unknown status label                   |
| `LOAN_NOT_FOUND`        | `LoanNotFoundError`   | No record matched                                  |
| `AUTHENTICATION_FAILED` | `AuthenticationError` | Could not acquire an Entra ID token                |
| `UNAUTHORIZED`          | `AuthenticationError` | Dataverse rejected the token (401)                 |
| `FORBIDDEN`             | `DataverseError`      | Insufficient Dataverse privileges (403)            |
| `BAD_REQUEST`           | `DataverseError`      | Malformed query (400) — check table/column config  |
| `DATAVERSE_UNAVAILABLE` | `DataverseError`      | Dataverse 5xx / unavailable (retryable)            |
| `NETWORK_ERROR`         | `DataverseError`      | Timeout / network failure (retryable)              |
| `UNKNOWN`               | `DataverseError`      | Unclassified error                                 |

---

## Troubleshooting

| Symptom                                                      | Likely cause / fix                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BAD_REQUEST` / *"Could not find a property named …"*        | A column logical name is wrong. Logical names are **lowercase**; verify against `config/dataverse.ts`.               |
| `AUTHENTICATION_FAILED`                                      | Check `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET` (secret **value**, not ID).                                          |
| `UNAUTHORIZED` (401) after auth succeeded                    | Token rejected — the Application User may be missing or disabled in Dataverse.                                        |
| `FORBIDDEN` (403)                                            | The Application User's security role lacks Read on the table (or on `systemuser` for officer names).                 |
| Officer shows blank                                          | No officer assigned, or `OFFICER_NAV_PROPERTY` / `OFFICER_NAME_FIELD` don't match the lookup's target.               |
| `VALIDATION_ERROR` from `SearchLoansByStatus`               | The status label doesn't exist; the error lists valid labels (from option-set metadata).                            |
| `npm` blocked on Windows (`running scripts is disabled`)     | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use `npm.cmd`.                            |
| Client sees no output / server "hangs"                       | Expected — it's a stdio server waiting for JSON-RPC. Launch it from an MCP client, not a bare terminal.              |

## License

MIT
