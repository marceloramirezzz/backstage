import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuoteModel, quoteNumberLabel } from "./quote.ts";

const INPUT = {
  bandName: "Los Tigres",
  number: 7,
  issuedOn: "2026-10-06",
  clientName: "Ana Ríos",
  eventName: "Boda — Ana Ríos",
  eventType: "wedding" as const,
  eventDate: "2026-12-05",
  location: "Quinta Sol, Luque",
  amount: 4_500_000,
};

describe("buildQuoteModel", () => {
  it("writes the quote in Spanish with the number, dates and total", () => {
    const model = buildQuoteModel(INPUT);

    assert.equal(model.title, "Cotización COT-0007");
    assert.equal(model.bandName, "Los Tigres");
    assert.equal(model.issuedOn, "6 de octubre de 2026");
    assert.equal(model.clientName, "Ana Ríos");
    assert.equal(model.total, "Gs. 4.500.000");
    assert.deepEqual(model.details, [
      ["Evento", "Boda — Ana Ríos"],
      ["Tipo de evento", "Boda"],
      ["Fecha", "5 de diciembre de 2026"],
      ["Lugar", "Quinta Sol, Luque"],
    ]);
  });

  it("leaves out what isn't known", () => {
    const model = buildQuoteModel({ ...INPUT, clientName: null, eventType: null, location: null });

    assert.equal(model.clientName, null);
    assert.deepEqual(model.details.map(([label]) => label), ["Evento", "Fecha"]);
  });

  it("pads the number", () => {
    assert.equal(quoteNumberLabel(123), "COT-0123");
  });
});
