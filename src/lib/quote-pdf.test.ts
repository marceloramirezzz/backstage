import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderQuotePdf } from "./quote-pdf.ts";
import { buildQuoteModel } from "./quote.ts";

describe("renderQuotePdf", () => {
  it("produces a PDF file", async () => {
    const model = buildQuoteModel({
      bandName: "Los Tigres",
      number: 1,
      issuedOn: "2026-10-06",
      clientName: "Ana Ríos",
      eventName: "Boda — Ana Ríos",
      eventType: "wedding",
      eventDate: "2026-12-05",
      location: "Quinta Sol, Luque ".repeat(12),
      amount: 4_500_000,
    });

    const bytes = await renderQuotePdf(model);

    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  });
});
