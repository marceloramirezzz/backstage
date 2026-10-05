import type { ExpenseCategory } from "@/services/expenses.ts";

// What the UI calls each kind of Gasto, in the order the form lists them.
export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: "transport", label: "Transporte" },
  { value: "sound", label: "Sonido" },
  { value: "rentals", label: "Alquileres" },
  { value: "food", label: "Comida" },
  { value: "other", label: "Otro" },
];

export const expenseCategoryLabel = (category: string) =>
  EXPENSE_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? "Otro";
