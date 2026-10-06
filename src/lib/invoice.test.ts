import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInvoiceModel, invoiceNumberLabel } from "./invoice.ts";

const INPUT = {
  bandName: "Los Tigres",
  number: 3,
  issuedOn: "2026-10-06",
  clientName: "Ana Ríos",
  eventName: "Boda — Ana Ríos",
  eventDate: "2026-12-05",
  location: "Quinta Sol, Luque",
  cachet: 4_500_000,
  payments: [
    { date: "2026-10-01", amount: 1_000_000, note: "Seña" },
    { date: "2026-11-15", amount: 500_000, note: null },
  ],
};

describe("buildInvoiceModel", () => {
  it("states the cachet, each Payment received and the balance, in Spanish", () => {
    const model = buildInvoiceModel(INPUT);

    assert.equal(model.title, "Factura FAC-0003");
    assert.equal(model.numberLabel, "FAC-0003");
    assert.equal(model.issuedOn, "6 de octubre de 2026");
    assert.equal(model.clientName, "Ana Ríos");
    assert.deepEqual(model.details, [
      ["Evento", "Boda — Ana Ríos"],
      ["Fecha", "5 de diciembre de 2026"],
      ["Lugar", "Quinta Sol, Luque"],
    ]);
    assert.equal(model.cachet, "Gs. 4.500.000");
    assert.deepEqual(model.payments, [
      { date: "1 de octubre de 2026", description: "Seña", amount: "Gs. 1.000.000" },
      { date: "15 de noviembre de 2026", description: "Pago recibido", amount: "Gs. 500.000" },
    ]);
    assert.equal(model.received, "Gs. 1.500.000");
    assert.equal(model.balanceLabel, "Saldo pendiente");
    assert.equal(model.balance, "Gs. 3.000.000");
  });

  it("shows no Payments and the full cachet as the balance when nothing was received", () => {
    const model = buildInvoiceModel({ ...INPUT, payments: [] });

    assert.deepEqual(model.payments, []);
    assert.equal(model.received, "Gs. 0");
    assert.equal(model.balance, "Gs. 4.500.000");
  });

  it("labels a settled balance and an overpayment", () => {
    const settled = buildInvoiceModel({ ...INPUT, payments: [{ date: "2026-10-01", amount: 4_500_000, note: null }] });
    const over = buildInvoiceModel({ ...INPUT, payments: [{ date: "2026-10-01", amount: 5_000_000, note: null }] });

    assert.equal(settled.balanceLabel, "Saldo");
    assert.equal(settled.balance, "Gs. 0");
    assert.equal(over.balanceLabel, "Saldo a favor del cliente");
    assert.equal(over.balance, "Gs. 500.000");
  });

  it("leaves out what isn't known and pads the number", () => {
    const model = buildInvoiceModel({ ...INPUT, clientName: null, location: null });

    assert.equal(model.clientName, null);
    assert.deepEqual(model.details.map(([label]) => label), ["Evento", "Fecha"]);
    assert.equal(invoiceNumberLabel(123), "FAC-0123");
  });
});
