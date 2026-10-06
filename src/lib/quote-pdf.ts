import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { QuoteModel } from "./quote.ts";

const PAGE = { width: 595, height: 842 }; // A4
const MARGIN = 56;

// Draws the quote on one A4 page. Layout only: the wording lives in the model.
// Standard fonts cover Spanish accents, so nothing is embedded.
export async function renderQuotePdf(model: QuoteModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(model.title);
  pdf.setAuthor(model.bandName);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const contentWidth = PAGE.width - MARGIN * 2;

  let y = PAGE.height - MARGIN;
  const text = (value: string, x: number, size: number, font = regular, color = ink) =>
    page.drawText(value, { x, y, size, font, color });

  text(model.bandName, MARGIN, 24, bold);
  y -= 30;
  text(model.title, MARGIN, 16, regular, muted);
  y -= 22;
  text(`Emitida el ${model.issuedOn}`, MARGIN, 10, regular, muted);
  y -= 40;

  if (model.clientName) {
    text("Para", MARGIN, 10, regular, muted);
    y -= 16;
    text(model.clientName, MARGIN, 13, bold);
    y -= 36;
  }

  for (const [label, value] of model.details) {
    text(label, MARGIN, 10, regular, muted);
    for (const line of wrap(value, regular, 12, contentWidth - 130)) {
      text(line, MARGIN + 130, 12);
      y -= 18;
    }
  }

  y -= 16;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.7, color: muted });
  y -= 30;
  text("Total", MARGIN, 14, bold);
  const totalWidth = bold.widthOfTextAtSize(model.total, 18);
  text(model.total, PAGE.width - MARGIN - totalWidth, 18, bold);

  return pdf.save();
}

// Breaks `value` into lines that fit `width`.
function wrap(value: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}
