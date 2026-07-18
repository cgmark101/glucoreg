import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { authMiddleware, getUser } from '../middleware/auth';
import { sendWhatsApp } from '../lib/waha';

type Bindings = { DB: D1Database; WAHA_API_KEY: string; WAHA_BASE_URL?: string };

const admin = new Hono<{ Bindings: Bindings }>();

admin.use(authMiddleware);

async function checkAdmin(c: any): Promise<boolean> {
  const user = getUser(c);
  const db = getDb(c.env);
  const me = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
  if (!me || me.role !== 'admin') { c.json({ error: 'Forbidden', code: 403 }, 403); return false; }
  return true;
}

admin.get('/users', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const users = await db.prepare(`
    SELECT u.id, u.username, u.role, u.phone, u.email, u.created_at,
      (SELECT COUNT(*) FROM readings WHERE user_id = u.id) as readings,
      (SELECT COUNT(*) FROM blood_pressure WHERE user_id = u.id) as blood_pressure
    FROM users u ORDER BY u.id
  `).all();
  return c.json({ users: users.results });
});

admin.patch('/users/:id', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);
  const { username, role, phone, email } = await c.req.json<{ username?: string; role?: string; phone?: string | null; email?: string | null }>();
  const user = getUser(c);
  if (id === user.sub) return c.json({ error: 'No puedes modificarte a ti mismo', code: 400 }, 400);

  if (role && !['admin', 'user'].includes(role)) return c.json({ error: 'Rol inválido', code: 400 }, 400);
  if (username && (typeof username !== 'string' || username.length < 3)) return c.json({ error: 'Username inválido', code: 400 }, 400);

  if (username) {
    const exists = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, id).first();
    if (exists) return c.json({ error: 'Username ya existe', code: 409 }, 409);
  }

  const updates: string[] = [];
  const vals: (string | number | null)[] = [];
  if (role) { updates.push('role = ?'); vals.push(role); }
  if (username) { updates.push('username = ?'); vals.push(username); }
  if (phone !== undefined) { updates.push('phone = ?'); vals.push(phone || null); }
  if (email !== undefined) { updates.push('email = ?'); vals.push(email || null); }
  if (updates.length === 0) return c.json({ error: 'Nada que actualizar', code: 400 }, 400);
  vals.push(id);

  const result = await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...vals as any).run();
  if (result.meta.changes === 0) return c.json({ error: 'User not found', code: 404 }, 404);
  return c.json({ message: 'Usuario actualizado' });
});

admin.delete('/users/:id', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);
  const user = getUser(c);
  if (id === user.sub) return c.json({ error: 'No puedes eliminarte a ti mismo', code: 400 }, 400);

  await db.prepare('DELETE FROM readings WHERE user_id = ?').bind(id).run();
  await db.prepare('DELETE FROM blood_pressure WHERE user_id = ?').bind(id).run();
  const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: 'User not found', code: 404 }, 404);
  return c.json({ message: 'Usuario y todos sus datos eliminados' });
});

admin.post('/broadcast', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const { message, delay_ms } = await c.req.json<{ message: string; delay_ms?: number }>();
  const delay = Math.max(0, Math.min(10000, delay_ms || 500));

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return c.json({ error: 'Mensaje requerido', code: 400 }, 400);
  }

  const users = await db.prepare(
    'SELECT id, username, phone FROM users WHERE phone IS NOT NULL AND phone != \'\''
  ).all<{ id: number; username: string; phone: string }>();

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < users.results.length; i++) {
    const u = users.results[i];
    const ok = await sendWhatsApp(c.env, u.phone, message.trim());
    if (ok) sent++; else failed++;
    if (delay > 0 && i < users.results.length - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return c.json({
    message: `Broadcast enviado: ${sent} enviados, ${failed} fallidos`,
    total: users.results.length,
    sent,
    failed,
  });
});

export default admin;
