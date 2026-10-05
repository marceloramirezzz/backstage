-- The fourth custom-Role permission: see and work Booking Requests. Admin
-- always holds it; existing custom Roles start without it.
ALTER TABLE roles DROP CONSTRAINT roles_check;
ALTER TABLE roles ADD COLUMN can_manage_bookings BOOLEAN;
UPDATE roles SET can_manage_bookings = false WHERE kind = 'custom';
ALTER TABLE roles ADD CONSTRAINT roles_toggles_check CHECK (
  (kind = 'custom'
    AND can_edit_repertoire_setlists_events IS NOT NULL
    AND can_remove_members IS NOT NULL
    AND can_see_total_pay_expenses IS NOT NULL
    AND can_manage_bookings IS NOT NULL)
  OR
  (kind <> 'custom'
    AND can_edit_repertoire_setlists_events IS NULL
    AND can_remove_members IS NULL
    AND can_see_total_pay_expenses IS NULL
    AND can_manage_bookings IS NULL)
);

CREATE TYPE booking_event_type AS ENUM
  ('wedding', 'corporate', 'private_party', 'festival', 'bar_restaurant', 'other');
CREATE TYPE booking_status AS ENUM
  ('new', 'contacted', 'quote_sent', 'confirmed', 'completed', 'cancelled');
CREATE TYPE booking_urgency AS ENUM ('low', 'normal', 'high', 'urgent');

-- A prospective client's inquiry, submitted from a Project's Landing page.
CREATE TABLE booking_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  client_name TEXT NOT NULL CHECK (btrim(client_name) <> ''),
  phone       TEXT CHECK (btrim(phone) <> ''),
  email       TEXT CHECK (btrim(email) <> ''),
  event_type  booking_event_type NOT NULL,
  event_date  DATE NOT NULL,
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  venue       TEXT CHECK (btrim(venue) <> ''),
  location    TEXT CHECK (btrim(location) <> ''),
  guests      INTEGER CHECK (guests > 0),
  urgency     booking_urgency,
  music_style TEXT CHECK (btrim(music_style) <> ''),
  status      booking_status NOT NULL DEFAULT 'new',
  -- Hash of the submitter's address, only to rate limit; never shown.
  ip_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX booking_requests_project_created_idx ON booking_requests (project_id, created_at DESC);
CREATE INDEX booking_requests_ip_created_idx ON booking_requests (ip_hash, created_at);
