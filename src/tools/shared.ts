/**
 * Shared tool infrastructure.
 *
 * `defineTool` wraps a business function with the cross-cutting concerns every
 * tool needs — argument typing, execution timing, structured logging and
 * error-to-MCP translation — so individual tool modules stay declarative and
 * free of duplication (DRY + single-responsibility).
 */
import type {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z, ZodRawShape } from "zod";

import type { AppConfig } from "../config/index.js";
import { toAppError, type ClientError } from "../errors/index.js";
import type { DataverseService } from "../services/dataverseService.js";
import { childLogger, type Logger } from "../utils/logger.js";

/** Dependencies available to every tool handler. */
export interface ToolContext {
  service: DataverseService;
  config: AppConfig;
}

/** Parsed argument object inferred from a Zod raw shape. */
export type ShapeArgs<Shape extends ZodRawShape> = {
  [K in keyof Shape]: z.infer<Shape[K]>;
};

/** A function that registers a tool onto an MCP server. */
export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

export interface ToolDefinition<Shape extends ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  execute: (args: ShapeArgs<Shape>, ctx: ToolContext) => Promise<Record<string, unknown>>;
}

const registrarLog = childLogger("tools");

/** Build a successful tool result carrying both text and structured content. */
export function successResult(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** Build a client-safe error tool result from any thrown value. */
export function errorResult(
  error: unknown,
  toolName: string,
  log: Logger,
): CallToolResult {
  const appError = toAppError(error);
  const body: ClientError = appError.toClientJSON();
  log.warn(
    { tool: toolName, code: body.code, httpStatus: body.httpStatus },
    appError.message,
  );
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent: body as unknown as Record<string, unknown>,
    isError: true,
  };
}

/**
 * Declare a tool. Returns a registrar that binds the tool to a server + context
 * and applies logging/timing/error handling around the business function.
 */
export function defineTool<Shape extends ZodRawShape>(
  def: ToolDefinition<Shape>,
): ToolRegistrar {
  return (server, ctx) => {
    const log = childLogger(`tool:${def.name}`);

    const handler = async (args: ShapeArgs<Shape>): Promise<CallToolResult> => {
      const started = Date.now();
      log.debug({ tool: def.name }, "Tool invoked");
      try {
        const payload = await def.execute(args, ctx);
        log.info({ tool: def.name, durationMs: Date.now() - started }, "Tool completed");
        return successResult(payload);
      } catch (error) {
        return errorResult(error, def.name, log);
      }
    };

    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
      },
      // The handler is fully typed against the concrete shape; the cast bridges
      // TypeScript's overload inference for the SDK's generic `registerTool`.
      handler as unknown as ToolCallback<Shape>,
    );
    registrarLog.debug({ tool: def.name }, "Tool registered");
  };
}
