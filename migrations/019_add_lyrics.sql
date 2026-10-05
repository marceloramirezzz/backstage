-- Lyrics for the teleprompter: free text, NULL while there are none.
ALTER TABLE songs ADD COLUMN lyrics TEXT CHECK (btrim(lyrics) <> '');
ALTER TABLE selections ADD COLUMN lyrics TEXT CHECK (btrim(lyrics) <> '');
-- An Event's Setlist copy keeps the lyrics as they were when copied, like the
-- rest of its values.
ALTER TABLE event_setlist_items ADD COLUMN lyrics TEXT;
