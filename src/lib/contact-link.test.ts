import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactHref, isValidContactValue } from "./contact-link.ts";

describe("contactHref", () => {
  it("links an Instagram handle, with or without the @, or a full address", () => {
    assert.equal(contactHref("instagram", "@losdelvalle.py"), "https://instagram.com/losdelvalle.py");
    assert.equal(contactHref("instagram", "losdelvalle.py"), "https://instagram.com/losdelvalle.py");
    assert.equal(contactHref("instagram", "https://instagram.com/x"), "https://instagram.com/x");
  });

  it("links WhatsApp and phone by their digits", () => {
    assert.equal(contactHref("whatsapp", "+595 981 123-456"), "https://wa.me/595981123456");
    assert.equal(contactHref("phone", "+595 981 123-456"), "tel:+595981123456");
    assert.equal(contactHref("phone", "(0983) 111 222"), "tel:0983111222");
  });

  it("links email", () => {
    assert.equal(contactHref("email", "band@example.com"), "mailto:band@example.com");
  });

  it("links web platforms by their address", () => {
    assert.equal(contactHref("facebook", "https://facebook.com/band"), "https://facebook.com/band");
    assert.equal(contactHref("website", "https://band.example"), "https://band.example");
  });

  it("links Other only when it is a web address", () => {
    assert.equal(contactHref("other", "https://t.me/band"), "https://t.me/band");
    assert.equal(contactHref("other", "Preguntar en el bar"), null);
  });

  it("never links a script address", () => {
    assert.equal(contactHref("other", "javascript:alert(1)"), null);
    assert.equal(contactHref("website", "javascript:alert(1)"), null);
  });
});

describe("isValidContactValue", () => {
  it("wants web addresses for web platforms", () => {
    assert.equal(isValidContactValue("facebook", "https://facebook.com/band"), true);
    assert.equal(isValidContactValue("facebook", "facebook.com/band"), false);
    assert.equal(isValidContactValue("website", "javascript:alert(1)"), false);
  });

  it("wants an email address, and digits for phones", () => {
    assert.equal(isValidContactValue("email", "band@example.com"), true);
    assert.equal(isValidContactValue("email", "band"), false);
    assert.equal(isValidContactValue("phone", "+595 981 123-456"), true);
    assert.equal(isValidContactValue("whatsapp", "abc"), false);
  });

  it("takes any handle for Instagram and any text for Other", () => {
    assert.equal(isValidContactValue("instagram", "@losdelvalle.py"), true);
    assert.equal(isValidContactValue("instagram", "has space"), false);
    assert.equal(isValidContactValue("other", "lo que sea"), true);
  });
});
