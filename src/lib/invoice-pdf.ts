import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { wrap } from "./pdf-text.ts";
import type { InvoiceModel } from "./invoice.ts";

const PAGE = { width: 595, height: 842 }; // A4
const MARGIN = 56;

// Draws the invoice on one A4 page. Layout only: the wording lives in the
// model. Standard fonts cover Spanish accents, so nothing is embedded.
export async function renderInvoicePdf(model: InvoiceModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(model.title);
  pdf.setAuthor(model.bandName);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const right = PAGE.width - MARGIN;

  let y = PAGE.height - MARGIN;
  const text = (value: string, x: number, size: number, font = regular, color = ink) =>
    page.drawText(value, { x, y, size, font, color });
  const amount = (value: string, size: number, font = regular) =>
    text(value, right - font.widthOfTextAtSize(value, size), size, font);
  const rule = () => page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.7, color: muted });

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
    for (const line of wrap(value, regular, 12, right - MARGIN - 130)) {
      text(line, MARGIN + 130, 12);
      y -= 18;
    }
  }

  y -= 16;
  rule();
  y -= 26;
  text("Cachet", MARGIN, 13, bold);
  amount(model.cachet, 13, bold);
  y -= 34;

  if (model.payments.length > 0) {
    text("Pagos recibidos", MARGIN, 10, regular, muted);
    y -= 20;
    for (const payment of model.payments) {
      text(payment.date, MARGIN, 11);
      const lines = wrap(payment.description, regular, 11, 220);
      const top = y;
      for (const line of lines) {
        text(line, MARGIN + 170, 11);
        y -= 16;
      }
      const bottom = y;
      y = top;
      amount(payment.amount, 11);
      y = bottom;
    }
    y -= 6;
    text("Total recibido", MARGIN, 12, bold);
    amount(model.received, 12, bold);
    y -= 28;
  }

  rule();
  y -= 30;
  text(model.balanceLabel, MARGIN, 14, bold);
  amount(model.balance, 18, bold);

  return pdf.save();
}
