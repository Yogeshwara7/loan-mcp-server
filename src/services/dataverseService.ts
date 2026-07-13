/**
 * Reusable Dataverse Web API client (repository/service pattern).
 *
 * Responsibilities:
 *   - Own a single configured Axios instance (base URL, timeout, headers).
 *   - Inject a bearer token on every request via the injected TokenProvider.
 *   - Transparently retry once on a 401 by forcing a token refresh.
 *   - Expose reusable query methods so tools never duplicate HTTP code.
 *   - Translate all failure modes into structured `AppError`s.
 *
 * The service works in RAW records; translation to business models happens in
 * the model mappers so the MCP boundary never sees logical names.
 */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import type { TokenProvider } from "../auth/auth.js";
import type { AppConfig } from "../config/index.js";
import {
  AuthenticationError,
  DataverseError,
  ErrorCode,
  LoanNotFoundError,
  ValidationError,
  isAppError,
} from "../errors/index.js";
import type { ChoiceOption, DataverseLoanRecord } from "../models/loan.js";
import { childLogger, type Logger } from "../utils/logger.js";

/** OData query options for a collection request. */
export interface QueryOptions {
  select?: readonly string[];
  expand?: string;
  filter?: string;
  top?: number;
  orderBy?: string;
}

interface CollectionResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retriedAfterAuthRefresh?: boolean;
}

/** Guard against runaway pagination loops. */
const MAX_PAGES = 50;

export class DataverseService {
  private readonly http: AxiosInstance;
  private readonly config: AppConfig;
  private readonly tokenProvider: TokenProvider;
  private readonly log: Logger;
  /** Cache of resolved choice options keyed by attribute logical name. */
  private readonly choiceCache = new Map<string, ChoiceOption[]>();

  constructor(config: AppConfig, tokenProvider: TokenProvider) {
    this.config = config;
    this.tokenProvider = tokenProvider;
    this.log = childLogger("dataverse");

    this.http = axios.create({
      baseURL: config.dataverse.apiBaseUrl,
      timeout: config.http.timeoutMs,
      headers: {
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer:
          'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });

    this.registerInterceptors();
  }

  private registerInterceptors(): void {
    this.http.interceptors.request.use(async (request) => {
      const token = await this.tokenProvider.getAccessToken();
      request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    });

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as RetryableRequestConfig | undefined;
        if (
          error.response?.status === 401 &&
          original &&
          !original._retriedAfterAuthRefresh
        ) {
          this.log.warn("Received 401; forcing token refresh and retrying once");
          original._retriedAfterAuthRefresh = true;
          const token = await this.tokenProvider.getAccessToken();
          original.headers.set("Authorization", `Bearer ${token}`);
          return this.http.request(original);
        }
        return Promise.reject(error);
      },
    );
  }

  // -------------------------------------------------------------------------
  // Core reusable query primitives
  // -------------------------------------------------------------------------

  /** Low-level GET returning parsed data, normalizing errors to AppError. */
  private async httpGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.http.get<T>(url, config);
      return response.data;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Execute a collection query against any entity set, following server-driven
   * pagination. This is the single place raw list HTTP is performed.
   */
  public async executeQuery<T = DataverseLoanRecord>(
    entitySet: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    const started = Date.now();
    const params = this.buildParams(options);
    this.log.debug({ entitySet, filter: options.filter }, "Executing Dataverse query");

    const results: T[] = [];
    let data = await this.httpGet<CollectionResponse<T>>(`/${entitySet}`, { params });
    results.push(...(data.value ?? []));

    let pages = 1;
    while (data["@odata.nextLink"] && pages < MAX_PAGES) {
      // nextLink is an absolute URL that already encodes the query.
      data = await this.httpGet<CollectionResponse<T>>(data["@odata.nextLink"]);
      results.push(...(data.value ?? []));
      pages += 1;
    }

    this.log.info(
      { entitySet, count: results.length, pages, durationMs: Date.now() - started },
      "Dataverse query completed",
    );
    return results;
  }

  private buildParams(options: QueryOptions): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    if (options.select?.length) params["$select"] = options.select.join(",");
    if (options.expand) params["$expand"] = options.expand;
    if (options.filter) params["$filter"] = options.filter;
    if (options.top) params["$top"] = options.top;
    if (options.orderBy) params["$orderby"] = options.orderBy;
    return params;
  }

