import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInvoiceModel } from "./invoice.ts";
import { renderInvoicePdf } from "./invoice-pdf.ts";

describe("renderInvoicePdf", () => {
  it("draws a PDF", async () => {
    const model = buildInvoiceModel({
      bandName: "Los Tigres",
      number: 1,
      issuedOn: "2026-10-06",
      clientName: "Ana Ríos",
      eventName: "Boda — Ana Ríos",
      eventDate: "2026-12-05",
      location: "Quinta Sol, Luque",
      cachet: 4_500_000,
      payments: [{ date: "2026-10-01", amount: 1_000_000, note: "Seña" }],
    });

    const pdf = await renderInvoicePdf(model);

    assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
  });
});
