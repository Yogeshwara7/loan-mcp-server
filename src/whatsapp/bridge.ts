// WhatsApp (Twilio) bridge; inert unless LLM key + Twilio credentials are configured.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import axios from "axios";

import type { AppConfig } from "../config/index.js";
import { runAssistant, type ChatMessage } from "../llm/toolLoop.js";
import type { ToolContext } from "../tools/shared.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger("whatsapp");

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Per-user short conversation history (in-memory; fine for a single instance). */
const histories = new Map<string, ChatMessage[]>();
const MAX_HISTORY_MESSAGES = 8;

export function isWhatsappConfigured(config: AppConfig): boolean {
  const { llm, whatsapp } = config;
  return Boolean(
    llm.apiKey && whatsapp.accountSid && whatsapp.authToken && whatsapp.from,
  );
}

function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const params: Record<string, string> = {};
      for (const [key, value] of new URLSearchParams(
        Buffer.concat(chunks).toString("utf8"),
      )) {
        params[key] = value;
      }
      resolve(params);
    });
    req.on("error", reject);
  });
}

/** Validate Twilio's X-Twilio-Signature over the request URL + sorted params. */
function hasValidSignature(
  config: AppConfig,
  req: IncomingMessage,
  params: Record<string, string>,
): boolean {
  const header = req.headers["x-twilio-signature"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature || !config.whatsapp.authToken) return false;

  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
  const url = `${proto}://${host}${req.url ?? ""}`;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  const expected = createHmac("sha1", config.whatsapp.authToken)
    .update(Buffer.from(data, "utf8"))
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendWhatsapp(config: AppConfig, to: string, body: string): Promise<void> {
  const { accountSid, authToken, from } = config.whatsapp;
  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio is not configured.");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  await axios.post(url, form.toString(), {
    auth: { username: accountSid, password: authToken },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15_000,
  });
}

export async function handleWhatsappWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ToolContext,
): Promise<void> {
  const params = await readForm(req);

  if (ctx.config.whatsapp.validateSignature && !hasValidSignature(ctx.config, req, params)) {
    log.warn("Rejected WhatsApp webhook: invalid Twilio signature");
    res.writeHead(403).end("Invalid signature");
    return;
  }

  // Ack immediately so slow LLM work never times out Twilio's webhook.
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(EMPTY_TWIML);

  const from = params["From"];
  const body = (params["Body"] ?? "").trim();
  if (!from || !body) return;

  if (!isWhatsappConfigured(ctx.config)) {
    log.warn("WhatsApp message received but the bridge is not fully configured; ignoring");
    return;
  }

  void processMessage(ctx, from, body);
}

async function processMessage(
  ctx: ToolContext,
  from: string,
  body: string,
): Promise<void> {
  const started = Date.now();
  try {
    const history = histories.get(from) ?? [];
    const reply = await runAssistant(body, history, ctx);

    const updated = [
      ...history,
      { role: "user", content: body } as ChatMessage,
      { role: "assistant", content: reply } as ChatMessage,
    ].slice(-MAX_HISTORY_MESSAGES);
    histories.set(from, updated);

    await sendWhatsapp(ctx.config, from, reply);
    log.info({ from, durationMs: Date.now() - started }, "WhatsApp reply sent");
  } catch (error) {
    log.error({ from, err: error }, "Failed to handle WhatsApp message");
    try {
      await sendWhatsapp(
        ctx.config,
        from,
        "Sorry, something went wrong handling your request. Please try again shortly.",
      );
    } catch (sendError) {
      log.error({ from, err: sendError }, "Failed to send WhatsApp error reply");
    }
  }
}
