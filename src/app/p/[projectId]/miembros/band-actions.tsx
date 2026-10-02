"use client";

import { ArrowRightLeft, LogOut, Trash2 } from "lucide-react";
import { useActionState, useEffect, useEffectEvent, useState } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { deleteProjectAction, leaveAction, transferAction, type FormState } from "./actions.ts";

export interface AdminOption {
  userId: string;
  displayName: string;
}

type Dialogs = "leave" | "transfer" | "delete" | null;

// What each Member can do with their own place in the Banda: anyone leaves,
// the Dueño transfers it to another Admin and is the only one who deletes it.
export function BandActions({
  projectId,
  projectName,
  isOwner,
  otherAdmins,
}: {
  projectId: string;
  projectName: string;
  isOwner: boolean;
  otherAdmins: AdminOption[];
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="m-0 min-w-0 flex-1 basis-64 text-[14px]/[20px] text-ink-muted">
          {isOwner
            ? "Sos el Dueño. Para salir, primero transferí la banda a otro Admin."
            : "Si salís, perdés el acceso a la banda hasta que te vuelvan a invitar."}
        </p>
        {isOwner ? (
          <Button
            variant="secondary"
            disabled={otherAdmins.length === 0}
            title={otherAdmins.length === 0 ? "Hace falta otro Admin" : undefined}
            onClick={() => setDialog("transfer")}
          >
            <ArrowRightLeft {...iconProps} />
            Transferir dueño
          </Button>
        ) : (
          <Button variant="danger" onClick={() => setDialog("leave")}>
            <LogOut {...iconProps} />
            Salir de la banda
          </Button>
        )}
      </div>
      {isOwner && otherAdmins.length === 0 && (
        <p className="m-0 text-[12px]/[16px] text-ink-muted">
          Para transferir la banda, primero hacé Admin a otro miembro.
        </p>
      )}
      {isOwner && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
          <p className="m-0 min-w-0 flex-1 basis-64 text-[14px]/[20px] text-ink-muted">
            Eliminar la banda borra sus eventos, repertorio, setlists, miembros y página pública.
            No se puede deshacer.
          </p>
          <Button variant="danger" onClick={() => setDialog("delete")}>
            <Trash2 {...iconProps} />
            Eliminar banda
          </Button>
        </div>
      )}
      <Dialog open={dialog === "leave"} onClose={close} title="Salir de la banda">
        <LeaveForm projectId={projectId} projectName={projectName} onClose={close} />
      </Dialog>
      <Dialog open={dialog === "transfer"} onClose={close} title="Transferir dueño">
        <TransferForm projectId={projectId} admins={otherAdmins} onClose={close} />
      </Dialog>
      <Dialog open={dialog === "delete"} onClose={close} title="Eliminar banda">
        <DeleteForm projectId={projectId} projectName={projectName} onClose={close} />
      </Dialog>
    </div>
  );
}

function LeaveForm({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(leaveAction, { done: 0 });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        ¿Salir de <span className="font-medium text-ink">{projectName}</span>? Perdés el acceso al
        instante. Los eventos ya pagados conservan tu parte.
      </p>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          <LogOut {...iconProps} />
          {pending ? "Saliendo…" : "Salir"}
        </Button>
      </div>
    </form>
  );
}

function TransferForm({
  projectId,
  admins,
  onClose,
}: {
  projectId: string;
  admins: AdminOption[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(transferAction, {
    done: 0,
  });
  const onDone = useEffectEvent(onClose);
  useEffect(() => {
    if (state.done) onDone();
  }, [state.done]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        Quien elijas pasa a ser el Dueño de la banda, y ningún otro Admin puede quitarle ese lugar.
        Vos seguís como Admin.
      </p>
      <Field label="Nuevo Dueño">
        <Select name="userId" data-autofocus defaultValue={admins[0]?.userId}>
          {admins.map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.displayName}
            </option>
          ))}
        </Select>
      </Field>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="secondary" disabled={pending || admins.length === 0}>
          {pending ? "Transfiriendo…" : "Transferir"}
        </Button>
      </div>
    </form>
  );
}

function DeleteForm({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteProjectAction, {
    done: 0,
  });
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        Se borra <span className="font-medium text-ink">{projectName}</span> con todo lo que tiene,
        para todos sus miembros. No se puede deshacer.
      </p>
      <Field label={`Escribí «${projectName}» para confirmar`}>
        <Input
          name="name"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          data-autofocus
        />
      </Field>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" disabled={pending || typed !== projectName}>
          <Trash2 {...iconProps} />
          {pending ? "Eliminando…" : "Eliminar banda"}
        </Button>
      </div>
    </form>
  );
}