  /** Standard select + officer expand used for full loan records. */
  private loanQueryOptions(filter?: string, top?: number): QueryOptions {
    const { officer, selectColumns } = this.config.dataverse;
    return {
      select: selectColumns,
      expand: `${officer.navigationProperty}($select=${officer.nameField})`,
      ...(filter !== undefined ? { filter } : {}),
      ...(top !== undefined ? { top } : {}),
    };
  }

  /** Quote and escape a value as an OData string literal. */
  private odataString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private queryLoans(filter?: string, top?: number): Promise<DataverseLoanRecord[]> {
    const orderBy = `${this.config.dataverse.columns.createdDate} desc`;
    return this.executeQuery<DataverseLoanRecord>(this.config.dataverse.entitySet, {
      ...this.loanQueryOptions(filter, top),
      orderBy,
    });
  }

  // -------------------------------------------------------------------------
  // Loan finders
  // -------------------------------------------------------------------------

  /** Find a single loan by reference number, or null if none exists. */
  public async findLoanByReference(
    referenceNumber: string,
  ): Promise<DataverseLoanRecord | null> {
    const { columns } = this.config.dataverse;
    const filter = `${columns.referenceNumber} eq ${this.odataString(referenceNumber)}`;
    const records = await this.queryLoans(filter, 1);
    return records[0] ?? null;
  }

  /** Find a single loan by reference number, throwing if it does not exist. */
  public async getLoanByReference(
    referenceNumber: string,
  ): Promise<DataverseLoanRecord> {
    const record = await this.findLoanByReference(referenceNumber);
    if (!record) {
      throw new LoanNotFoundError(
        `No loan found with reference number '${referenceNumber}'.`,
      );
    }
    return record;
  }

  public findLoansByPhone(phoneNumber: string): Promise<DataverseLoanRecord[]> {
    const { columns } = this.config.dataverse;
    return this.queryLoans(`${columns.phoneNumber} eq ${this.odataString(phoneNumber)}`);
  }

  public findLoansByEmail(applicantEmail: string): Promise<DataverseLoanRecord[]> {
    const { columns } = this.config.dataverse;
    return this.queryLoans(`${columns.applicantEmail} eq ${this.odataString(applicantEmail)}`);
  }

  public findLoansByOfficerName(officerName: string): Promise<DataverseLoanRecord[]> {
    const { officer } = this.config.dataverse;
    // Filter on the expanded lookup's name attribute.
    const filter = `${officer.navigationProperty}/${officer.nameField} eq ${this.odataString(officerName)}`;
    return this.queryLoans(filter);
  }

  /** Find loans by status label (resolved to its option value via metadata). */
  public async findLoansByStatusLabel(
    statusLabel: string,
  ): Promise<DataverseLoanRecord[]> {
    const { columns } = this.config.dataverse;
    const value = await this.resolveChoiceValue(columns.status, statusLabel);
    return this.queryLoans(`${columns.status} eq ${value}`);
  }

  /** All loans (used for portfolio analytics). */
  public findAllLoans(): Promise<DataverseLoanRecord[]> {
    return this.queryLoans();
  }

  // -------------------------------------------------------------------------
  // Choice / option-set metadata
  // -------------------------------------------------------------------------

