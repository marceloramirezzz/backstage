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
  | "owner_protected"
  | "invitation_expired"
  | "invitation_revoked"
  | "invitation_accepted"
  | "already_member"
  | "already_invited"
  | "song_in_use";

// An expected, user-facing failure of a service call. Callers switch on `code`.
export class ServiceError extends Error {
  override name = "ServiceError";
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";

// Whether a Postgres error is `code` on the named constraint.
export function isViolation(err: unknown, code: string, constraint: string): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr.code === code && pgErr.constraint === constraint;
}
