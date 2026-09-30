// One email: plain text, one recipient.
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

// Sends email. Resend backs it in production, the console in development and
// an in-memory fake in tests.
export interface Mailer {
  // The site the links in its emails point to, e.g. "https://backstage.com.py".
  readonly appUrl: string;
  send(message: EmailMessage): Promise<void>;
}

// Prints each email instead of sending it, so links can be followed locally.
export function consoleMailer(appUrl: string): Mailer {
  return {
    appUrl,
    async send({ to, subject, body }) {
      console.log(`\n--- Email to ${to}: ${subject}\n${body}\n---\n`);
    },
  };
}

// Sends through Resend's HTTP API. `from` must be on a domain verified in Resend.
export function resendMailer(appUrl: string, apiKey: string, from: string): Mailer {
  return {
    appUrl,
    async send({ to, subject, body }) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text: body }),
      });
      if (!response.ok) {
        throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
      }
    },
  };
}
