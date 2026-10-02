import { livePayout, liveMembers, type AttendanceMember, type Db, type FullPayout } from "./payout-live.ts";

// What a Paid Event keeps: its Payout and Attendance, as plain values.
interface Snapshot {
  payout: FullPayout;
  attendance: AttendanceMember[];
}

export interface FrozenEvent extends Snapshot {
  frozenAt: string;
}

// Freezes the Event's split, Attendance and amounts as they are now, replacing
// any earlier snapshot.
export async function takeSnapshot(db: Db, projectId: string, eventId: string): Promise<void> {
  const snapshot: Snapshot = {
    payout: await livePayout(db, projectId, eventId),
    attendance: await liveMembers(db, projectId, eventId),
  };
  await db.query(
    `INSERT INTO event_payout_snapshots (event_id, payload) VALUES ($1, $2)
     ON CONFLICT (event_id) DO UPDATE SET payload = excluded.payload, taken_at = now()`,
    [eventId, JSON.stringify(snapshot)],
  );
}

export async function dropSnapshot(db: Db, eventId: string): Promise<void> {
  await db.query("DELETE FROM event_payout_snapshots WHERE event_id = $1", [eventId]);
}

// Brings the snapshot in line with the Event: taken afresh when it's Paid (on
// entering it, or after an edit that changes what it pays), dropped otherwise.
export async function syncSnapshot(db: Db, projectId: string, eventId: string): Promise<void> {
  // Locks the Event so a concurrent status change can't leave a stale snapshot.
  const { rows } = await db.query("SELECT 1 FROM events WHERE id = $1 AND status = 'paid' FOR UPDATE", [eventId]);
  if (rows[0]) await takeSnapshot(db, projectId, eventId);
  else await dropSnapshot(db, eventId);
}

// The Event's frozen state, or null while it's live.
export async function findSnapshot(db: Db, eventId: string): Promise<FrozenEvent | null> {
  const { rows } = await db.query<{ payload: Snapshot; takenAt: Date }>(
    'SELECT payload, taken_at AS "takenAt" FROM event_payout_snapshots WHERE event_id = $1',
    [eventId],
  );
  if (!rows[0]) return null;
  const frozenAt = rows[0].takenAt.toISOString();
  return { payout: { ...rows[0].payload.payout, frozenAt }, attendance: rows[0].payload.attendance, frozenAt };
}

// The Event's Payout: frozen if it's Paid, a live preview otherwise.
export async function eventPayout(db: Db, projectId: string, eventId: string): Promise<FullPayout> {
  return (await findSnapshot(db, eventId))?.payout ?? (await livePayout(db, projectId, eventId));
}
