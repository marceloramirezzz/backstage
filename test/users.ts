import { signUp, verifyEmail, type User } from "../src/services/accounts.ts";
import { linkToken, memoryMailer } from "./mailer.ts";
import type { TestDb } from "./test-db.ts";

// A password User who has verified their email.
export async function verifiedUser(db: TestDb, email: string): Promise<User> {
  const mailer = memoryMailer();
  await signUp(db.pool, mailer, { email, password: "a password", displayName: email });
  const { user } = await verifyEmail(db.pool, linkToken(mailer.sent[0], "/verificar"));
  return user;
}
