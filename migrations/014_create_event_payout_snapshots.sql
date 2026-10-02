-- The frozen Payout of a Paid Event: its split, Attendance and every resulting
-- amount, as plain values so later Role, Membership or default-split changes
-- (and former Members leaving) never alter it. Present only while the Event
-- is Paid.
CREATE TABLE event_payout_snapshots (
  event_id   UUID PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The Payout as an Admin sees it (see FullPayout), plus the Attendance.
  payload    JSONB NOT NULL
);
