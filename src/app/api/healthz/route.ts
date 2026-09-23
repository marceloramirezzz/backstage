import { getPool } from "@/db/pool.ts";

// Liveness + database reachability, for the CI image test and future hosts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "db_unreachable" }, { status: 503 });
  }
}
