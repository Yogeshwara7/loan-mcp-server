// Composition root: wires config, auth, service and tools into a ready server.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { EntraAuthProvider, type TokenProvider } from "./auth/auth.js";
import { appConfig, type AppConfig } from "./config/index.js";
import { DataverseService } from "./services/dataverseService.js";
import { toolDefinitions } from "./tools/registry.js";
import { registerTool, type ToolContext } from "./tools/shared.js";
import { childLogger } from "./utils/logger.js";

const log = childLogger("server");

export interface ServerDependencies {
  config?: AppConfig;
  tokenProvider?: TokenProvider;
  dataverseService?: DataverseService;
}

export const SERVER_INFO = {
  name: "loan-mcp-server",
  version: "1.0.0",
} as const;

export function createServer(deps: ServerDependencies = {}): McpServer {
  const config = deps.config ?? appConfig;
  const tokenProvider = deps.tokenProvider ?? new EntraAuthProvider(config);
  const dataverseService =
    deps.dataverseService ?? new DataverseService(config, tokenProvider);

  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {}, logging: {} },
    instructions:
      "Tools for the Loan Management System. Customer tools look up individual " +
      "loans (summary, status, timeline, eligibility, documents) or search by " +
      "phone/email. Internal tools cover reviews, officer workload, status/officer " +
      "search and portfolio analytics. Most loan lookups take a reference number " +
      "such as LN-20260709110527.",
  });

  const ctx: ToolContext = { service: dataverseService, config };
  for (const def of toolDefinitions) {
    registerTool(server, def, ctx);
  }

  log.info({ toolCount: toolDefinitions.length }, "MCP server constructed");
  return server;
}
