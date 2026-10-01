import { startTransition, type FormEvent } from "react";

// A form's submit handler that sends its fields to `action` by hand, so a
// failed save keeps what was typed (a form action would reset the fields).
export function submitKeepingFields(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
}
