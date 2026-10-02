// Top-level paths the app itself serves, which a Landing page address can't
// take. Keep in step with the folders under src/app (a test checks it) and
// the files under public/.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "p",
  "bienvenida",
  "crear-cuenta",
  "ingresar",
  "invitacion",
  "verificar",
  "recuperar",
  "restablecer",
  "api",
  "brand",
  "favicon",
  "robots",
  "sitemap",
]);
