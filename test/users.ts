import { signUp, verifyEmail, type User } from "../src/services/accounts.ts";
import type { TestDb } from "./test-db.ts";

// A password User who has verified their email.
export async function verifiedUser(db: TestDb, email: string): Promise<User> {
  const { verificationToken } = await signUp(db.pool, {
    email,
    password: "a password",
    displayName: email,
  });
  return verifyEmail(db.pool, verificationToken);
}
