# Backstage

## What this is

A SaaS for managing musical bands/acts: repertoire, setlists, gig scheduling, per-gig profit-sharing between bandmates, equipment checklists, and a public promotional page — one workspace ("Project") per band.

## Status as of this restart (2026-09-11)

Everything except this file was deleted deliberately. A previous session/agent bootstrapped a Next.js app and hand-wrote a raw-SQL schema on the owner's behalf, migrating away from an earlier Prisma attempt — the owner never wrote or fully understood any of that code, so it was wiped rather than kept as debt. **The owner is writing all application code themselves this time, from scratch, to actually learn it.** A future session should guide/explain/challenge, not write feature code unless explicitly asked.

**Nothing about tech stack is settled by inheritance.** Next.js App Router, TypeScript, Tailwind, raw SQL via `pg` (no ORM), no `src/` dir, private GitHub repo — these were prior choices the owner didn't necessarily understand or actively choose. Treat them as open again unless the owner reaffirms them, not as settled just because they were there before.

## Domain model (settled via real conversation — treat as correct, resume from here)

**Project**: A band/act's workspace — the tenant boundary. Owns Songs, Setlists, Events, Memberships.

**Owner**: The single user ultimately accountable for a Project. Always a Member with ADMIN Role, but holds powers no ADMIN has: deleting the Project, transferring ownership, changing billing. Ownership is transferable; outgoing Owner keeps ADMIN by default. No one but the Owner may remove/downgrade the Owner's own Membership — requires a transfer first. "Owner without Membership" must be an invalid state (both rows written atomically at Project creation).

**Member / Membership**: A user's association with one Project, carrying exactly one Role. No Membership row = no standing in that Project at all.

**Role**: ADMIN / EDITOR / VIEWER. Scoped to one Project only — same user can hold different Roles in different Projects. An authorization tier, not a job title or instrument.

**Event**: Something on the Project's calendar — date, location, duration. Has a Type (Gig / Rehearsal / Studio Session / Other) and a Status (Pendiente / Confirmado / Cancelado). *(Type doesn't exist in any schema yet — this was decided in conversation but never migrated before the wipe.)*

**Gig**: An Event of Type "Gig" — a paying public performance. Only Confirmado Gigs are eligible for public display. Rehearsals/Studio Sessions are Events but never public.

**Fee**: What a client pays the Project for a Gig. Project-wide visible info, distinct from Payout.

**Payout**: One Member's individual share of a Gig's Fee. Private — visible only to ADMIN/Owner. A VIEWER may see a *dynamically computed* sum of Payouts for a Gig, never the per-Member breakdown. Never stored as a separate "total_revenue" column — always derived from summing payout rows, to avoid a second source of truth that can drift.

**Public Visitor**: Anonymous, unauthenticated viewer of a Project's public page. Explicitly NOT the same concept as a VIEWER Member — different permission path entirely, never routed through Member permission logic. Shown: Project name/bio, upcoming/past Confirmado Gigs, the Active Setlist. Never shown: song attachments/chords/lyrics, Rehearsals/Studio Sessions, equipment, any Fee/Payout data.

**Active Setlist**: The Setlist attached to the Project's next upcoming Confirmado Gig; if none scheduled, the Setlist from the most recent past Gig instead. Derived, not stored.

## Still open / not yet modeled

- `songs.type` COMPLETA (full song) vs. POPURRI (medley, has `parent_song_id`) — does a POPURRI need its own key/intensity/duration, or inherit from its parent? Not yet discussed.
- Exactly how `event_payouts` rows relate to Memberships — must a payout recipient be a Member of the Project, or can a hired non-member musician receive one?
- Everything past songs/setlists/events/payouts (equipment checklists, audit log semantics, Google Calendar sync, public-page implementation) is unmodeled.

## Working style for whoever picks this up

- Owner writes all application code (including migrations) themselves — guide and challenge, don't write feature code unless explicitly asked.
- Grill rigorously on definitions and edge cases; don't soften because the owner is a beginner.
- Owner uses Neovim (`nvim <file>`) for manual edits.
- Keep a `CONTEXT.md` (glossary only, no implementation details) and `docs/adr/` (for hard-to-reverse, non-obvious, real-tradeoff decisions) going forward, per this repo's own documented conventions.
