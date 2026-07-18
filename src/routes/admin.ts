import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { authMiddleware, getUser } from '../middleware/auth';
import { sendWhatsApp } from '../lib/waha';
import { auditLog, ensureLogTable } from '../lib/logger';
import { buildWeeklyReport, sendWeeklyReportToAll } from '../lib/report';

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

  const target = await db.prepare('SELECT username FROM users WHERE id = ?').bind(id).first<{ username: string }>();
  await auditLog(db, user.sub, user.username, 'admin.user.update', `Usuario #${id} (${target?.username || '?'}) modificado por ${user.username}`);

  return c.json({ message: 'Usuario actualizado' });
});

admin.delete('/users/:id', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);
  const user = getUser(c);
  if (id === user.sub) return c.json({ error: 'No puedes eliminarte a ti mismo', code: 400 }, 400);

  const target = await db.prepare('SELECT username FROM users WHERE id = ?').bind(id).first<{ username: string }>();
  await db.prepare('DELETE FROM readings WHERE user_id = ?').bind(id).run();
  await db.prepare('DELETE FROM blood_pressure WHERE user_id = ?').bind(id).run();
  const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: 'User not found', code: 404 }, 404);

  await auditLog(db, user.sub, user.username, 'admin.user.delete', `Usuario #${id} (${target?.username || '?'}) eliminado por ${user.username}`);

  return c.json({ message: 'Usuario y todos sus datos eliminados' });
});

admin.post('/broadcast', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const { message, delay_ms } = await c.req.json<{ message: string; delay_ms?: number }>();
  const baseDelay = Math.max(1000, Math.min(30000, delay_ms || 3000));

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return c.json({ error: 'Mensaje requerido', code: 400 }, 400);
  }

  const users = await db.prepare(
    'SELECT id, username, phone FROM users WHERE phone IS NOT NULL AND phone != \'\''
  ).all<{ id: number; username: string; phone: string }>();

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < users.results.length; i++) {
    const u = users.results[i];
    const result = await sendWhatsApp(c.env, u.phone, message.trim());
    if (result.ok) sent++;
    else {
      failed++;
      errors.push(`${u.username} (${u.phone}): ${result.error || 'desconocido'}`);
    }
    if (i < users.results.length - 1) {
      const jitter = baseDelay * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, Math.round(jitter)));
    }
  }

  const user = getUser(c);
  const errorSummary = errors.length > 0 ? ` | Errores: ${errors.slice(0, 5).join(' | ')}${errors.length > 5 ? ` (+${errors.length - 5} más)` : ''}` : '';
  await auditLog(db, user.sub, user.username, 'admin.broadcast',
    `Broadcast a ${users.results.length} usuario(s): ${sent} enviados, ${failed} fallidos. Delay: ${baseDelay}ms${errorSummary}`
  );

  const firstErrors = errors.slice(0, 3);
  return c.json({
    message: `Broadcast enviado: ${sent} enviados, ${failed} fallidos`,
    total: users.results.length,
    sent,
    failed,
    delay_ms: baseDelay,
    errors: firstErrors,
    totalErrors: errors.length,
  });
});

admin.post('/report', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  const user = getUser(c);
  const { user_id } = await c.req.json<{ user_id?: number | null }>();

  if (user_id) {
    const target = await db.prepare('SELECT id, username, phone FROM users WHERE id = ?').bind(user_id).first<{ id: number; username: string; phone: string }>();
    if (!target) return c.json({ error: 'Usuario no encontrado', code: 404 }, 404);
    if (!target.phone) return c.json({ error: 'El usuario no tiene WhatsApp configurado', code: 400 }, 400);

    const msg = await buildWeeklyReport(db, target.id, target.username);
    const result = await sendWhatsApp(c.env, target.phone, msg);
    await auditLog(db, user.sub, user.username, 'admin.report.single', `Resumen enviado a ${target.username} (${target.phone}): ${result.ok ? 'ok' : 'falló: ' + (result.error || '')}`);

    return c.json({
      message: result.ok ? `✓ Resumen enviado a ${target.username}` : `✗ Error: ${result.error || 'desconocido'}`,
      ok: result.ok,
      error: result.error,
    });
  }

  const result = await sendWeeklyReportToAll(db, c.env, 10000);
  await auditLog(db, user.sub, user.username, 'admin.report.all',
    `Resumen semanal enviado a ${result.sent + result.failed} usuario(s): ${result.sent} enviados, ${result.failed} fallidos${result.errors.length > 0 ? ' | Errores: ' + result.errors.slice(0, 5).join(' | ') : ''}`
  );

  return c.json({
    message: `Resumen enviado: ${result.sent} enviados, ${result.failed} fallidos`,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors.slice(0, 3),
    totalErrors: result.errors.length,
  });
});

admin.get('/logs', async (c) => {
  if (!(await checkAdmin(c))) return;
  const db = getDb(c.env);
  await ensureLogTable(db);
  const page = parseInt(c.req.query('page') || '0');
  const limit = 50;
  const offset = page * limit;

  const logs = await db.prepare(
    'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();

  const count = await db.prepare('SELECT COUNT(*) as c FROM audit_logs').first<{ c: number }>();

  return c.json({ logs: logs.results, total: count?.c || 0, page, limit });
});

export default admin;
