Backstage is where a band runs its gigs: the calendar, the repertoire, setlists and who gets paid what. The interface is a dark room with one light on — near-black surfaces, quiet grey text, and a single stage-light yellow (`spotlight`) that marks the one thing to do next.

## Content fundamentals

- **Voice:** a bandmate who handles the admin. Short, plain, practical. "Pay is split among the members who played." not "Your earnings distribution has been calculated."
- **Person:** speak to the user as *you*; the band is *the band* or its name ("Los del Valle"), never "your organization".
- **Casing:** sentence case everywhere — buttons ("New event"), headings ("Payout split"), menu items. Uppercase only in `overline` labels (MENU, SETTINGS) and weekday headers.
- **Domain words are fixed** (from `CONTEXT.md`): Project, Member, Admin, Owner, Song, Selection, Setlist, Event, Expense, Attendance, Guest, Payout split. Event statuses are exactly *Pending, Confirmed, Paid, Cancelled*. Never "gig request", "booking", "fee" or "viewer".
- **Numbers:** 24-hour times (`21:30 – 23:30`, en dash). Money in Guaraníes with dot thousands: `Gs. 4.500.000`; compact on tiles: `Gs. 18,2M`. Durations as `2h 10m` or `04:12`.
- **No emoji** in the UI. Icons carry meaning, words confirm it.

## Visual foundations

**Color.** Build every screen from the four grounds: `bg-0` (app background, calendar), `bg-1` (sidebar, top bar, day cells), `bg-2` (popovers, cards, inputs), `bg-3` (hover, selected, chip fills). Separate them with `line` hairlines, not shadows. Text is `ink`, then `ink-muted` for labels and times, then `ink-subtle` for the least important (only on `bg-0`–`bg-2`).

- `spotlight` fills **one** primary action per view, the active segment and the current nav marker, with `on-spotlight` text. As text, use `spotlight-ink` (it darkens in the light theme). `spotlight-soft` tints the current nav row and today's cell.
- `hot` is for unread counts and nothing else.
- Event status colors map 1:1 to the Event `status` enum: `status-pending` (amber), `status-confirmed` (green), `status-paid` (blue), `status-cancelled` (red). Chips use the `-bg` fill with a 35% border of the tone. Every status always shows its icon **and** word, so the four read without color. `status-cancelled` doubles as the danger color.

**Themes.** Dark is the brand's home and the default (`data-theme="dark"`); Light exists for daytime/admin use and shares every name.

**Type.** Geist for everything, Geist Mono for numbers (the repo already loads both via `next/font`). Use the styles by name: `display` for page titles, `title` for popovers and dialogs, `heading` for cards, `body` / `body-strong` for UI, `small` for times and meta, `caption` for status labels, `overline` for sidebar groups, `stat` and `num` (mono, tabular) for money, durations and keys.

**Spacing.** 4px base with half-steps for dense calendar content: `space-1-5` between stacked chips, `space-2` inside day cells, `space-4` inside cards and popovers, `space-6` page gutter.

**Shape.** Actions are pills (`radius-pill`); containers are soft rectangles — `radius-sm` for chips and rows, `radius-md` for inputs and nav rows, `radius-lg` for popovers, cards, tiles.

**Elevation.** Flat by default. Only floating layers (popover, menu, dialog) take `shadow-pop`. The primary button glows with `shadow-glow` on hover.

**States.** Hover lifts a surface one step (to `bg-3`) or reveals a chip's full tone border. Focus is a solid 2px `focus-ring` outline, offset 2px, on every control. Disabled is 45% opacity. Selected chip: `ink` border on `bg-3`.

**Motion.** 150ms ease on color, border and shadow only. Popovers fade in over 120ms; nothing bounces.

## Iconography

Line icons, 16px, 1.75 stroke, round caps and joins, `currentColor`. Use **lucide-react** in the app (`Calendar`, `Music`, `ListMusic`, `ChartLine`, `DollarSign`, `Users`, `Globe`, `Settings`, `Clock`, `Check`, `CircleDollarSign`, `X`, `Trash2`, `Ellipsis`). The previews draw simplified stand-ins; no icon set ships in this system yet. Status icons: Pending → clock, Confirmed → check, Paid → coin, Cancelled → x.

## Logo

The mark is the **stage door**: a door with a star, standing on two steps — the way in to backstage. Assets in the Logos group.

- In the dark UI use `backstage-door-white.png`; on light grounds `backstage-door-black.png`. `backstage-door-spotlight.png` is for splash and landing-page heroes on `bg-0` only.
- Lockup: mark at 28px tall, 10px gap, then "Backstage" in Geist 600 (`body-strong` weight, 17px) in `ink`. Class `bs-brand`.
- There is no custom wordmark yet; the name is always set in Geist.
- Never tint the mark with status colors, stretch it, or place it on a spotlight fill.

## Using it in the Next.js app

The components are plain CSS classes (`bs-*`) in `components/bundle.css`, framework-free, so they drop into React/Tailwind as `className`s. To use tokens as Tailwind 4 utilities, map them in `globals.css`:

```css
@theme inline {
  --color-bg-0: var(--bg-0);   --color-bg-1: var(--bg-1);
  --color-bg-2: var(--bg-2);   --color-bg-3: var(--bg-3);
  --color-ink: var(--ink);     --color-ink-muted: var(--ink-muted);
  --color-spotlight: var(--spotlight);
  --color-on-spotlight: var(--on-spotlight);
  --radius-pill: 999px;
}
```

Then `bg-bg-1 text-ink-muted rounded-pill` etc. Put `data-theme="dark"` on `<html>`.
