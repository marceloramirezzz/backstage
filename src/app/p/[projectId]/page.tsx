import { redirect } from "next/navigation";
import { HOME_SECTION } from "./sections.ts";

export default async function ProjectHome({ params }: PageProps<"/p/[projectId]">) {
  const { projectId } = await params;
  redirect(`/p/${projectId}/${HOME_SECTION}`);
}
