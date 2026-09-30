# Backstage — design handoff

This folder is the visual spec for the Backstage frontend. It holds the design system (tokens, component CSS, usage rules, logos) and the ten designed screens as static HTML and PNG. Domain language and business rules come from `CONTEXT.md` and `docs/adr/` at the repo root; this folder only decides how things look.

## What's here

```
design/
├── README.md                  ← this file
├── design-system/
│   ├── README.md              ← brand book: voice, color, type, spacing, states, logo rules — read first
│   ├── tokens.json            ← source of truth for every token (dark + light themes)
│   ├── tokens.css             ← the same tokens as CSS custom properties (dark on :root, light on [data-theme="light"])
│   ├── components.css         ← reference implementation of every component (`bs-*` classes)
│   ├── components/*.md        ← per-component guidelines (props/content, do/don't)
│   └── logos/                 ← stage-door mark: white (dark UI), black (light UI), spotlight (splash/hero)
└── screens/
    ├── *.html                 ← open in a browser; self-contained apart from ../design-system and Google Fonts
    └── *.png                  ← full-page screenshots at 1440px wide, dark theme
```

## Screens → routes

| Screen | File | Suggested route | Notes |
| --- | --- | --- | --- |
| Sign in | `signin` | `/sign-in` | Google + email/password. Same User either way (CONTEXT.md). |
| Welcome | `welcome` | `/welcome` | User with no Membership: verify-email banner, create Project, pending Invitations. |
| Calendar | `calendar` | `/p/[projectId]/calendar` | Month view is the home screen. Chip click opens the quick-view popover. |
| Event detail | `event` | `/p/[projectId]/events/[eventId]` | Details, setlist snapshot, pay & expenses, attendance + guests, payout split preview. |
| Dashboard | `dashboard` | `/p/[projectId]/dashboard` | Shows / Earned / Expected per month or year. |
| Repertoire | `repertoire` | `/p/[projectId]/repertoire` | Songs and Selections (medleys). |
| Setlists | `setlists` | `/p/[projectId]/setlists` | List + editor (drag to reorder, total duration). |
| Members | `members` | `/p/[projectId]/members` | Members, Invitations, custom Roles and their 3 toggles. |
| Payouts | `payouts` | `/p/[projectId]/payouts` | Default split per Role + per-person totals (Admin only). |
| Public landing page | `landing` | `/[slug]` (public) | Only public Confirmed/Paid events, song titles only, photo album, contact links. |

The sidebar and top bar are shared layout: build them once in the Project layout (`app/p/[projectId]/layout.tsx`).

## How to implement

1. **Tokens.** Put the contents of `tokens.css` in `src/app/globals.css` (replacing the create-next-app defaults) and expose them to Tailwind 4 with `@theme inline` (snippet in `design-system/README.md`). Set `data-theme="dark"` on `<html>`; light is `data-theme="light"`.
2. **Fonts.** Geist and Geist Mono are already loaded with `next/font` in `layout.tsx`; point `--font-sans` / `--font-mono` at those variables instead of the Google Fonts `@import` in `components.css`.
3. **Components.** Build React components in `src/components/ui/` that reproduce `components.css` exactly (Button, SegmentedControl, CountBadge, Tag, StatusLabel, EventChip, CalendarMonth, EventPopover, Sidebar, TopBar, Field/Input/Select, StatTile). Either port the CSS into Tailwind classes or keep `components.css` as a global stylesheet; match its values exactly, don't restyle.
4. **Icons.** Use `lucide-react`, 16px, stroke 1.75. The mockups draw simplified stand-ins; the names to use are listed in the brand book.
5. **Logo.** Copy `design-system/logos/*.png` into `public/brand/`. Only PNGs exist today; swap in an SVG when available.
6. **Screens.** Recreate each screen from its HTML (structure, spacing, copy) and PNG (look). Wire them to the services in `src/services/`; the data in the mockups is sample data.

## Rules that must survive implementation

- One spotlight-yellow primary button per view.
- Event status colors map 1:1 to `pending / confirmed / paid / cancelled`, and always show icon + word.
- Money: Guaraníes, `Gs. 4.500.000` (dot thousands), mono font; compact `Gs. 18,2M` only on stat tiles. Times 24h with en dash.
- Permissions are visible in the UI: hide pay/expenses from roles without "see total pay & expenses"; only Admins ever see other members' splits (the Members screen shows that toggle locked).
- Payout split is computed on net pay (ADR 0001); the Event screen shows the math: pay − expenses = net, fixed amounts first, then percentages among those who played.
- Text contrast ≥ 4.5:1 in both themes (already true for the tokens); focus ring is a 2px `focus-ring` outline, offset 2px.
- Sentence case everywhere; no emoji.

## Not designed yet

Mobile layouts (screens collapse the sidebar under 900px but weren't designed for phone), landing-page settings for Admins, the event create/edit form, sign-up and email verification pages, empty states and error pages. Follow the brand book when building them.
