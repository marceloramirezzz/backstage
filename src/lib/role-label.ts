import type { RoleKind } from "@/services/permissions.ts";

// A Role as the UI names it. The built-in Member Role is stored in English,
// like every term in code; the interface calls it Miembro.
export function roleLabel(kind: RoleKind, name: string): string {
  return kind === "member" ? "Miembro" : name;
}
