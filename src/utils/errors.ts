/**
 * Typed error hierarchy used across TokenSmith.
 *
 * Using discriminable classes rather than error codes keeps CLI error handling
 * readable (`instanceof NotFoundError`) while still giving us structured exit
 * codes for scripting.
 */
export class TokenSmithError extends Error {
  public readonly code: string;
  public readonly exitCode: number;
  public readonly details?: unknown;

  public constructor(
    code: string,
    message: string,
    opts: { exitCode?: number; details?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = opts.exitCode ?? 1;
    this.details = opts.details;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

export class ConfigError extends TokenSmithError {
  public constructor(message: string, details?: unknown) {
    super("E_CONFIG", message, { exitCode: 78, details });
  }
}

export class ValidationError extends TokenSmithError {
  public constructor(message: string, details?: unknown) {
    super("E_VALIDATION", message, { exitCode: 64, details });
  }
}

export class NotFoundError extends TokenSmithError {
  public constructor(entity: string, key: string) {
    super("E_NOT_FOUND", `${entity} not found: ${key}`, { exitCode: 65 });
  }
}

export class ConflictError extends TokenSmithError {
  public constructor(message: string) {
    super("E_CONFLICT", message, { exitCode: 66 });
  }
}

export class DatabaseError extends TokenSmithError {
  public constructor(message: string, cause?: unknown) {
    super("E_DB", message, { exitCode: 74, cause });
  }
}
