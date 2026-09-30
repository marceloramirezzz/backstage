# CalendarMonth

The month grid: `bs-cal` with 7 `bs-cal-head` cells, then `bs-cal-day` cells holding EventChips.

- Modifiers: `is-outside` for days of the adjacent months, `is-today` for today (spotlight tint + number).
- Weeks start on Sunday (matches the reference); switch the header order if the band prefers Monday.
- Hairlines only (`line`), no shadows — the grid is the ground everything sits on.
