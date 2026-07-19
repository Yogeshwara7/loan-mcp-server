// Generic OpenAI-compatible tool-calling loop used by the WhatsApp bridge.
import axios, { type AxiosInstance } from "axios";
import type { ZodRawShape, ZodTypeAny } from "zod";

import { toAppError } from "../errors/index.js";
import { toolDefinitions } from "../tools/registry.js";
import type { AnyToolDefinition, ToolContext } from "../tools/shared.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger("llm");

/** Max model<->tool round-trips before giving up (guards against loops). */
const MAX_STEPS = 6;

const SYSTEM_PROMPT = [
  "You are the Loan Management assistant for a lender, replying to staff and",
  "applicants over WhatsApp. Answer using ONLY the provided tools; never invent",
  "loan data. Keep replies short and clear for a phone screen: a sentence or two,",
  "or a compact list. Loan reference numbers look like LN-20260708090758. If a",
  "tool reports the loan was not found, say so plainly and ask the user to check",
  "the reference. Do not expose internal field names, IDs, or error codes.",
].join(" ");

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatCompletionResponse {
  choices: Array<{ message: ChatMessage }>;
}

/** Convert a Zod raw shape to a minimal JSON Schema (all inputs are strings). */
function shapeToJsonSchema(shape: ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(shape) as [string, ZodTypeAny][]) {
    const description = field._def.description;
    properties[key] = description ? { type: "string", description } : { type: "string" };
    if (!field.isOptional()) required.push(key);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

const TOOL_SPECS = toolDefinitions.map((def) => ({
  type: "function" as const,
  function: {
    name: def.name,
    description: def.description,
    parameters: shapeToJsonSchema(def.inputSchema),
  },
}));

function findTool(name: string): AnyToolDefinition | undefined {
  return toolDefinitions.find((def) => def.name === name);
}

async function executeToolCall(call: ToolCall, ctx: ToolContext): Promise<string> {
  const def = findTool(call.function.name);
  if (!def) {
    return JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
  }
  try {
    const args = (
      call.function.arguments ? JSON.parse(call.function.arguments) : {}
    ) as Record<string, unknown>;
    const result = await def.execute(args, ctx);
    return JSON.stringify(result);
  } catch (error) {
    log.warn(
      { tool: call.function.name, err: toAppError(error).message },
      "Tool call failed inside assistant loop",
    );
    return JSON.stringify(toAppError(error).toClientJSON());
  }
}

function createClient(ctx: ToolContext): AxiosInstance {
  const { llm } = ctx.config;
  if (!llm.apiKey) {
    throw new Error("LLM is not configured (missing HUGGINGFACE_API_KEY).");
  }
  return axios.create({
    baseURL: llm.baseUrl,
    timeout: llm.timeoutMs,
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function chatCompletion(
  client: AxiosInstance,
  ctx: ToolContext,
  messages: ChatMessage[],
): Promise<ChatMessage> {
  const response = await client.post<ChatCompletionResponse>("/chat/completions", {
    model: ctx.config.llm.model,
    messages,
    tools: TOOL_SPECS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 1024,
  });
  const choice = response.data.choices[0];
  if (!choice) throw new Error("LLM returned no choices.");
  return choice.message;
}

export async function runAssistant(
  userText: string,
  history: ChatMessage[],
  ctx: ToolContext,
): Promise<string> {
  const client = createClient(ctx);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userText },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await chatCompletion(client, ctx, messages);
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        const content = await executeToolCall(call, ctx);
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
      continue;
    }

    const reply = (message.content ?? "").trim();
    return reply || "Sorry, I couldn't find an answer to that.";
  }

  log.warn("Assistant exceeded max tool steps");
  return "Sorry, that request was too complex to complete. Please try rephrasing.";
}
