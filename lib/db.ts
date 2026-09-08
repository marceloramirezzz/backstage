import { Pool } from "pg";

// Reused across hot reloads in dev so we don't open a new pool on every
// edit — same trick Prisma's client singleton used, just for a plain pg.Pool.
declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

export const db =
  global.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.pgPool = db;
}
