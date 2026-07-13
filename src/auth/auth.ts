/**
 * Entra ID (Azure AD) authentication using the OAuth 2.0 Client Credentials
 * flow via MSAL Node.
 *
 * MSAL maintains an in-memory token cache; this provider adds a proactive
 * expiry-skew refresh, coalesces concurrent acquisitions, and normalizes
 * failures into `AuthenticationError`.
 */
import {
  ConfidentialClientApplication,
  type Configuration,
  type LogLevel,
} from "@azure/msal-node";

import type { AppConfig } from "../config/index.js";
import { AuthenticationError } from "../errors/index.js";
import { childLogger, type Logger } from "../utils/logger.js";

/** Refresh a token this many milliseconds before its actual expiry. */
const EXPIRY_SKEW_MS = 60_000;
/** Fallback token lifetime if MSAL does not report an expiry. */
const FALLBACK_LIFETIME_MS = 55 * 60_000;

/** Abstraction so consumers depend on the capability, not the implementation. */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export class EntraAuthProvider implements TokenProvider {
  private readonly client: ConfidentialClientApplication;
  private readonly scope: string;
  private readonly log: Logger;

  private cachedToken: string | null = null;
  private cachedTokenExpiresAt = 0;
  private inFlight: Promise<string> | null = null;

  constructor(config: AppConfig) {
    this.scope = config.dataverse.scope;
    this.log = childLogger("auth");

    const msalConfig: Configuration = {
      auth: {
        clientId: config.entra.clientId,
        authority: config.entra.authority,
        clientSecret: config.entra.clientSecret,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level: LogLevel, message: string) => {
            this.log.debug({ msalLevel: level }, message);
          },
          piiLoggingEnabled: false,
        },
      },
    };

    this.client = new ConfidentialClientApplication(msalConfig);
  }

  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.cachedTokenExpiresAt - EXPIRY_SKEW_MS) {
      this.log.debug("Reusing cached access token");
      return this.cachedToken;
    }

    // Coalesce concurrent acquisitions so we only call the token endpoint once.
    this.inFlight ??= this.acquireToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async acquireToken(): Promise<string> {
    const started = Date.now();
    try {
      this.log.debug("Acquiring Entra ID access token (client credentials)");

      const result = await this.client.acquireTokenByClientCredential({
        scopes: [this.scope],
      });

      if (!result?.accessToken) {
        throw new AuthenticationError({
          message: "Authentication failed: token endpoint returned no access token.",
        });
      }

      this.cachedToken = result.accessToken;
      this.cachedTokenExpiresAt = result.expiresOn
        ? result.expiresOn.getTime()
        : Date.now() + FALLBACK_LIFETIME_MS;

      this.log.info(
        {
          durationMs: Date.now() - started,
          expiresAt: new Date(this.cachedTokenExpiresAt).toISOString(),
          fromCache: result.fromCache ?? false,
        },
        "Access token acquired",
      );

      return this.cachedToken;
    } catch (error) {
      this.cachedToken = null;
      this.cachedTokenExpiresAt = 0;

      if (error instanceof AuthenticationError) throw error;

      this.log.error({ durationMs: Date.now() - started, err: error }, "Token acquisition failed");
      throw new AuthenticationError({
        message:
          "Authentication failed: unable to acquire an Entra ID access token. " +
          "Verify TENANT_ID, CLIENT_ID and CLIENT_SECRET.",
        cause: error,
      });
    }
  }
}
