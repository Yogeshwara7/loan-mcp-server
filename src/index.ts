#!/usr/bin/env node
// Stdio entrypoint. stdout is the JSON-RPC channel; diagnostics go to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

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
  logger.fatal({ err: error }, "Fatal error starting Loan MCP server");
  process.exit(1);
});
