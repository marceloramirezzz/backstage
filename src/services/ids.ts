const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guards id lookups, so a malformed id reads as "not found" rather than a
// Postgres cast error.
export const isUuid = (id: string) => UUID_PATTERN.test(id);