  /** Fetch (and cache) the options for a choice column. */
  public async getChoiceOptions(attributeLogicalName: string): Promise<ChoiceOption[]> {
    const cached = this.choiceCache.get(attributeLogicalName);
    if (cached) return cached;

    const { entityLogicalName } = this.config.dataverse;
    const url =
      `/EntityDefinitions(LogicalName='${entityLogicalName}')` +
      `/Attributes(LogicalName='${attributeLogicalName}')` +
      `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
      `?$select=LogicalName&$expand=OptionSet($select=Options)`;

    interface OptionMetadata {
      Value: number;
      Label?: { UserLocalizedLabel?: { Label?: string } | null } | null;
    }
    interface PicklistMetadata {
      OptionSet?: { Options?: OptionMetadata[] } | null;
    }

    const data = await this.httpGet<PicklistMetadata>(url);
    const options: ChoiceOption[] = (data.OptionSet?.Options ?? []).map((o) => ({
      value: o.Value,
      label: o.Label?.UserLocalizedLabel?.Label ?? String(o.Value),
    }));

    this.choiceCache.set(attributeLogicalName, options);
    this.log.debug(
      { attribute: attributeLogicalName, count: options.length },
      "Loaded choice options",
    );
    return options;
  }

  /** Resolve a choice label to its integer option value (case-insensitive). */
  public async resolveChoiceValue(
    attributeLogicalName: string,
    label: string,
  ): Promise<number> {
    const options = await this.getChoiceOptions(attributeLogicalName);
    const match = options.find(
      (o) => o.label.toLowerCase() === label.trim().toLowerCase(),
    );
    if (!match) {
      throw new ValidationError(
        `Unknown value "${label}". Valid values are: ${options
          .map((o) => o.label)
          .join(", ")}.`,
        { validValues: options.map((o) => o.label) },
      );
    }
    return match.value;
  }

  // -------------------------------------------------------------------------
  // Officer lookup
  // -------------------------------------------------------------------------

  /** Fetch a single officer (systemuser) by id, or null if not found. */
  public async getOfficer(
    officerId: string,
  ): Promise<{ id: string; name: string; email: string } | null> {
    const { officer } = this.config.dataverse;
    try {
      const data = await this.httpGet<Record<string, unknown>>(
        `/${officer.entitySet}(${officerId})`,
        { params: { $select: `${officer.nameField},${officer.emailField}` } },
      );
      return {
        id: officerId,
        name: String(data[officer.nameField] ?? ""),
        email: String(data[officer.emailField] ?? ""),
      };
    } catch (error) {
      if (isAppError(error) && error.httpStatus === 404) return null;
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Error normalization
  // -------------------------------------------------------------------------

  private normalizeError(error: unknown): Error {
    if (isAppError(error)) return error;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>;

      if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
        this.log.error({ err: axiosError.message }, "Dataverse request timed out");
        return new DataverseError({
          code: ErrorCode.NETWORK_ERROR,
          message: "The request to Dataverse timed out. Please try again shortly.",
          retryable: true,
          cause: axiosError,
        });
      }

      if (!axiosError.response) {
        this.log.error({ err: axiosError.message }, "Network error contacting Dataverse");
        return new DataverseError({
          code: ErrorCode.NETWORK_ERROR,
          message: "Unable to reach Dataverse (network error). Please try again shortly.",
          retryable: true,
          cause: axiosError,
        });
      }

      const status = axiosError.response.status;
      const detail = axiosError.response.data?.error?.message;

      switch (status) {
        case 400:
          return new DataverseError({
            code: ErrorCode.BAD_REQUEST,
            message:
              "The Dataverse query was rejected (bad request). Verify table and column configuration.",
            httpStatus: 400,
            cause: detail,
          });
        case 401:
          return new AuthenticationError({
            code: ErrorCode.UNAUTHORIZED,
            message:
              "Dataverse rejected the access token (401). It may be expired or the application user misconfigured.",
            httpStatus: 401,
            retryable: true,
            cause: detail,
          });
        case 403:
          return new DataverseError({
            code: ErrorCode.FORBIDDEN,
            message:
              "Access to the requested Dataverse data is forbidden (403). Check the application user's security roles.",
            httpStatus: 403,
            cause: detail,
          });
        case 404:
          return new DataverseError({
            code: ErrorCode.UNKNOWN,
            message: "The requested Dataverse resource was not found (404).",
            httpStatus: 404,
            cause: detail,
          });
        default:
          if (status >= 500) {
            this.log.error({ status, err: detail }, "Dataverse server error");
            return new DataverseError({
              code: ErrorCode.DATAVERSE_UNAVAILABLE,
              message: "Dataverse is currently unavailable (server error). Please try again shortly.",
              httpStatus: status,
              retryable: true,
              cause: detail,
            });
          }
          return new DataverseError({
            code: ErrorCode.UNKNOWN,
            message: `Unexpected error from Dataverse (HTTP ${status}).`,
            httpStatus: status,
            cause: detail,
          });
      }
    }

    this.log.error({ err: error }, "Unexpected error in Dataverse service");
    return new DataverseError({
      code: ErrorCode.UNKNOWN,
      message: "An unexpected error occurred while retrieving loan data.",
      cause: error,
    });
  }
}
