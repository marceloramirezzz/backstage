import { ServiceError } from "@/services/errors.ts";

export type ErrorMessages = Partial<Record<ServiceError["code"], string>>;

// The message for a failed call, or a rethrow when it isn't expected.
export function errorMessage(err: unknown, messages: ErrorMessages): string {
  const error = err instanceof ServiceError && messages[err.code];
  if (error) return error;
  throw err;
}
