# Backstage

A tool for a band to manage its gigs: repertoire, setlists, event scheduling, pay/expense tracking with configurable payout splits, and an optional public landing page. One workspace ("Project") per band.

## Language

The UI is in Spanish. Each term's `_Spanish UI_` word is the only one the interface uses for it; code keeps the English term.

**Project**:
A band's workspace — the tenant boundary. Owns Repertoire, Setlists, Events, Memberships, and Landing Page content. Only the Owner can delete a Project. Every amount in a Project (`pay`, Expenses, Payout Split fixed amounts, Dashboard totals) is in Guaraníes, in whole units: there are no cents.
_Spanish UI_: Banda (avoid "Proyecto")

**User**:
A person's login identity, global across Projects. Carries no permissions on its own — a User with no Memberships is valid (the starting state after sign-up) and can only create a Project or accept an Invitation. One User per email; signing in by password or Google reaches the same User, and a Google-only User may add a password later. Has a single global display name, shown to bandmates in every Project. A User's email never changes. A password sign-up must verify its email before accepting an Invitation or creating a Project; Google sign-in counts as already verified. Google sign-in links to an existing User only when Google reports the email verified; if that User had never verified it, whoever set its password can't be shown to own the address, so linking drops that password and its sessions.
_Spanish UI_: Usuario

**Member / Membership**:
A User's association with one Project, carrying exactly one Role. No Membership means no standing in that Project at all. Only accepted Invitations (or creating the Project) produce a Membership, so every Member is a real, active Member. Whoever creates a Project becomes its first Admin. A User can hold Memberships in many Projects. A Member can leave a Project at any time, except the Owner, who must transfer ownership first. Removing a Member takes an Admin or the "remove members" permission, but only an Admin can remove or demote another Admin, and only the Owner can affect the Owner.
_Spanish UI_: Miembro

**Invitation**:
An Admin's offer for a specific email address to join a Project with a specific Role. It is not a Membership and confers no standing until accepted. Can be sent to an email with no account yet. Only a User whose verified email matches the invited address can accept it. An Invitation not yet accepted or revoked is **open**: **pending** for 7 days, then **expired**. An open Invitation can be resent (a new link, pending for another 7 days) or revoked; inviting the same email again replaces an expired one. Only one pending Invitation per email per Project, and none for someone already a Member. Only Admins send Invitations.
_Spanish UI_: Invitación

**Owner**:
The Member who created the Project. Always holds the Admin Role and has all its permissions, plus protection: no other Admin can demote or remove them. Ownership can be handed to another Admin, but only by the Owner. The Owner can't leave the Project without transferring ownership first. Every other Admin is equal.
_Spanish UI_: Dueño

**Role**:
Determines what a Member can do within a Project. **Admin** and **Member** are fixed, built-in roles that always exist and can't be edited or deleted. A Project can also define any number of **custom roles** (e.g. "Roadie"), each configured with four togglable permissions: edit repertoire/setlists/events, remove members, see total pay & expenses per event, manage bookings (see and work Booking Requests; Admin always has it). "See own resulting payout" is implicit for everyone. "See other members' individual payout splits" is never togglable — Admin always has it (needed to configure splits), no other role (built-in Member or any custom role) ever does. A custom role can't be deleted while any Member holds it.
_Spanish UI_: Rol; the built-ins are Admin and Miembro

**Booking Request**:
A prospective client's inquiry to a Project, submitted from its Landing page by someone with no account. Belongs to the Project, which is notified by email (every Member holding the "manage bookings" permission). Moves through its own sales funnel: Nueva → Contactado → Cotización enviada → Confirmada → Completada, or Cancelada. The `status` is independent of any Event's status: the only link between them is **conversion**, an explicit one-time click that creates a `confirmed` Event from the request and records the back-reference. Conversion never happens automatically, and it does not notify Members; the Admin notifies Attendance separately once it has been reviewed. Carries internal notes, which clients never see. Holds the client's name and contact (phone or email), event type (Boda / Corporativo / Fiesta privada / Festival / Bar o restaurante / Otro), date, description, and optionally venue, location, guest count, urgency and preferred music style; there is no budget. Anyone with "manage bookings" can delete one. A client who gave an email gets a short confirmation; there is no client login or status page.
_Spanish UI_: Solicitud (avoid "Reserva", which implies it is already confirmed)

