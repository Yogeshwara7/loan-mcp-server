/**
 * Centralized application configuration. Importing `appConfig` triggers env
 * validation exactly once. All other modules depend on this typed object rather
 * than reading environment variables or hardcoding values.
 */
import { buildDataverseConfig } from "./dataverse.js";
import { loadEnvConfig } from "./env.js";
import {
  DefaultRequiredDocuments,
  RequiredDocumentsByLoanType,
} from "./documents.js";
import { ToolNames } from "./tools.js";

function buildConfig() {
  const env = loadEnvConfig();

  return {
    entra: {
      tenantId: env.TENANT_ID,
      clientId: env.CLIENT_ID,
      clientSecret: env.CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${env.TENANT_ID}`,
    },
    dataverse: buildDataverseConfig(env),
    http: {
      timeoutMs: env.HTTP_TIMEOUT_MS,
    },
    server: {
      port: env.HTTP_PORT,
      host: env.HTTP_HOST,
      path: env.MCP_HTTP_PATH,
      apiKey: env.MCP_API_KEY,
      corsOrigin: env.MCP_CORS_ORIGIN,
    },
    llm: {
      apiKey: env.HUGGINGFACE_API_KEY,
      model: env.LLM_MODEL,
      baseUrl: env.LLM_BASE_URL,
      timeoutMs: env.LLM_TIMEOUT_MS,
    },
    whatsapp: {
      path: env.WHATSAPP_PATH,
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_WHATSAPP_FROM,
      validateSignature: env.TWILIO_VALIDATE_SIGNATURE,
    },
    logging: {
      level: env.LOG_LEVEL,
    },
    tools: {
      names: ToolNames,
    },
    documents: {
      byLoanType: RequiredDocumentsByLoanType,
      fallback: DefaultRequiredDocuments,
    },
  } as const;
}

export type AppConfig = ReturnType<typeof buildConfig>;

/** Singleton, validated configuration for the whole process. */
export const appConfig: AppConfig = buildConfig();

// Re-export commonly used constants/types for convenience.
export { LoanColumns, StatusLabels, ChoiceColumnKeys } from "./dataverse.js";
export type {
  LoanColumnKey,
  StatusKey,
  DataverseConfig,
} from "./dataverse.js";
export { ToolNames } from "./tools.js";
