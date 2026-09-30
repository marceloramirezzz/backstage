import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { signInPath } from "@/lib/session-cookie.ts";
import { listProjects } from "@/services/projects.ts";

// Where signing in lands: the User's first Banda, or the welcome screen
// for a User without one.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath());
  const [first] = await listProjects(getPool(), user);
  redirect(first ? `/p/${first.id}` : "/bienvenida");
}
