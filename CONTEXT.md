# Backstage

A tool for a band to manage its gigs: repertoire, setlists, event scheduling, pay/expense tracking with configurable payout splits, and an optional public landing page. One workspace ("Project") per band.

## Language

**Project**:
A band's workspace — the tenant boundary. Owns Repertoire, Setlists, Events, Memberships, and Landing Page content.

**Member / Membership**:
A user's association with one Project, carrying exactly one Role. No Membership row means no standing in that Project at all.

**Role**:
Determines what a Member can do within a Project. **Admin** and **Member** are fixed, built-in roles that always exist and can't be edited or deleted. A Project can also define any number of **custom roles** (e.g. "Roadie"), each configured with three togglable permissions: edit repertoire/setlists/events, invite/remove members, see total pay & expenses per event. "See own resulting payout" is implicit for everyone. "See other members' individual payout splits" is never togglable — Admin always has it (needed to configure splits), no other role (built-in Member or any custom role) ever does.

**Song**:
An item in the Repertoire: `name`, `key`, `duration`, `intensity` (calm / medium / danceable / energetic).

**Selection**:
An item in the Repertoire representing a medley: an ordered list of full Songs (no nesting — a Selection can't contain another Selection) played back to back. Has its own `name`, `duration`, and `intensity`, entered directly (not computed, not inherited) — no `key` (a medley doesn't have one true key).

**Setlist**:
A named, ordered list of Songs and/or Selections (repeats allowed) with a free-text `category` (e.g. "cumbia", "rock") applying to the whole list.

**Event**:
Something on the Project's calendar: `name`, `date`, `location`, `pay`, `duration`, a chosen Setlist (copied at selection time into an independent, per-event snapshot — editing the Event's setlist never touches the original template, and later edits to the template never touch past Events). Has a `status` (pending / confirmed / cancelled) that can move freely in any direction between all three — deleting the Event is the only irreversible action. Has an `is_public` flag, defaulting to **false** (private) — an admin opts a specific Event into public visibility (e.g. a bar or festival gig), while private-by-default covers things like weddings/birthdays that shouldn't appear on the public page regardless of confirmation status.

**Expense**:
A cost tied to one Event: `name`, `amount` (e.g. "van rental — $80"). Purely informational alongside `pay`, not a Song/Setlist/Member concept.

**Payout Split**:
How an Event's **net** pay (`pay` minus the sum of its Expenses) is divided among Members. Configured as a per-Member percentage, set on a Project-level settings page as the default (percentages must sum to 100%, includes every Role that can receive a share), overridable per individual Event.

**Dashboard**:
Shows total earned and number of shows, scoped to month/year. Only **confirmed** Events count toward either figure (pending isn't locked in yet, cancelled didn't happen). Admin and Member see full totals (whole-band earned + shows). A custom role without "see total pay & expenses" sees only their own earned amount plus the shows count — never the band-wide total.

**Landing page**:
A public page for the Project. Shows: Repertoire (Song/Selection **titles only** — no key/duration; intensity may show), public appearances (Events that are both `confirmed` **and** `is_public` — includes past and upcoming, never pending/cancelled/private), a photo album (a flat, ordered list of photos, each with an optional caption), and contact links (each a preset platform — Instagram, Facebook, WhatsApp, Email, Phone, etc. — with a value, or "Other" with a free-text label for anything not listed).

_Avoid_: "Owner" (no such tier — Admin is the ceiling, and all Admins are equal); "Viewer" (renamed to "Member" — a regular band member isn't just viewing someone else's stuff); "Fee"/"Payout" as separate stored concepts (this model uses `pay` on Event + computed per-Member split, not a separate ledger).
