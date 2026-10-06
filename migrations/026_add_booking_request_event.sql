-- The Event a Booking Request was converted into: set once, by the explicit
-- "Convertir en evento" click. The Event reaches its request through this
-- column. Deleting the Event just clears the link.
ALTER TABLE booking_requests
  ADD COLUMN event_id UUID UNIQUE REFERENCES events (id) ON DELETE SET NULL;
