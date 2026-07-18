import { Jwt } from 'hono/utils/jwt';

export type JwtPayload = {
  sub: number;
  username: string;
  iat: number;
  exp: number;
};

const DEV_SECRET = 'dev-secret-change-in-production';

export function getSecret(secret?: string): string {
  return secret || DEV_SECRET;
}

export async function createToken(userId: number, username: string, secret?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return Jwt.sign({ sub: userId, username, iat: now, exp: now + 86400 } as any, getSecret(secret));
}

export async function verifyToken(token: string, secret?: string): Promise<JwtPayload> {
  return Jwt.verify(token, getSecret(secret), 'HS256') as Promise<JwtPayload>;
}

export async function generateRefreshToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashRefreshToken(token: string): Promise<string> {
  const buf = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
