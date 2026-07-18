import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { authMiddleware, getUser } from '../middleware/auth';

type Env = { DB: D1Database; JWT_SECRET?: string };

const profile = new Hono<{ Bindings: Env }>();

profile.use(authMiddleware);

profile.get('/', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const row = await db.prepare(
    'SELECT id, username, role, phone, email, created_at FROM users WHERE id = ?'
  ).bind(user.sub).first<{
    id: number; username: string; role: string;
    phone: string | null; email: string | null; created_at: string;
  }>();
  if (!row) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: row });
});

profile.patch('/', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const { phone, email } = await c.req.json<{ phone?: string; email?: string }>();

  const updates: string[] = [];
  const vals: (string | null)[] = [];

  if (phone !== undefined) { updates.push('phone = ?'); vals.push(phone || null); }
  if (email !== undefined) { updates.push('email = ?'); vals.push(email || null); }
  if (updates.length === 0) return c.json({ error: 'Nada que actualizar' }, 400);
  vals.push(user.sub as unknown as string);

  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...vals as any).run();
  return c.json({ message: 'Perfil actualizado' });
});

export default profile;
