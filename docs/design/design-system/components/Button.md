# Button

Pill-shaped actions: `bs-btn` plus one of `bs-btn-primary`, `-secondary`, `-ghost`, `-danger`, `-inverse`; `bs-iconbtn` for icon-only.

- One `primary` (spotlight yellow) per view — the thing the page is for ("New event"). Everything else is `secondary` or `ghost`.
- `inverse` (ink fill) is reserved for the sidebar's Create button.
- `danger` only for irreversible actions: deleting an event or a member.
- Consumer provides: the label (sentence case, verb first), an optional leading 16px icon, `aria-label` on every `bs-iconbtn`.
- `bs-btn-sm` inside dense surfaces (table rows, popovers).
