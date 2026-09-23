import { Client } from "pg";
import { migrate } from "../src/db/migrate.ts";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await migrate(client);
} finally {
  await client.end();
}
