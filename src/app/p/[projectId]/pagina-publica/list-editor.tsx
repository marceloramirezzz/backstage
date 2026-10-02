"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";

// A row's position among its siblings after moving it by `by`.
export function moved<T>(rows: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// An ordered list of editable rows with move and remove buttons, an add
// button and a save button. The rows' inputs belong to the enclosing form.
export function ListEditor({
  rows,
  renderRow,
  onMove,
  onRemove,
  onAdd,
  addLabel,
  max,
  pending,
  saved,
  error,
  empty,
  rowKey,
}: {
  rows: { key: string }[];
  renderRow: (index: number) => ReactNode;
  onMove: (index: number, by: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  addLabel: string;
  max: number;
  pending: boolean;
  saved: boolean;
  error?: string;
  empty: string;
  rowKey: string;
}) {
  return (
    <>
      {rows.length === 0 && <p className="m-0 text-[14px]/[20px] text-ink-muted">{empty}</p>}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row, i) => (
          <li
            key={`${rowKey}-${row.key}`}
            className="flex items-start gap-2 rounded-md border border-line bg-bg-1 p-3 max-sm:flex-col"
          >
            <div className="grid min-w-0 flex-1 gap-3 max-sm:w-full">{renderRow(i)}</div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" aria-label="Subir" disabled={i === 0} onClick={() => onMove(i, -1)}>
                <ArrowUp {...iconProps} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Bajar"
                disabled={i === rows.length - 1}
                onClick={() => onMove(i, 1)}
              >
                <ArrowDown {...iconProps} />
              </Button>
              <Button type="button" variant="ghost" size="sm" aria-label="Quitar" onClick={() => onRemove(i)}>
                <Trash2 {...iconProps} />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="m-0 text-[12px]/[16px] text-status-cancelled">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={rows.length >= max} onClick={onAdd}>
          <Plus {...iconProps} />
          {addLabel}
        </Button>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {saved && !error && !pending && (
          <span role="status" className="text-[13px]/[18px] text-ink-muted">Guardado</span>
        )}
      </div>
    </>
  );
}
