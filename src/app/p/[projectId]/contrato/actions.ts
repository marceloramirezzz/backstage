"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text } from "@/lib/form.ts";
import { errorMessage, type ErrorMessages } from "@/lib/error-message.ts";
import { requireUser } from "@/lib/session.ts";
import { saveContractTemplate } from "@/services/documents.ts";

export interface ContractActionState {
  error?: string;
  body: string;
  // Bumped on every success, so the form knows it saved.
  done: number;
}

const MESSAGES: ErrorMessages = {
  forbidden: "Solo los admins editan el contrato.",
  not_found: "Esta banda ya no existe.",
  invalid_input: "El contrato no puede estar vacío ni pasar de 10.000 caracteres.",
};

export async function saveContract(prev: ContractActionState, form: FormData): Promise<ContractActionState> {
  const user = await requireUser();
  const body = text(form, "body");
  try {
    await saveContractTemplate(getPool(), user, text(form, "projectId"), body);
    refresh();
    return { body, done: prev.done + 1 };
  } catch (err) {
    return { ...prev, body, error: errorMessage(err, MESSAGES) };
  }
}
