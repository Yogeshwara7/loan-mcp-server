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
  DATAVERSE_LOAN_TABLE: z.string().min(1).default("cr174_loanapplics"),
  DATAVERSE_LOAN_ENTITY: z.string().min(1).default("cr174_loanapplic"),

  OFFICER_NAV_PROPERTY: z.string().min(1).default("cr174_OfficerAssigned"),
  OFFICER_NAME_FIELD: z.string().min(1).default("fullname"),
  OFFICER_ENTITY_SET: z.string().min(1).default("systemusers"),
  OFFICER_EMAIL_FIELD: z.string().min(1).default("internalemailaddress"),

  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),

  // Azure/PaaS injects the port via PORT and requires binding 0.0.0.0.
  HTTP_PORT: z.coerce.number().int().positive().default(Number(process.env.PORT) || 3000),
  HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  MCP_HTTP_PATH: z
    .string()
    .min(1)
    .default("/mcp")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  MCP_API_KEY: z.string().min(1).optional(),
  MCP_CORS_ORIGIN: z.string().min(1).default("*"),

  HUGGINGFACE_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("Qwen/Qwen2.5-72B-Instruct"),
  LLM_BASE_URL: z
    .string()
    .url()
    .default("https://router.huggingface.co/v1")
    .transform((value) => value.replace(/\/+$/, "")),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
  WHATSAPP_PATH: z
    .string()
    .min(1)
    .default("/whatsapp")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
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
