import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { RESERVED_SLUGS } from "./reserved-slugs.ts";

describe("RESERVED_SLUGS", () => {
  it("covers every top-level route folder and public file", () => {
    const routes = readdirSync("src/app", { withFileTypes: true })
      // A dynamic segment, like the Landing page's own [slug], is not a fixed path.
      .filter((e) => e.isDirectory() && !e.name.startsWith("["))
      .map((e) => e.name.replace(/^\(.*\)$/, ""))
      .filter(Boolean);
    const publicEntries = readdirSync("public").map((n) => n.replace(/\..*$/, ""));
    for (const name of [...routes, ...publicEntries, "favicon"]) {
      assert.ok(RESERVED_SLUGS.has(name), `${name} should be reserved`);
    }
  });
});
