import * as jose from 'jose';
import type { User } from '../types';

const encoder = new TextEncoder();

export async function generateToken(user: User): Promise<string> {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. Application cannot start without it.');
  }
  
  const secretKey = encoder.encode(secret);
  
  return await new jose.SignJWT({ 
    id: user.id, 
    email: user.email, 
    isAdmin: user.is_admin 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<jose.JWTPayload | null> {
  try {
    const secret = process.env.JWT_SECRET;
    const secretKey = encoder.encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload;
  } catch {
    return null;
  }
}
