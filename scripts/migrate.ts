import { migrateDatabase } from "../src/db/admin.ts";

await migrateDatabase(process.env.DATABASE_URL!);
