import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildContractModel, DEFAULT_CONTRACT_TEMPLATE } from "./contract.ts";
import { renderContractPdf } from "./contract-pdf.ts";

const input = {
  template: DEFAULT_CONTRACT_TEMPLATE,
  bandName: "Los Tigres",
  number: 1,
  issuedOn: "2026-10-06",
  clientName: "Ana Ríos",
  eventName: "Boda — Ana Ríos",
  eventDate: "2026-12-05",
  location: "Quinta Sol, Luque",
  cachet: 4_500_000,
};

describe("renderContractPdf", () => {
  it("draws a PDF", async () => {
    const pdf = await renderContractPdf(buildContractModel(input));

    assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
  });

  it("flows a long template onto more pages", async () => {
    const template = Array.from({ length: 40 }, (_, i) => `Cláusula ${i + 1}. ${"texto ".repeat(40)}`).join("\n\n");

    const pdf = await PDFDocument.load(await renderContractPdf(buildContractModel({ ...input, template })));

    assert.ok(pdf.getPageCount() > 1);
  });
});
