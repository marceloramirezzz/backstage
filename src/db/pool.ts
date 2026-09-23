import pg from "pg";

let pool: pg.Pool | undefined;

// The app's shared pool, created on first use so importing this module
// never needs DATABASE_URL (e.g. during `next build`).
export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}
