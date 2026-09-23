import { Client } from "pg";
import { migrate } from "../src/db/migrate.ts";

// Drops and recreates the local dev database, then applies all migrations.
const url = new URL(process.env.DATABASE_URL!);
const dbName = url.pathname.slice(1);

const admin = new Client({
  connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).href,
});
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
} finally {
  await admin.end();
}

const client = new Client({ connectionString: url.href });
await client.connect();
try {
  await migrate(client);
} finally {
  await client.end();
}
