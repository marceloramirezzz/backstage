"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/field.tsx";
import { groupThousands } from "@/lib/format.ts";

// A Guaraníes field that writes dot thousands as you type (`4.500.000`).
// The visible box has no name: a hidden field carries the plain digits, so
// the actions keep reading a whole number.
export function MoneyInput({
  name,
  defaultValue,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "type" | "value" | "defaultValue"> & {
  defaultValue?: number | string | null;
}) {
  const digitsOf = (value: string) => value.replace(/\D/g, "");
  const [digits, setDigits] = useState(digitsOf(String(defaultValue ?? "")));
  const ref = useRef<HTMLInputElement>(null);

  // A form reset (after an action) puts the field back to its default.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const reset = () => setDigits(digitsOf(String(defaultValue ?? "")));
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue]);

  return (
    <>
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={groupThousands(digits)}
        onChange={(e) => {
          setDigits(digitsOf(e.target.value));
          onChange?.(e);
        }}
      />
      {name && <input type="hidden" name={name} value={digits} />}
    </>
  );
}
