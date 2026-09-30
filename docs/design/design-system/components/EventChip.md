# EventChip

A calendar entry: status line, event name, time. `bs-chip` + `bs-tone-{status}`.

- Consumer provides: status, name (truncates with ellipsis), start–end time in 24h.
- Cancelled events stay visible, struck through, so the band sees the date freed up.
- `aria-selected="true"` while its EventPopover is open.
- Stack at most 2 per day cell; the rest collapse into `bs-cal-more` ("+2 more").
