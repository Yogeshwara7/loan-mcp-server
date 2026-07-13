#!/usr/bin/env node
/**
 * Optional HTTP entrypoint using the MCP **Streamable HTTP** transport.
 *
 * This exposes the exact same server, auth, service and tools as the stdio
 * entrypoint (`index.ts`) — only the transport differs — so it can be reached by
 * cloud MCP clients such as Copilot Studio. The stdio entrypoint remains the
 * default for Claude Desktop.
 *
 * Endpoints (all on MCP_HTTP_PATH, default /mcp):
 *   POST   - client -> server JSON-RPC messages (initialize establishes a session)
 *   GET    - server -> client SSE stream for an established session
 *   DELETE - terminate a session
 * Plus GET /healthz for liveness probes.
 *
 * Sessions are tracked by the `mcp-session-id` header. The auth token cache and
 * Dataverse service (single Axios instance) are shared across all sessions.
 */
import { randomUUID } from "node:crypto";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { EntraAuthProvider } from "./auth/auth.js";
import { appConfig } from "./config/index.js";
import { DataverseService } from "./services/dataverseService.js";
import { createServer } from "./server.js";
import { childLogger, logger } from "./utils/logger.js";

const log = childLogger("http");
const { server: httpConfig } = appConfig;

// Shared dependencies: one token cache + one Axios instance for all sessions.
const tokenProvider = new EntraAuthProvider(appConfig);
const dataverseService = new DataverseService(appConfig, tokenProvider);

/** Active transports keyed by session id. */
const transports = new Map<string, StreamableHTTPServerTransport>();

function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", httpConfig.corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, mcp-protocol-version, x-api-key, authorization",
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, {
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

/** Validate the optional API key. Returns true when the request may proceed. */
function isAuthorized(req: IncomingMessage): boolean {
  if (!httpConfig.apiKey) return true; // auth disabled
  const headerKey = req.headers["x-api-key"];
  const provided =
    (Array.isArray(headerKey) ? headerKey[0] : headerKey) ??
    (typeof req.headers.authorization === "string"
      ? req.headers.authorization.replace(/^Bearer\s+/i, "")
      : undefined);
  return provided === httpConfig.apiKey;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/** Build a fresh transport + server for a new session, sharing dependencies. */
async function createSession(): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
      log.info({ sessionId }, "MCP session initialized");
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
      log.info({ sessionId: transport.sessionId }, "MCP session closed");
    }
  };

  const server = createServer({ tokenProvider, dataverseService });
  // Cast bridges an `exactOptionalPropertyTypes` mismatch between the SDK's
  // transport class (onclose typed `(() => void) | undefined`) and its own
  // `Transport` interface; the runtime contract is fully satisfied.
  await server.connect(transport as unknown as Transport);
  return transport;
}

const httpServer = createHttpServer(async (req, res) => {
  try {
    applyCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Liveness probe (unauthenticated).
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { status: "ok", sessions: transports.size });
      return;
    }

    if (url.pathname !== httpConfig.path) {
      rpcError(res, 404, "Not found.");
      return;
    }

    if (!isAuthorized(req)) {
      rpcError(res, 401, "Unauthorized: missing or invalid API key.");
      return;
    }

    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (isInitializeRequest(body)) {
          transport = await createSession();
        } else {
          rpcError(res, 400, "Bad Request: no valid session; send an initialize request first.");
          return;
        }
      }

      await transport.handleRequest(req, res, body);
      return;
    }

    if (req.method === "GET" || req.method === "DELETE") {
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        rpcError(res, 400, "Bad Request: unknown or missing mcp-session-id.");
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    rpcError(res, 405, "Method not allowed.");
  } catch (error) {
    log.error({ err: error }, "Error handling HTTP request");
    if (!res.headersSent) rpcError(res, 500, "Internal server error.");
  }
});

function shutdown(signal: string): void {
  log.info({ signal }, "Shutting down HTTP MCP server");
  for (const transport of transports.values()) {
    void transport.close();
  }
  httpServer.close(() => process.exit(0));
  // Force-exit if connections linger.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

httpServer.listen(httpConfig.port, httpConfig.host, () => {
  logger.info(
    {
      host: httpConfig.host,
      port: httpConfig.port,
      path: httpConfig.path,
      authRequired: Boolean(httpConfig.apiKey),
    },
    "Loan MCP server listening (Streamable HTTP)",
  );
  if (!httpConfig.apiKey) {
    logger.warn(
      "MCP_API_KEY is not set — the HTTP endpoint is unauthenticated. Set MCP_API_KEY before exposing it.",
    );
  }
});
