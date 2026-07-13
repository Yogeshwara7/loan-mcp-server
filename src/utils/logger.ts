/**
 * Centralized logger.
 *
 * IMPORTANT: This server communicates with MCP clients over stdio using
 * JSON-RPC 2.0. `stdout` is the RPC channel and MUST NOT contain anything
 * other than protocol messages. All logging is therefore written to `stderr`
 * (file descriptor 2), which MCP clients treat as diagnostic output.
 */
import pino from "pino";

import { appConfig } from "../config/index.js";

export const logger = pino(
  {
    level: appConfig.logging.level,
    // Redact anything that could leak secrets or tokens if objects are logged.
    redact: {
      paths: [
        "clientSecret",
        "client_secret",
        "accessToken",
        "access_token",
        "authorization",
        "Authorization",
        "headers.authorization",
        "headers.Authorization",
      ],
      censor: "[REDACTED]",
    },
    base: { service: "loan-mcp-server" },
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  // Route ALL log output to stderr so stdout stays a clean JSON-RPC channel.
  pino.destination(2),
);

export type Logger = typeof logger;

/**
 * Create a child logger bound to a component name for easier correlation.
 */
export function childLogger(component: string): Logger {
  return logger.child({ component }) as Logger;
}
