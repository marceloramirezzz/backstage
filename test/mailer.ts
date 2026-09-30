import assert from "node:assert/strict";
import type { EmailMessage, Mailer } from "../src/email/mailer.ts";

export interface MemoryMailer extends Mailer {
  sent: EmailMessage[];
}

// Keeps every email in `sent` instead of sending it.
export function memoryMailer(): MemoryMailer {
  const sent: EmailMessage[] = [];
  return {
    appUrl: "https://backstage.test",
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

// The emails sent to `to`, oldest first.
export const sentTo = (mailer: MemoryMailer, to: string) => mailer.sent.filter((m) => m.to === to);

// The token in the one link to `path` in an email.
export function linkToken(message: EmailMessage, path: string): string {
  const links = message.body.match(/https?:\/\/\S+/g) ?? [];
  const matching = links.map((l) => new URL(l)).filter((url) => url.pathname === path);
  assert.equal(matching.length, 1, `expected one link to ${path} in: ${message.body}`);
  const token = matching[0].searchParams.get("token");
  assert.ok(token, `the link to ${path} has no token`);
  return token;
}
