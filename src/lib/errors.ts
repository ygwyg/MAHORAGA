export const ErrorCode = {
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  POLICY_VIOLATION: "POLICY_VIOLATION",
  KILL_SWITCH_ACTIVE: "KILL_SWITCH_ACTIVE",
  INVALID_APPROVAL_TOKEN: "INVALID_APPROVAL_TOKEN",
  MARKET_CLOSED: "MARKET_CLOSED",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ToolError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class MahoragaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "MahoragaError";
  }

  toToolError(): ToolError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: unknown
): MahoragaError {
  return new MahoragaError(code, message, details);
}
