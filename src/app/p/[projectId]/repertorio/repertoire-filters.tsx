"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { Segmented } from "@/components/ui/segmented.tsx";
import { INTENSITY_LABELS } from "@/lib/intensity-label.ts";
import { INTENSITIES } from "@/services/songs.ts";

const SEARCH_DELAY_MS = 250;

// What the Repertorio lists: everything, only Canciones or only Enganchados.
export type RepertoireType = "" | "canciones" | "enganchados";

const TYPES: { value: RepertoireType; label: string }[] = [
  { value: "", label: "Todo" },
  { value: "canciones", label: "Canciones" },
  { value: "enganchados", label: "Enganchados" },
];

// Show only Canciones or Enganchados, search by title and filter by
// intensity, kept in the URL (`tipo`, `q`, `intensidad`) so a filtered list
// can be shared. Without JavaScript, Enter still submits the search and
// intensity as a plain GET.
export function RepertoireFilters({
  type,
  search,
  intensity,
}: {
  type: RepertoireType;
  search: string;
  intensity: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <form
      role="search"
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        update("q", query.trim());
      }}
    >
      <Segmented
        label="Mostrar"
        options={TYPES}
        value={type}
        onChange={(value) => update("tipo", value)}
      />
      {type && <input type="hidden" name="tipo" value={type} />}
      <label className="relative min-w-0 flex-[0_1_320px] max-sm:flex-auto">
        <Search {...iconProps} className="absolute top-2.5 left-3 text-ink-subtle" />
        <Input
          type="search"
          name="q"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => update("q", value.trim()), SEARCH_DELAY_MS);
          }}
          placeholder="Buscar por título"
          aria-label="Buscar en el repertorio"
          className="pl-9"
        />
      </label>
      <Select
        pill
        name="intensidad"
        aria-label="Intensidad"
        defaultValue={intensity}
        onChange={(e) => update("intensidad", e.target.value)}
      >
        <option value="">Cualquier intensidad</option>
        {INTENSITIES.map((value) => (
          <option key={value} value={value}>
            {INTENSITY_LABELS[value]}
          </option>
        ))}
      </Select>
    </form>
  );
}
