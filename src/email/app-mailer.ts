import { consoleMailer, resendMailer, type Mailer } from "./mailer.ts";

let mailer: Mailer | undefined;

// The app's mailer: Resend in production, the console in development, even
// when a Resend key is in .env. Created on first use, like the pool.
export function getMailer(): Mailer {
  mailer ??= createMailer(process.env);
  return mailer;
}

function createMailer(env: NodeJS.ProcessEnv): Mailer {
  if (env.NODE_ENV !== "production") return consoleMailer(env.APP_URL ?? "http://localhost:3000");
  const { APP_URL, RESEND_API_KEY, EMAIL_FROM } = env;
  if (!APP_URL || !RESEND_API_KEY || !EMAIL_FROM) {
    throw new Error("APP_URL, RESEND_API_KEY and EMAIL_FROM must be set (run scripts/setup-email.sh)");
  }
  return resendMailer(APP_URL, RESEND_API_KEY, EMAIL_FROM);
}
