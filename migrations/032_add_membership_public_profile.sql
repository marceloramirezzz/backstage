-- A Member's own entry in the Landing page's About section. Only the Member
-- edits it, and nothing shows until they opt in; the public name and bio are
-- separate from the User's global display name.
ALTER TABLE memberships
  ADD COLUMN public_name TEXT CHECK (btrim(public_name) <> ''),
  ADD COLUMN public_bio  TEXT CHECK (btrim(public_bio) <> ''),
  ADD COLUMN show_on_about BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT memberships_about_needs_name CHECK (NOT show_on_about OR public_name IS NOT NULL);
