// The Banda's sections, in sidebar order. A section with `requires` is hidden
// from Members lacking that permission. `path` is the URL segment under
// /p/[projectId].
export const SECTIONS = [
  { path: "resumen", label: "Inicio", requires: null },
  { path: "calendario", label: "Calendario", requires: null },
  { path: "solicitudes", label: "Solicitudes", requires: "manageBookings" },
  { path: "repertorio", label: "Repertorio", requires: null },
  { path: "setlists", label: "Setlists", requires: null },
  { path: "reparto", label: "Reparto", requires: "administer" },
  { path: "miembros", label: "Miembros", requires: null },
  { path: "pagina-publica", label: "Página pública", requires: "administer" },
  { path: "contrato", label: "Contrato", requires: "administer" },
] as const;

export type SectionPath = (typeof SECTIONS)[number]["path"];

// The Banda's home screen.
export const HOME_SECTION: SectionPath = "resumen";
