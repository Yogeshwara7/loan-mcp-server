# Loan MCP Server

A Model Context Protocol (MCP) server that exposes read and analytics tools for a
Loan Management System backed by Microsoft Dataverse. It can be consumed by MCP
clients (Claude Desktop, Copilot Studio) over stdio or HTTP, and includes an
optional WhatsApp assistant.

## Features

- 12 loan tools: lookups, search, timeline, eligibility, officer workload and portfolio analytics.
- Two transports: **stdio** (Claude Desktop) and **Streamable HTTP** (Copilot Studio / remote clients), JSON-RPC 2.0.
- Optional **WhatsApp** assistant via Twilio + an LLM.
- Microsoft Entra ID authentication (client credentials); Dataverse Web API v9.2.
- TypeScript, Node.js 22+, structured logging, typed error handling.

## Tools

| Tool | Input | Description |
| --- | --- | --- |
| `GetLoanSummary` | `referenceNumber` | Full loan summary |
| `GetLoanStatus` | `referenceNumber` | Status, eligibility, officer, review flag |
| `SearchLoansByPhone` | `phoneNumber` | Loans for a phone number |
| `GetApplicantHistory` | `applicantEmail` | Applications for an applicant |
| `TrackLoanTimeline` | `referenceNumber` | Milestone timeline |
| `ExplainEligibility` | `referenceNumber` | Eligibility explanation |
| `GetRequiredDocuments` | `loanType` | Required document checklist |
| `ListPendingReviews` | – | Loans under manual review |
| `GetOfficerWorkload` | `officerName` | An officer's assigned loans and workload |
| `SearchLoansByStatus` | `status` | Loans by status |
| `SearchLoansByOfficer` | `officerName` | Loans assigned to an officer |
| `GetLoanAnalytics` | – | Portfolio totals and amount statistics |

## Prerequisites

- Node.js 22 or later
- A Microsoft Dataverse environment
- An Entra ID app registration with a corresponding Dataverse application user (Read access to the loan table)

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the required values
npm run build
npm start              # HTTP server (dist/http.js)
```

For local development with reload:

```bash
npm run dev:http       # HTTP
npm run dev            # stdio
```

## Configuration

Set these in `.env` (local) or as environment variables / Azure App settings (hosted).

**Required**

| Variable | Description |
| --- | --- |
| `TENANT_ID` | Entra ID directory (tenant) ID |
| `CLIENT_ID` | App registration (client) ID |
| `CLIENT_SECRET` | Client secret value |
| `DATAVERSE_URL` | e.g. `https://yourorg.crm.dynamics.com` |

**Common optional** (defaults in parentheses)

| Variable | Description |
| --- | --- |
| `MCP_API_KEY` | Shared secret for the HTTP endpoint (`x-api-key`). Strongly recommended when exposed. |
| `DATAVERSE_LOAN_TABLE` | Loan entity set name (`cr174_loanapplics`) |
| `HTTP_PORT` / `HTTP_HOST` | Listen port/host (`PORT` or `3000` / `0.0.0.0`) |
| `LOG_LEVEL` | `info` |

See `.env.example` for the full list, including the WhatsApp settings below.

## Usage

The server is transport-only; a client drives the tools.

- **Claude Desktop (stdio):** point an `mcpServers` entry at `node dist/index.js` (or `npm run start:stdio`).
- **Copilot Studio / remote (HTTP):** add an MCP tool at `https://<host>/mcp` with API-key auth (header `x-api-key`).

`GET /healthz` returns liveness and WhatsApp status.

### WhatsApp (optional)

Lets users query loans over WhatsApp. Enabled only when `HUGGINGFACE_API_KEY` and the `TWILIO_*` variables are set.

1. Set `HUGGINGFACE_API_KEY` (or another OpenAI-compatible endpoint via `LLM_BASE_URL` / `LLM_MODEL`).
2. Create a Twilio WhatsApp Sandbox; set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
3. In the sandbox settings, set the inbound webhook to `https://<host>/whatsapp` (POST).
4. Set `TWILIO_VALIDATE_SIGNATURE=true` once the URL is stable.

## Deployment

Deployed on Azure App Service. Pushing to `main` builds and deploys via GitHub Actions
(`.github/workflows/main_loan-mcp-server.yml`). Set all required and secret variables as
App settings; Azure runs `npm start` (the HTTP server) and injects `PORT` automatically.

## Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the HTTP server |
| `npm run start:stdio` | Run the stdio server |
| `npm run dev` / `dev:http` | Run from source with reload |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Integration test (requires a populated `.env`) |
| `npm run test:http` | Integration test over HTTP |

## License

MIT
