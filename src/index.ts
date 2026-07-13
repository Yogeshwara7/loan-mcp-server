#!/usr/bin/env node
/**
 * Entrypoint for the Loan MCP server.
 *
 * Transport: stdio (JSON-RPC 2.0). This is compatible with Claude Desktop,
 * Copilot Studio's MCP support and any other MCP client that speaks stdio.
 *
 * stdout is reserved exclusively for JSON-RPC traffic; all diagnostics go to
 * stderr via the shared pino logger.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Ensure clean shutdown on termination signals.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down MCP server");
    try {
      await server.close();
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown");
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await server.connect(transport);
  logger.info("Loan MCP server connected over stdio and ready");
}

main().catch((error) => {
  // Configuration/startup failures land here. Log to stderr and exit non-zero
  // so the hosting MCP client surfaces the failure.
  logger.fatal({ err: error }, "Fatal error starting Loan MCP server");
  process.exit(1);
});
