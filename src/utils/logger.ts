// Logs go to stderr so stdout stays a clean JSON-RPC channel for MCP over stdio.
import pino from "pino";

import { appConfig } from "../config/index.js";

export const logger = pino(
  {
    level: appConfig.logging.level,
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
  pino.destination(2),
);

export type Logger = typeof logger;

export function childLogger(component: string): Logger {
  return logger.child({ component }) as Logger;
}
