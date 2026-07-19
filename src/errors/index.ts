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
  message: string;
  httpStatus?: number;
  retryable?: boolean;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export interface ClientError {
  error: string;
  code: ErrorCode;
  retryable: boolean;
  httpStatus?: number;
  details?: Record<string, unknown>;
}

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

export class ValidationError extends AppError {
  public readonly code = ErrorCode.VALIDATION;
  constructor(message: string, details?: Record<string, unknown>) {
    super({ message, httpStatus: 400, retryable: false, ...(details ? { details } : {}) });
  }
}

export class LoanNotFoundError extends AppError {
  public readonly code = ErrorCode.LOAN_NOT_FOUND;
  constructor(message: string) {
    super({ message, httpStatus: 404, retryable: false });
  }
}

export class AuthenticationError extends AppError {
  public readonly code: ErrorCode;
  constructor(options: AppErrorOptions & { code?: ErrorCode }) {
    super(options);
    this.code = options.code ?? ErrorCode.AUTHENTICATION_FAILED;
  }
}

export class DataverseError extends AppError {
  public readonly code: ErrorCode;
  constructor(options: AppErrorOptions & { code: ErrorCode }) {
    super(options);
    this.code = options.code;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  return new DataverseError({
    code: ErrorCode.UNKNOWN,
    message: "An unexpected error occurred.",
    cause: value,
  });
}
