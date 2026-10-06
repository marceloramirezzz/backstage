"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Field } from "@/components/ui/field.tsx";
import { MAX_TEMPLATE_LENGTH } from "@/lib/contract.ts";
import { saveContract, type ContractActionState } from "./actions.ts";

// The contract template: free text, blank lines between paragraphs.
export function ContractForm({ projectId, body }: { projectId: string; body: string }) {
  const [state, action, pending] = useActionState<ContractActionState, FormData>(saveContract, { body, done: 0 });

  return (
    <form action={action} className="flex max-w-[720px] flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Texto del contrato" error={state.error}>
        <textarea
          name="body"
          defaultValue={state.body}
          rows={16}
          maxLength={MAX_TEMPLATE_LENGTH}
          className="w-full rounded-md border border-line-control bg-bg-2 px-3 py-2 text-[14px]/[20px] text-ink"
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {state.done > 0 && !state.error && !pending && (
          <span role="status" className="text-[13px]/[18px] text-ink-muted">Guardado</span>
        )}
      </div>
    </form>
  );
}
