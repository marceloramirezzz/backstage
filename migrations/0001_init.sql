-- Initial schema. Hand-translated from the old prisma/schema.prisma design
-- (kept as prisma/schema.prisma.old for reference — no longer executable).
--
-- gen_random_uuid() is built into Postgres core since v13, no extension needed.

-- ==========================================
-- ENUMS
-- ==========================================

CREATE TYPE role AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE song_type AS ENUM ('COMPLETA', 'POPURRI');
CREATE TYPE intensity AS ENUM ('TRANQUILA', 'MEDIA', 'BAILABLE', 'ENERGICA');
CREATE TYPE event_status AS ENUM ('PENDIENTE', 'CONFIRMADO', 'CANCELADO');

-- ==========================================
-- USUARIOS Y PROYECTOS (multi-tenant)
-- ==========================================

CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  is_public             BOOLEAN NOT NULL DEFAULT false,
  owner_id              UUID NOT NULL REFERENCES users(id),
  -- Tokens de Google (encriptados a nivel de aplicación antes de guardarlos)
  google_refresh_token  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role       role NOT NULL DEFAULT 'VIEWER',
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

-- ==========================================
-- REPERTORIO
-- ==========================================

CREATE TABLE songs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  key            TEXT, -- tonalidad, ej: "Am", "G"
  duration_sec   INTEGER NOT NULL,
  intensity      intensity NOT NULL,
  language       TEXT NOT NULL,
  type           song_type NOT NULL DEFAULT 'COMPLETA',
  -- Si type = POPURRI, este campo no se usa acá.
  -- Las canciones que componen el popurrí se guardan como filas propias
  -- con parent_song_id apuntando a este registro.
  parent_song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- SETLISTS (plantillas reutilizables)
-- ==========================================

CREATE TABLE setlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL, -- libre: "cumbia", "rock", "latinos" — sin enum, editable
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE setlist_songs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id UUID NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  song_id    UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  "order"    INTEGER NOT NULL,
  UNIQUE (setlist_id, song_id)
);

-- ==========================================
-- EVENTOS
-- ==========================================

CREATE TABLE events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  date               TIMESTAMPTZ NOT NULL,
  location           TEXT NOT NULL,
  duration_min       INTEGER NOT NULL,
  payment            DECIMAL(10, 2) NOT NULL,
  status             event_status NOT NULL DEFAULT 'PENDIENTE',
  -- Referencia informativa al setlist original usado como base
  source_setlist_id  UUID REFERENCES setlists(id),
  -- Integración Google Calendar
  google_event_id    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Copia editable de canciones para un evento puntual.
-- Editar esto NUNCA modifica el Setlist original.
CREATE TABLE event_setlist_songs (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  song_id  UUID NOT NULL REFERENCES songs(id),
  "order"  INTEGER NOT NULL,
  UNIQUE (event_id, song_id)
);

-- Reparto de ganancias — privado por integrante.
-- La visibilidad se filtra siempre en el backend, nunca solo en el frontend:
-- ADMIN ve todos los payouts del evento, el resto solo ve el propio.
CREATE TABLE event_payouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  amount     DECIMAL(10, 2) NOT NULL,
  percentage DECIMAL(5, 2),
  UNIQUE (event_id, user_id)
);

-- Checklist de equipo por evento (PA, monitoreo, etc). Campo libre,
-- no booleans fijos, para no requerir migraciones cada vez que cambie.
CREATE TABLE equipment_items (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  checked  BOOLEAN NOT NULL DEFAULT false
);

-- ==========================================
-- AUDITORÍA
-- ==========================================

CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL, -- ej: "setlist.edited", "event.confirmed", "member.invited"
  entity_id  UUID NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- INDEXES for foreign keys not already covered by UNIQUE constraints
-- ==========================================

CREATE INDEX idx_memberships_project_id ON memberships(project_id);
CREATE INDEX idx_songs_project_id ON songs(project_id);
CREATE INDEX idx_songs_parent_song_id ON songs(parent_song_id);
CREATE INDEX idx_setlists_project_id ON setlists(project_id);
CREATE INDEX idx_events_project_id ON events(project_id);
CREATE INDEX idx_events_source_setlist_id ON events(source_setlist_id);
CREATE INDEX idx_event_setlist_songs_song_id ON event_setlist_songs(song_id);
CREATE INDEX idx_event_payouts_user_id ON event_payouts(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
