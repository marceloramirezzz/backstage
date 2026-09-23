# Backstage

A tool for a band to manage its gigs: repertoire, setlists, event scheduling, pay/expense tracking with configurable payout splits, and an optional public landing page. One workspace ("Project") per band.

## Language

**Project**:
A band's workspace — the tenant boundary. Owns Repertoire, Setlists, Events, Memberships, and Landing Page content. Only the Owner can delete a Project.

**User**:
A person's login identity, global across Projects. Carries no permissions on its own — a User with no Memberships is valid (the starting state after sign-up) and can only create a Project or accept an Invitation. One User per email; signing in by password or Google reaches the same User, and a Google-only User may add a password later. Has a single global display name, shown to bandmates in every Project. A User's email never changes. A password sign-up must verify its email before accepting an Invitation or creating a Project; Google sign-in counts as already verified. Google sign-in links to an existing User only when Google reports the email verified; if that User had never verified it, whoever set its password can't be shown to own the address, so linking drops that password and its sessions.

**Member / Membership**:
A User's association with one Project, carrying exactly one Role. No Membership means no standing in that Project at all. Only accepted Invitations (or creating the Project) produce a Membership, so every Member is a real, active Member. Whoever creates a Project becomes its first Admin. A User can hold Memberships in many Projects. A Member can leave a Project at any time, except the Owner, who must transfer ownership first. Removing a Member takes an Admin or the "remove members" permission, but only an Admin can remove or demote another Admin, and only the Owner can affect the Owner.

**Invitation**:
An Admin's offer for a specific email address to join a Project with a specific Role. It is not a Membership and confers no standing until accepted. Can be sent to an email with no account yet. Only a User whose verified email matches the invited address can accept it. Expires after 7 days; can be resent or revoked while pending. Only one pending Invitation per email per Project, and none for someone already a Member. Only Admins send Invitations.

**Owner**:
The Member who created the Project. Always holds the Admin Role and has all its permissions, plus protection: no other Admin can demote or remove them. Ownership can be handed to another Admin, but only by the Owner. The Owner can't leave the Project without transferring ownership first. Every other Admin is equal.

**Role**:
Determines what a Member can do within a Project. **Admin** and **Member** are fixed, built-in roles that always exist and can't be edited or deleted. A Project can also define any number of **custom roles** (e.g. "Roadie"), each configured with three togglable permissions: edit repertoire/setlists/events, remove members, see total pay & expenses per event. "See own resulting payout" is implicit for everyone. "See other members' individual payout splits" is never togglable — Admin always has it (needed to configure splits), no other role (built-in Member or any custom role) ever does. A custom role can't be deleted while any Member holds it.

**Song**:
An item in the Repertoire: `name`, `key`, `duration`, `intensity` (calm / medium / danceable / energetic). Editing a Song updates it everywhere it's referenced live (Selections and template Setlists), but never the copies inside Event Setlist snapshots. A Song that belongs to a Selection or Setlist can't be deleted until it's removed from them.

**Selection**:
An item in the Repertoire representing a medley: an ordered list of full Songs (no nesting — a Selection can't contain another Selection) played back to back. Has its own `name`, `duration`, and `intensity`, entered directly (not computed, not inherited) — no `key` (a medley doesn't have one true key).

**Setlist**:
A named, ordered list of Songs and/or Selections (repeats allowed) with a free-text `category` (e.g. "cumbia", "rock") applying to the whole list. Displays a computed total duration (sum of its items); nothing else is derived from its items.

**Event**:
Something on the Project's calendar: `name`, `date`, `location`, `pay`, `duration`, a chosen Setlist (copied at selection time into an independent, per-event snapshot — editing the Event's setlist never touches the original template, and later edits to the template never touch past Events). Has a `status` (pending / confirmed / paid / cancelled) that can move freely in any direction between all four. **Confirmed** means the gig is happening; **Paid** means the client's payment has been received (distinct from a Member's payout) — deleting the Event is the only irreversible action, and only an Admin can delete a Paid Event (it then vanishes from every total). An Event's `duration` is independent of its Setlist's total, since a gig includes breaks and sound check. Has an `is_public` flag, defaulting to **false** (private) — an admin opts a specific Event into public visibility (e.g. a bar or festival gig), while private-by-default covers things like weddings/birthdays that shouldn't appear on the public page regardless of confirmation status.

**Expense**:
A cost tied to one Event: `name`, `amount` (e.g. "van rental — $80"). Purely informational alongside `pay`, not a Song/Setlist/Member concept. `pay` and Expenses can be edited only by someone who holds both "edit repertoire/setlists/events" and "see total pay & expenses" (Admins always do); you can't edit what you can't see.

**Attendance**:
The list of Members who took part in an Event. An Event's pay is divided only among them, so someone who didn't play gets no share. Every Member starts as attending on a new Event; someone with the edit-events permission unticks those who didn't play. Members can't edit their own attendance.

**Guest**:
A name-only person added to one Event's Attendance, typically a hired substitute. Not a User or Member: no login, sees nothing. Paid a fixed amount for that Event only, listed by name in the payout view.

**Payout Split**:
How an Event's **net** pay (`pay` minus the sum of its Expenses) is divided among the Members in its Attendance. Configured per Role, each Role getting one of: a **percentage**, a **fixed amount for the Role** (a pool shared equally by that Role's attending Members), or a **fixed amount per Member**. Fixed amounts come off the net first; percentages divide the remainder and must sum to 100%. A Role with nobody in the Attendance is skipped: its percentage is redistributed proportionally across the Roles that do have attendees, and its fixed amount isn't paid. If fixed amounts exceed the net pay, the Event is **over-allocated**: it is flagged, never paid out as negative amounts. Set as a Project-level default, overridable per individual Event; only Admins edit either. When an Event becomes **Paid**, the split, its Attendance and the resulting per-Member amounts are frozen as a snapshot; while Pending or Confirmed, payouts are live previews. Moving out of Paid unfreezes it, and returning to Paid takes a new snapshot. Editing a Paid Event's split or Attendance re-freezes it. Later Role, Membership or default-split changes never touch a Paid Event.

**Dashboard**:
Shows number of shows, **earned** and **expected**, scoped to month/year. Confirmed and Paid Events count as shows (pending isn't locked in yet, cancelled didn't happen). **Earned** is money actually received: Paid Events only. **Expected** is Confirmed Events not yet Paid. Admin and Member see full totals (whole-band figures). A custom role without "see total pay & expenses" sees only their own earned and expected amounts plus the shows count — never the band-wide totals.

**Landing page**:
A public page for the Project, reached at a unique per-Project address. Off by default: an Admin turns it on, and only Admins edit it (address, photo album, contact links). No draft state — edits are live. Shows: Repertoire (Song/Selection **titles only** — no key/duration; intensity may show), public appearances (Events that are `confirmed` or `paid` **and** `is_public` — includes past and upcoming, never pending/cancelled/private), a photo album (a flat, ordered list of photos, each with an optional caption), and contact links (each a preset platform — Instagram, Facebook, WhatsApp, Email, Phone, etc. — with a value, or "Other" with a free-text label for anything not listed).

_Avoid_: "Owner" as a separate permission tier above Admin (the Owner is an Admin with protection, not extra powers); "Viewer" (renamed to "Member" — a regular band member isn't just viewing someone else's stuff); "Fee"/"Payout" as separate stored concepts (this model uses `pay` on Event + computed per-Member split, not a separate ledger).
