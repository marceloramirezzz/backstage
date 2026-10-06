-- Role-based split rules (ADR 0003) were converted to per-Member rules by 022
-- and nothing reads them any more. Paid snapshots live in event_payout_snapshots
-- as plain JSON, so they stay readable.
DROP TABLE event_split_rules;
DROP TABLE event_splits;
DROP TABLE project_split_rules;
DROP TYPE split_kind;
