export interface EmailAttachment {
  filename: string;
  // e.g. `text/calendar; method=REQUEST`
  contentType: string;
  // Text, sent as it is.
  content: string;
}

// One email: plain text, one recipient, optionally with attachments.
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
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
    async send({ to, subject, body, attachments = [] }) {
      const files = attachments.map((a) => `\n[Attachment ${a.filename}]\n${a.content}`).join("");
      console.log(`\n--- Email to ${to}: ${subject}\n${body}${files}\n---\n`);
    },
  };
}

// Sends through Resend's HTTP API. `from` must be on a domain verified in Resend.
export function resendMailer(appUrl: string, apiKey: string, from: string): Mailer {
  return {
    appUrl,
    async send({ to, subject, body, attachments }) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          subject,
          text: body,
          ...(attachments && {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content).toString("base64"),
              content_type: a.contentType,
            })),
          }),
        }),
      });
      if (!response.ok) {
        throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
      }
    },
  };
}
