import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkToken, memoryMailer } from "../../test/mailer.ts";
import { invitationEmail } from "./invitation-email.ts";

describe("invitationEmail", () => {
  it("addresses the invitee and carries a link back to the Invitación", () => {
    const mailer = memoryMailer();

    const email = invitationEmail(
      mailer,
      { email: "pablo@example.com", projectName: "Los del Valle", roleName: "Roadie", invitedByName: "Diego" },
      "abc123",
    );

    assert.equal(email.to, "pablo@example.com");
    assert.match(email.subject, /Diego/);
    assert.match(email.subject, /Los del Valle/);
    assert.match(email.body, /Roadie/);
    assert.equal(linkToken(email, "/invitacion"), "abc123");
  });
});
