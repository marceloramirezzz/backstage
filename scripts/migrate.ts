import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
`);

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const applied = new Set(rows.map((row) => row.filename));

    const pending = readdirSync(MIGRATIONS_DIR)
      .filter((filename) => filename.endsWith(".sql"))
      .sort()
      .filter((filename) => !applied.has(filename));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const filename of pending) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");

      console.log(`Applying ${filename}...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Failed to apply ${filename}, rolled back.`);
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

main();
