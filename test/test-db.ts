import { randomUUID } from "node:crypto";
import pg from "pg";
import { createMigratedDatabase, dropDatabase, urlForDatabase } from "../src/db/admin.ts";

export interface TestDb {
  pool: pg.Pool;
  close(): Promise<void>;
}

// Creates a throwaway database on the same server as DATABASE_URL, with all
// migrations applied. One per call, so test files never share state.
export async function createTestDb(): Promise<TestDb> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is not set (see .env)");
  const name = `backstage_test_${randomUUID().replaceAll("-", "")}`;

  await createMigratedDatabase(baseUrl, name, () => {});

  const pool = new pg.Pool({ connectionString: urlForDatabase(baseUrl, name) });
  return {
    pool,
    async close() {
      await pool.end();
      await dropDatabase(baseUrl, name);
    },
  };
}
