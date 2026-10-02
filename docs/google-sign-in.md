# Google sign-in

"Continuar con Google" on `/ingresar` and `/crear-cuenta` links to `/ingresar/google`, which redirects to Google with [Arctic](https://arcticjs.dev) (state + PKCE; the state, verifier and return path wait in short-lived cookies scoped to `/ingresar/google`). Google returns to `/ingresar/google/callback`, which calls `finishGoogleSignIn` (`src/services/google-sign-in.ts`) → `signInWithGoogle`, then sets the same `session` cookie as password sign-in and goes to the return path (`volver`).

A cancelled or failed flow returns to `/ingresar?google=<cancelled|failed|unverified|taken>`, which shows the matching Spanish message (`src/lib/google-errors.ts`).

Needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Run `scripts/setup-google.sh` to create the OAuth client and write them to `.env`; set them on the production host too. Each address Backstage is served from needs `<origin>/ingresar/google/callback` among the client's authorized redirect URIs.

Tests cover the flow with a fake `exchange`, so they never reach Google.
