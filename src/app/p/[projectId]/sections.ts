// The Banda's sections, in sidebar order. Admin-only ones are hidden from
// everyone else. `path` is the URL segment under /p/[projectId].
export const SECTIONS = [
  { path: "resumen", label: "Inicio", adminOnly: false },
  { path: "calendario", label: "Calendario", adminOnly: false },
  { path: "repertorio", label: "Repertorio", adminOnly: false },
  { path: "setlists", label: "Setlists", adminOnly: false },
  { path: "reparto", label: "Reparto", adminOnly: true },
  { path: "miembros", label: "Miembros", adminOnly: false },
  { path: "pagina-publica", label: "Página pública", adminOnly: true },
] as const;

export type SectionPath = (typeof SECTIONS)[number]["path"];

// The Banda's home screen.
export const HOME_SECTION: SectionPath = "resumen";
