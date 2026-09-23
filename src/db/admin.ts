import pg from "pg";
import { migrate } from "./migrate.ts";

export function urlForDatabase(baseUrl: string, name: string): string {
  return Object.assign(new URL(baseUrl), { pathname: `/${name}` }).href;
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function withAdmin<T>(baseUrl: string, fn: (admin: pg.Client) => Promise<T>) {
  const admin = new pg.Client({ connectionString: urlForDatabase(baseUrl, "postgres") });
  await admin.connect();
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

export const dropDatabase = (baseUrl: string, name: string) =>
  withAdmin(baseUrl, (a) => a.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`));

// Creates the database, then applies every migration to it.
export async function createMigratedDatabase(
  baseUrl: string,
  name: string,
  log: (message: string) => void = console.log,
): Promise<void> {
  await withAdmin(baseUrl, (a) => a.query(`CREATE DATABASE ${quote(name)}`));
  try {
    await migrateDatabase(urlForDatabase(baseUrl, name), log);
  } catch (err) {
    await dropDatabase(baseUrl, name);
    throw err;
  }
}

export async function migrateDatabase(
  url: string,
  log: (message: string) => void = console.log,
): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(client, log);
  } finally {
    await client.end();
  }
}
