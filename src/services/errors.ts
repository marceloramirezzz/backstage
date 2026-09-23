export type ServiceErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "invalid_input"
  | "invalid_token"
  | "email_not_verified";

// An expected, user-facing failure of a service call. Callers switch on `code`.
export class ServiceError extends Error {
  override name = "ServiceError";
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
