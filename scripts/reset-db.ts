import { createMigratedDatabase, dropDatabase } from "../src/db/admin.ts";

// Drops and recreates the local dev database, then applies all migrations.
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
  console.error(`Refusing to reset non-local database at ${url.hostname}.`);
  process.exit(1);
}
const name = url.pathname.slice(1);

await dropDatabase(url.href, name);
await createMigratedDatabase(url.href, name);
