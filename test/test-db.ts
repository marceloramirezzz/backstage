import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "../src/db/migrate.ts";

export interface TestDb {
  pool: pg.Pool;
  close(): Promise<void>;
}

// Creates a throwaway database on the same server as DATABASE_URL, with all
// migrations applied. One per call, so test files never share state.
export async function createTestDb(): Promise<TestDb> {
  const base = new URL(process.env.DATABASE_URL!);
  const name = `backstage_test_${randomUUID().replaceAll("-", "")}`;
  const urlFor = (db: string) => Object.assign(new URL(base), { pathname: `/${db}` }).href;

  const admin = new pg.Client({ connectionString: urlFor("postgres") });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);

  const client = new pg.Client({ connectionString: urlFor(name) });
  await client.connect();
  const log = console.log;
  console.log = () => {};
  try {
    await migrate(client);
  } catch (err) {
    await client.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    throw err;
  } finally {
    console.log = log;
  }
  await client.end();

  const pool = new pg.Pool({ connectionString: urlFor(name) });
  return {
    pool,
    async close() {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}
