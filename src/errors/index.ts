/**
 * Reusable, transport-agnostic error hierarchy.
 *
 * The service/tool layers throw `AppError` subclasses. The tool wrapper turns
 * them into clean MCP responses via `toClientJSON()`, never leaking stack
 * traces, tokens or Dataverse logical names to the client.
 */

/** Stable, machine-readable error codes surfaced to MCP clients. */
export enum ErrorCode {
  VALIDATION = "VALIDATION_ERROR",
  LOAN_NOT_FOUND = "LOAN_NOT_FOUND",
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  BAD_REQUEST = "BAD_REQUEST",
  DATAVERSE_UNAVAILABLE = "DATAVERSE_UNAVAILABLE",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

export interface AppErrorOptions {
  /** Human-readable, client-safe message. */
  message: string;
  /** Originating HTTP status code, when applicable. */
  httpStatus?: number;
  /** Whether retrying the operation may succeed. */
  retryable?: boolean;
  /** Underlying cause (never surfaced to the MCP client). */
  cause?: unknown;
  /** Optional structured detail (client-safe) e.g. validation issues. */
  details?: Record<string, unknown>;
}

/** Client-safe representation of an error for a tool response. */
export interface ClientError {
  error: string;
  code: ErrorCode;
  retryable: boolean;
  httpStatus?: number;
  details?: Record<string, unknown>;
}

/** Base class for all application errors. */
export abstract class AppError extends Error {
  public abstract readonly code: ErrorCode;
  public readonly httpStatus: number | undefined;
  public readonly retryable: boolean;
  public readonly details: Record<string, unknown> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.httpStatus = options.httpStatus;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toClientJSON(): ClientError {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
      ...(this.httpStatus !== undefined ? { httpStatus: this.httpStatus } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/** Input validation failure (bad/missing tool arguments). */
export class ValidationError extends AppError {
  public readonly code = ErrorCode.VALIDATION;
  constructor(message: string, details?: Record<string, unknown>) {
    super({ message, httpStatus: 400, retryable: false, ...(details ? { details } : {}) });
  }
}

/** A requested loan (or related record) does not exist. */
export class LoanNotFoundError extends AppError {
  public readonly code = ErrorCode.LOAN_NOT_FOUND;
  constructor(message: string) {
    super({ message, httpStatus: 404, retryable: false });
  }
}

/** Failure acquiring/refreshing an Entra ID token, or a 401 from Dataverse. */
export class AuthenticationError extends AppError {
  public readonly code: ErrorCode;
  constructor(options: AppErrorOptions & { code?: ErrorCode }) {
    super(options);
    this.code = options.code ?? ErrorCode.AUTHENTICATION_FAILED;
  }
}

/** Any error originating from the Dataverse Web API (4xx/5xx/network/timeout). */
export class DataverseError extends AppError {
  public readonly code: ErrorCode;
  constructor(options: AppErrorOptions & { code: ErrorCode }) {
    super(options);
    this.code = options.code;
  }
}

/** Type guard for any application error. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Normalize an unknown thrown value into an `AppError`. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  return new DataverseError({
    code: ErrorCode.UNKNOWN,
    message: "An unexpected error occurred.",
    cause: value,
  });
}
