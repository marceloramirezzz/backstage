import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContractModel, DEFAULT_CONTRACT_TEMPLATE, fillTemplate } from "./contract.ts";

const input = {
  template: DEFAULT_CONTRACT_TEMPLATE,
  bandName: "Los Tigres",
  number: 7,
  issuedOn: "2026-10-06",
  clientName: "Ana Ríos",
  eventName: "Boda — Ana Ríos",
  eventDate: "2026-12-05",
  location: "Quinta Sol, Luque",
  cachet: 4_500_000,
};

describe("buildContractModel", () => {
  it("fills the placeholders from the Event and Project", () => {
    const model = buildContractModel({ ...input, template: "{{banda}} toca para {{cliente}}: {{evento}}, {{fecha}}, {{lugar}}, {{cachet}}." });

    assert.deepEqual(model.paragraphs, [
      "Los Tigres toca para Ana Ríos: Boda — Ana Ríos, 5 de diciembre de 2026, Quinta Sol, Luque, Gs. 4.500.000.",
    ]);
    assert.equal(model.numberLabel, "CON-0007");
    assert.equal(model.title, "Contrato CON-0007");
  });

  it("fills the default template completely", () => {
    const model = buildContractModel(input);

    assert.ok(model.paragraphs.length > 1);
    assert.ok(model.paragraphs.every((p) => !p.includes("{{")));
    assert.match(model.paragraphs[0], /Los Tigres y Ana Ríos/);
  });

  it("falls back when the client or location is unknown", () => {
    const model = buildContractModel({ ...input, template: "{{cliente}} en {{lugar}}", clientName: null, location: null });

    assert.deepEqual(model.paragraphs, ["el cliente en el lugar a confirmar"]);
  });

  it("splits paragraphs on blank lines and leaves unknown placeholders visible", () => {
    const model = buildContractModel({ ...input, template: "Uno\ncontinúa.\n\n\nDos {{ banda }} {{foo}}" });

    assert.deepEqual(model.paragraphs, ["Uno continúa.", "Dos Los Tigres {{foo}}"]);
  });
});

describe("fillTemplate", () => {
  it("does not treat inherited object keys as placeholders", () => {
    const values = { banda: "B", cliente: "C", evento: "E", fecha: "F", lugar: "L", cachet: "G" };

    assert.equal(fillTemplate("{{constructor}}", values), "{{constructor}}");
  });
});
