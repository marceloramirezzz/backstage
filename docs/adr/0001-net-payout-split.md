# Payout splits are computed on net pay, not gross

An Event carries `pay` (what the client paid) and any number of Expenses (e.g. equipment rental). The per-Member payout split is computed on **net** pay — `pay` minus the sum of that Event's Expenses — not on the raw `pay` figure.

**Alternative considered**: split on gross `pay`, showing Expenses only as separate, informational line items. Rejected because it would let a Member's split add up to more than what the band actually has left after costs — dividing money that went to a van rental is misleading, and everyone should be splitting the actual take-home, not the headline fee.

This is hard to reverse once real payout numbers are in the system (switching bases would retroactively change what every past split "meant"), and a reader who only sees `pay` on the Event without knowing Expenses factor into the split math would likely assume gross — hence recording it here.
