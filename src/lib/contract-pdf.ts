import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ContractModel } from "./contract.ts";
import { wrap } from "./pdf-text.ts";

const PAGE = { width: 595, height: 842 }; // A4
const MARGIN = 56;
const SIZE = 12;
const LEADING = 18;

// Draws the contract, adding pages as the text needs. Layout only: the wording
// lives in the model. Standard fonts cover Spanish accents.
export async function renderContractPdf(model: ContractModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(model.title);
  pdf.setAuthor(model.bandName);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const draw = (value: string, size: number, font = regular, color = ink) => {
    page.drawText(value, { x: MARGIN, y, size, font, color });
  };
  const line = (value: string) => {
    if (y < MARGIN) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
    draw(value, SIZE);
    y -= LEADING;
  };

  draw(model.bandName, 24, bold);
  y -= 30;
  draw(model.title, 16, regular, muted);
  y -= 22;
  draw(`Emitido el ${model.issuedOn}`, 10, regular, muted);
  y -= 40;

  for (const paragraph of model.paragraphs) {
    for (const text of wrap(paragraph, regular, SIZE, PAGE.width - MARGIN * 2)) line(text);
    y -= 10;
  }

  return pdf.save();
}
