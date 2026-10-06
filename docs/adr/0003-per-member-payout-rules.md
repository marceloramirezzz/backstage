# Payout rules are per Member (Equal share or Fixed), not per Role

An Event's net pay is divided by giving each attending Member one of two rules: **Equal share** (an equal part of what remains) or **Fixed amount**. Fixed amounts come off first, then the remainder is split equally among the attending Equal-share Members. Every Member defaults to Equal share. A Project stores a default rule per Member, and an Event can override it per Member. Roles control permissions only and take no part in the split.

This replaces the earlier model, where each Role carried a percentage, a fixed pool, or a fixed amount per Member, and percentages had to sum to 100%.

**Alternatives considered**:
- Keep Role-based rules and add per-Member percentages. Rejected: percentages that must sum to 100% across whoever attended, with redistribution when a Role is empty, were hard for a band to reason about, and most bands split equally with a few fixed fees.
- A single Event-wide switch ("everyone equal" or "everyone fixed"). Rejected: it can't express the common case of a hired player on a fixed fee while the band splits the rest.

Percentage splits are dropped on purpose. Reintroducing them later is possible but would reopen the redistribution and over-allocation rules.

This is hard to reverse because existing Projects hold Role-based defaults and Event overrides. A migration converts each Role's fixed-per-Member rule to a Member fixed default and everything else to Equal share. Paid Events keep their frozen snapshots untouched, so past payouts never change meaning. A reader seeing only Roles and Members in the schema would not guess that Roles are irrelevant to the split, hence recording it here.

Related: the split still runs on net pay and still sets aside the band fund first (see ADR 0001). There is no record of whether a Member has actually been paid their share.

The Role-based tables and code were removed once nothing depended on them (migration 023). Frozen Paid snapshots written under the old model keep their Role-based JSON and still render from it.