**Song**:
An item in the Repertoire: `name`, `key` (optional, since a band may not have settled on one; one of the 12 notes, major or minor — C, C#, … B, Cm, C#m, … Bm), `duration` (up to 99:59), `intensity` (calm / medium / danceable / energetic). Editing a Song updates it everywhere it's referenced live (Selections and template Setlists), but never the copies inside Event Setlist snapshots. A Song that belongs to a Selection or Setlist can't be deleted until it's removed from them.
_Spanish UI_: Canción; `name` is **Título**, `key` is **Tono**; intensities Tranquila / Media / Bailable / Enérgica

**Selection**:
An item in the Repertoire representing a medley: an ordered list of at least two full Songs, each at most once (no nesting — a Selection can't contain another Selection), played back to back. Has its own `name`, `duration` (up to 99:59), and `intensity`, entered directly (not computed, not inherited) — no `key` (a medley doesn't have one true key). A Selection in a Setlist can't be deleted until it's removed from it.
_Spanish UI_: Enganchado (avoid "Selección")

**Setlist**:
A named, ordered list of Songs and/or Selections (repeats allowed) with an optional free-text `category` (e.g. "cumbia", "rock") applying to the whole list. Can be empty while it's being built; duplicating one copies its category and items under a new name. Displays a computed total duration (sum of its items); nothing else is derived from its items.
_Spanish UI_: Setlist

**Event**:
Something on the Project's calendar: `name`, `date`, an optional start time, an optional `location`, `pay`, `duration`, a chosen Setlist (copied at selection time into an independent, per-event snapshot — editing the Event's setlist never touches the original template, and later edits to the template never touch past Events). Has a `status` (pending / confirmed / paid / cancelled) that can move freely in any direction between all four. **Confirmed** means the gig is happening; **Paid** means the client's payment has been received (distinct from a Member's payout) — deleting the Event is the only irreversible action, and only an Admin can delete a Paid Event (it then vanishes from every total). An Event's `duration` is independent of its Setlist's total, since a gig includes breaks and sound check. Has an `is_public` flag, defaulting to **false** (private) — an admin opts a specific Event into public visibility (e.g. a bar or festival gig), while private-by-default covers things like weddings/birthdays that shouldn't appear on the public page regardless of confirmation status.
_Spanish UI_: Evento; `pay` is **Cachet** (avoid "Pago", which collides with Pagado); statuses Pendiente / Confirmado / Pagado / Cancelado

**Expense**:
A cost tied to one Event: `name`, `amount` (e.g. "van rental — Gs. 400.000"), a `category` (Transporte / Sonido / Alquileres / Comida / Otro) Expenses are always paid out of the cachet: the split runs on net pay (`pay` minus Expenses). Not a Song/Setlist/Member concept. `pay` and Expenses can be edited only by someone who holds both "edit repertoire/setlists/events" and "see total pay & expenses" (Admins always do); you can't edit what you can't see.
_Spanish UI_: Gasto

**Attendance**:
The list of Members who took part in an Event. An Event's pay is divided only among them, so someone who didn't play gets no share. Every Member starts as attending on a new Event; someone with the edit-events permission unticks those who didn't play, themselves included.
Each attending Member's row can also carry two Admin-only, per-Event settings: a rule override (Equal share or Fixed amount, replacing their Project default) and an **Ajuste** (a signed amount added to their share). See Payout Split.
_Spanish UI_: Asistencia

**Guest**:
A name-only person added to one Event's Attendance, typically a hired substitute. Not a User or Member: no login, sees nothing. Paid a fixed amount for that Event only, listed by name in the payout view.
_Spanish UI_: Suplente (avoid "Invitado", which collides with Invitación)

