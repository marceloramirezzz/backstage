// The content of a contract PDF: the Project's template with its placeholders
// filled from the Event and Project. Pure, so the wording is tested apart from
// the layout.

import { formatFullDate, formatGuaranies } from "./format.ts";

export const MAX_TEMPLATE_LENGTH = 10_000;

// The placeholders a template may use, as written between double braces.
export const PLACEHOLDERS = [
  { name: "banda", description: "Nombre de la banda" },
  { name: "cliente", description: "Nombre del cliente" },
  { name: "evento", description: "Nombre del evento" },
  { name: "fecha", description: "Fecha del evento" },
  { name: "lugar", description: "Lugar del evento" },
  { name: "cachet", description: "Cachet acordado" },
] as const;

export type PlaceholderName = (typeof PLACEHOLDERS)[number]["name"];

// Used until an Admin edits the template. Paragraphs are split by blank lines.
export const DEFAULT_CONTRACT_TEMPLATE = `Entre {{banda}} y {{cliente}} se acuerda la presentación musical "{{evento}}", que se realizará el {{fecha}} en {{lugar}}.

El cachet acordado es de {{cachet}}.

Cualquier cambio de fecha, lugar o duración deberá acordarse por ambas partes por escrito.

Si el evento se cancela, las partes acordarán por escrito el tratamiento de los pagos ya recibidos.`;

export interface ContractInput {
  template: string;
  bandName: string;
  number: number;
  // The day it was issued, YYYY-MM-DD.
  issuedOn: string;
  clientName: string | null;
  eventName: string;
  // YYYY-MM-DD
  eventDate: string;
  location: string | null;
  // Whole Guaraníes.
  cachet: number;
}

export interface ContractModel {
  title: string;
  bandName: string;
  issuedOn: string;
  paragraphs: string[];
  // `CON-0007`
  numberLabel: string;
}

export const contractNumberLabel = (number: number) => `CON-${String(number).padStart(4, "0")}`;

// Replaces each known `{{name}}` with its value; anything else is left as
// written so a typo shows up in the PDF instead of vanishing.
export function fillTemplate(template: string, values: Record<PlaceholderName, string>): string {
  return template.replace(/\{\{\s*([a-z]+)\s*\}\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name as PlaceholderName] : whole,
  );
}

export function buildContractModel(input: ContractInput): ContractModel {
  const filled = fillTemplate(input.template, {
    banda: input.bandName,
    cliente: input.clientName ?? "el cliente",
    evento: input.eventName,
    fecha: formatFullDate(input.eventDate),
    lugar: input.location ?? "el lugar a confirmar",
    cachet: formatGuaranies(input.cachet),
  });
  return {
    title: `Contrato ${contractNumberLabel(input.number)}`,
    bandName: input.bandName,
    issuedOn: formatFullDate(input.issuedOn),
    paragraphs: filled
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean),
    numberLabel: contractNumberLabel(input.number),
  };
}
