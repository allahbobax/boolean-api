import bcrypt from 'bcryptjs';
import { getDb } from './db.js';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export async function rehashLegacyPassword(userId: number, password: string): Promise<string> {
  const sql = getDb();
  const hashedPassword = await hashPassword(password);
  await sql`UPDATE users SET password = ${hashedPassword} WHERE id = ${userId}`;
  return hashedPassword;
}

export async function passwordsMatch(
  user: { id: number; password: string | null },
  inputPassword: string
): Promise<boolean> {
  if (!user.password) return false;

  if (user.password.startsWith('$2')) {
    return comparePassword(inputPassword, user.password);
  }

  if (user.password === inputPassword) {
    await rehashLegacyPassword(user.id, inputPassword);
    return true;
  }

  const encodedInput = Buffer.from(inputPassword).toString('base64');
  if (user.password === encodedInput) {
    await rehashLegacyPassword(user.id, inputPassword);
    return true;
  }

  try {
    const decodedStored = Buffer.from(user.password, 'base64').toString('utf-8');
    if (decodedStored === inputPassword) {
      await rehashLegacyPassword(user.id, inputPassword);
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}
