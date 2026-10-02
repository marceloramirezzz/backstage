import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { RESERVED_SLUGS } from "./reserved-slugs.ts";

describe("RESERVED_SLUGS", () => {
  it("covers every top-level route folder and public file", () => {
    const routes = readdirSync("src/app", { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name.replace(/^\(.*\)$/, ""))
      .filter(Boolean);
    const publicEntries = readdirSync("public").map((n) => n.replace(/\..*$/, ""));
    for (const name of [...routes, ...publicEntries, "favicon"]) {
      assert.ok(RESERVED_SLUGS.has(name), `${name} should be reserved`);
    }
  });
});
