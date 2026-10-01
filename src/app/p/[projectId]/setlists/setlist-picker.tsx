"use client";

import { Field, Select } from "@/components/ui/field.tsx";
import { useUnsavedChanges } from "./unsaved-changes.tsx";

// Chooses the open Setlist under 900px, where a list of cards would push the
// editor below the fold. Unsaved edits are asked about first.
export function SetlistPicker({
  projectId,
  setlists,
  currentId,
}: {
  projectId: string;
  setlists: { id: string; label: string }[];
  currentId: string;
}) {
  const { leave } = useUnsavedChanges();
  return (
    <Field label="Setlist">
      <Select
        value={currentId}
        onChange={(e) => leave(`/p/${projectId}/setlists?setlist=${e.target.value}`)}
      >
        {setlists.map((setlist) => (
          <option key={setlist.id} value={setlist.id}>
            {setlist.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