**Payout Split**:
How an Event's **net** pay (`pay` minus the sum of its Expenses) is divided among the Members in its Attendance. First the Event's **band fund** (a percentage of the net, 0–50%, default 0, set on the Event) is set aside for the band (_Spanish UI_: Fondo de la banda). Each attending Member then follows one of two rules: **Equal share** (an equal part of what remains) or **Fixed amount** (a set amount). Fixed amounts come off first, then the remainder is divided equally among the attending Equal-share Members; Guests are paid fixed amounts. Roles play no part in the split. Every Member defaults to Equal share, so a typical band configures nothing. A Project holds a **default rule per Member**, which an individual Event can override per Member. An **Ajuste** is a signed amount added to one attending Member's share for this Event only; it is funded from (or returned to) the pot like a fixed amount, so it counts toward over-allocation. Expenses are never reimbursed to whoever fronted them: the cachet pays for everything. If fixed amounts exceed the net pay, the Event is **over-allocated**: it is flagged, never paid out as negatives. Only Admins edit the defaults or an Event's overrides. When an Event becomes **Paid**, the rules, its Attendance and the resulting per-Member amounts are frozen as a snapshot; while Pending or Confirmed, payouts are live previews. Moving out of Paid unfreezes it, and returning to Paid takes a new snapshot. Editing a Paid Event's split or Attendance re-freezes it. Later Membership or default-rule changes never touch a Paid Event. There is no record of whether a Member has actually been handed their money.
_Spanish UI_: Reparto; the frozen state of a Paid Event's Reparto is **Congelado**

**Dashboard**:
Shows number of shows, **earned** and **expected**, scoped to month/year. Confirmed and Paid Events count as shows (pending isn't locked in yet, cancelled didn't happen). **Earned** is money actually received: the Payments received in the period. **Expected** is, for Confirmed and Paid Events, `pay` minus the Payments received so far. Admin and Member see full totals (whole-band figures). A custom role without "see total pay & expenses" sees only their own earned and expected amounts plus the shows count — never the band-wide totals.
_Spanish UI_: Resumen; Earned is **Cobrado**, Expected is **Por cobrar**

**Payment**:
Money received from the client toward one Event: `date`, `amount`, optional note (e.g. a deposit). The Event shows received versus balance (`pay` minus received). Informational: whether an Event is **Paid** stays a manual decision, so a settled balance never changes its status on its own. Seeing and recording Payments takes the same permissions as editing `pay` and Expenses.
_Spanish UI_: Pago recibido (avoid "Pago" alone, which collides with Pagado and Cachet)

**Rehearsal**:
A lightweight calendar item: date, start/end time, location, notes. No pay, Setlist, Attendance or payout — anything with a Setlist or a payout is an Event. Created and edited by anyone who can edit events. Members aren't emailed by default; the creator may choose to notify them.
_Spanish UI_: Ensayo

**Calendar**:
The month view (plus an agenda list on phones) of a Project's Events and Rehearsals, visible to every Member, private Events included. Cancelled Events are hidden by default. No drag-and-drop rescheduling. Each Project also has a **calendar feed**: a subscribable `.ics` address, secured by a secret token an Admin can regenerate, so Events and Rehearsals show up in Google Calendar and similar apps. Notification emails carry an `.ics` invite for the item.
_Spanish UI_: Calendario

**Document**:
A quote, contract or invoice PDF, rendered on demand and never stored. A quote comes from a Booking Request or an Event; a contract or invoice comes from an Event. An invoice is a statement of cachet, Payments received and balance, not a fiscal invoice. Numbered sequentially per Project and type when first generated, and the number is recorded so a regenerated PDF keeps it. The contract uses one Admin-edited template per Project with placeholders. Generating one takes both "manage bookings" and "see total pay & expenses".
_Spanish UI_: Cotización / Contrato / Factura

**Landing page**:
A public page for the Project, reached at a unique per-Project address. Off by default: an Admin turns it on, and only Admins edit it (address, photo album, contact links). No draft state — edits are live. Shows: Repertoire (Song/Selection **titles only** — no key/duration; intensity may show), public appearances (Events that are `confirmed` or `paid` **and** `is_public` — includes past and upcoming, never pending/cancelled/private), a photo album (a flat, ordered list of photos, each with an optional caption), a hero (tagline, genre), a set of **services** chosen from a fixed list, an about section (years active, travel area, free text), audio sample links and YouTube/Vimeo video links (no uploads), opt-in Members with a public name and bio they set themselves, a Booking Request form, and contact links (each a preset platform — Instagram, Facebook, WhatsApp, Email, Phone, etc. — with a value, or "Other" with a free-text label for anything not listed).
_Spanish UI_: Página pública

_Avoid_: "Owner" as a separate permission tier above Admin (the Owner is an Admin with protection, not extra powers); "Viewer" (renamed to "Member" — a regular band member isn't just viewing someone else's stuff); "Fee"/"Payout" as separate stored concepts (this model uses `pay` on Event + computed per-Member split, not a separate ledger).
