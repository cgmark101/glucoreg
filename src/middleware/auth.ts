import type { Context, Next } from 'hono';
import { verifyToken, type JwtPayload } from '../lib/jwt';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', code: 401 }, 401);
  }

  try {
    const env = c.env as { JWT_SECRET?: string };
    const payload = await verifyToken(authHeader.slice(7), env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token', code: 401 }, 401);
  }
}

export function getUser(c: Context): JwtPayload {
  return c.get('user') as JwtPayload;
}
