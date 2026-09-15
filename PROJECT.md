# Backstage

## What this is

A tool for a band to manage its gigs: repertoire, setlists, event scheduling, pay/expense tracking with configurable payout splits, and an optional public landing page. One workspace ("Project") per band.

## Status as of 2026-09-11

Repo was fully wiped earlier this session (a prior agent had hand-written a raw-SQL schema and app code the owner never wrote or understood — kept as debt otherwise). Since the wipe, the owner re-derived the domain model **from scratch, in a fresh conversation**, deliberately not inheriting the old model. That old model (Owner/Fee/Payout/Public Visitor terms) is **no longer accurate** — see `CONTEXT.md` for the current one.

Domain modeling is done — `CONTEXT.md` and `docs/adr/` are up to date. **No code has been written yet.** Next step is picking the first concrete piece (e.g. Project + Membership + Role tables) and building it — implementation hasn't started this session.

**Tech stack (reaffirmed 2026-09-11):** Next.js App Router, TypeScript, Tailwind, raw SQL via `pg` (no ORM), private GitHub repo. Code lives under `src/` (e.g. `src/app/`) to keep it separate from root-level docs (`PROJECT.md`, `CONTEXT.md`, `docs/adr/`).

## Domain model

See `CONTEXT.md` for the full glossary (Project, Member/Role, Song, Selection, Setlist, Event, Expense, Payout Split, Dashboard, Landing page) and `docs/adr/` for the two recorded decisions (net-basis payout split; hybrid fixed+custom role model).

## Future: DevOps practice track (deliberately deferred)

Owner also wants to use this project to build a DevOps portfolio/practice separate from the domain-modeling/backend learning goal above. Decision (2026-09-15): **finish the domain/backend build first**, then take on DevOps as its own later phase — don't interleave them, since the schema/app will keep changing shape during the backend build, and splitting focus slows both tracks down.

Exception: a trivial `docker-compose` (app + Postgres only) is fine to add early, purely to remove local-dev friction — this doesn't count as "starting the DevOps track."

When that phase starts, the assessed plan was:

1. **Docker** — containerize app + Postgres (worth it, right-sized for this app).
2. **CI** then **CD** via GitHub Actions — test/lint/build, then build+push image and deploy on merge (high hire-relevance, app is simple enough to actually finish).
3. **Terraform** — provision one small cloud environment (one VM/managed service + networking + DNS), kept deliberately small in scope (no multi-env workspaces). Plus **Nginx** in front as reverse proxy/TLS termination.
4. **Basic monitoring** — health checks, container/app metrics, logs. Scoped to "starter" observability, not a full enterprise stack (no tracing/alerting/on-call needed for a single-band tool).
5. **Kubernetes** — last, and explicitly framed as a separate learning lab ("redeployed this app on K8s to demonstrate orchestration skills"), not a replacement for the simpler Terraform-provisioned deploy from step 3. This app has no real orchestration problem (one service, one DB), so K8s here is for practicing K8s mechanics, not because the app needs it.

Should get its own scope doc (e.g. `docs/devops/`) when it starts, kept separate from the domain `CONTEXT.md`/ADRs.

## Still open / not yet modeled

- Everything below Repertoire/Setlists/Events/Payouts/Landing-page is unmodeled — no equipment checklists, audit log, or calendar sync were discussed in this pass (may not even be part of the current idea; revisit if they come up).
- Field-level schema (actual table/column shapes) is intentionally not yet designed — to be built part-by-part, with explanation, when each piece is actually implemented, not grilled exhaustively up front.

## Working style for whoever picks this up

- **Nothing in this file, `CONTEXT.md`, or the ADRs is absolute.** They record where the conversation landed, not permanent law — any of it can and should change if a future conversation reaches a better answer. Don't defend prior decisions as settled just because they're written down; treat them as the current best guess, open to challenge.
- Owner writes all application code (including migrations) **by hand themselves** — never write feature code on the owner's behalf unless explicitly asked. Guide and challenge, don't implement.
- Owner is rusty at programming and explicitly wants to relearn by doing: **explain every step, every section, every file as we build it — don't skip explanations for the sake of speed.** This applies to all future implementation work.
- Grill rigorously on definitions and edge cases; don't soften because the owner is a beginner. Nothing raised in conversation is settled just because it was written down before — always confirm against what the owner actually says now, not inherited assumptions.
- Owner uses Neovim (`nvim <file>`) for manual edits.
- Owner is new to Git/GitHub team workflow and wants active coaching throughout: proactively tell them when to create a branch, when to commit (and suggest a Conventional Commits-style message), when to open a PR (and help write the description), when to review before merging, and when to close/merge/delete a branch — don't wait to be asked. Explain *why* at each step, not just the command. This is a standing instruction for the whole project, not a one-off.
- Keep `CONTEXT.md` (glossary only, no implementation details) and `docs/adr/` (hard-to-reverse, non-obvious, real-tradeoff decisions) up to date going forward.
- When the owner is about to stop a coding session (or clear context), offer `/handoff` to snapshot implementation-in-progress state (current file, what's next) — domain model already persists via `CONTEXT.md`/ADRs, but in-progress code state doesn't survive a `/clear` otherwise.
