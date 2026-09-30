export type ServiceErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "invalid_input"
  | "invalid_token"
  | "email_not_verified"
  | "password_already_set"
  | "not_found"
  | "forbidden"
  | "name_taken"
  | "built_in_role"
  | "role_in_use"
  | "owner_protected";

// An expected, user-facing failure of a service call. Callers switch on `code`.
export class ServiceError extends Error {
  override name = "ServiceError";
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
