/**
 * Environment loading + validation. This is the ONLY place that reads
 * `process.env`. Validation runs once at startup so misconfiguration fails
 * fast with an actionable message.
 */
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  TENANT_ID: z.string().min(1, "TENANT_ID is required"),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
  CLIENT_SECRET: z.string().min(1, "CLIENT_SECRET is required"),
  DATAVERSE_URL: z
    .string()
    .url("DATAVERSE_URL must be a valid URL, e.g. https://yourorg.crm.dynamics.com")
    .transform((value) => value.replace(/\/+$/, "")),

  DATAVERSE_API_VERSION: z.string().min(1).default("v9.2"),
  /** Plural entity set name, used in Web API data paths. */
  DATAVERSE_LOAN_TABLE: z.string().min(1).default("cr174_loanapplics"),
  /** Singular entity logical name, used in metadata (EntityDefinitions) paths. */
  DATAVERSE_LOAN_ENTITY: z.string().min(1).default("cr174_loanapplic"),

  OFFICER_NAV_PROPERTY: z.string().min(1).default("cr174_OfficerAssigned"),
  OFFICER_NAME_FIELD: z.string().min(1).default("fullname"),
  OFFICER_ENTITY_SET: z.string().min(1).default("systemusers"),
  OFFICER_EMAIL_FIELD: z.string().min(1).default("internalemailaddress"),

  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),

  // HTTP transport (used by the optional Streamable HTTP entrypoint; the stdio
  // entrypoint ignores these).
  // Azure App Service (and most PaaS hosts) inject the listen port via PORT and
  // require binding 0.0.0.0; fall back to those so the app runs there unchanged.
  HTTP_PORT: z.coerce.number().int().positive().default(Number(process.env.PORT) || 3000),
  HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  MCP_HTTP_PATH: z
    .string()
    .min(1)
    .default("/mcp")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  /** Optional shared secret required on HTTP requests (x-api-key / Bearer). */
  MCP_API_KEY: z.string().min(1).optional(),
  /** CORS Access-Control-Allow-Origin for the HTTP transport. */
  MCP_CORS_ORIGIN: z.string().min(1).default("*"),

  // ---- LLM "brain" for the WhatsApp bridge (OpenAI-compatible endpoint) ----
  // Hugging Face Inference Providers by default. Optional: the bridge is only
  // active when a key + Twilio credentials are present.
  HUGGINGFACE_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("Qwen/Qwen2.5-72B-Instruct"),
  LLM_BASE_URL: z
    .string()
    .url()
    .default("https://router.huggingface.co/v1")
    .transform((value) => value.replace(/\/+$/, "")),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // ---- WhatsApp via Twilio ----
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  /** Sender in Twilio format, e.g. whatsapp:+14155238886 (sandbox number). */
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
  WHATSAPP_PATH: z
    .string()
    .min(1)
    .default("/whatsapp")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  /** Verify Twilio request signatures. Recommended in production. */
  TWILIO_VALIDATE_SIGNATURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnvConfig(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
