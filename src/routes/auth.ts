import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { hashPassword, verifyPassword } from '../lib/hash';
import { createToken, verifyToken, generateRefreshToken, hashRefreshToken } from '../lib/jwt';

type Env = { DB: D1Database; JWT_SECRET?: string };

const auth = new Hono<{ Bindings: Env }>();

const REFRESH_EXPIRY_DAYS = 90;

async function storeRefreshToken(db: D1Database, userId: number): Promise<string> {
  const raw = await generateRefreshToken();
  const tokenHash = await hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400000).toISOString();
  await db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(userId, tokenHash, expiresAt).run();
  return raw;
}

auth.post('/register', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 30) {
    return c.json({ error: 'Username must be 3-30 characters', code: 400 }, 400);
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters', code: 400 }, 400);
  }

  const db = getDb(c.env);
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) {
    return c.json({ error: 'Username already taken', code: 409 }, 409);
  }

  const passwordHash = await hashPassword(password);
  const result = await db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id').bind(username, passwordHash).first<{ id: number }>();

  const [token, refreshToken] = await Promise.all([
    createToken(result!.id, username, c.env.JWT_SECRET),
    storeRefreshToken(db, result!.id),
  ]);
  return c.json({ token, refreshToken, user: { id: result!.id, username, role: 'user' } }, 201);
});

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (!username || !password) {
    return c.json({ error: 'Username and password required', code: 400 }, 400);
  }

  const db = getDb(c.env);
  const user = await db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').bind(username).first<{ id: number; username: string; password_hash: string; role: string }>();
  if (!user) {
    return c.json({ error: 'Invalid credentials', code: 401 }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials', code: 401 }, 401);
  }

  const [token, refreshToken] = await Promise.all([
    createToken(user.id, user.username, c.env.JWT_SECRET),
    storeRefreshToken(db, user.id),
  ]);
  return c.json({ token, refreshToken, user: { id: user.id, username: user.username, role: user.role || 'user' } });
});

auth.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>();
  if (!refreshToken) {
    return c.json({ error: 'refreshToken required', code: 400 }, 400);
  }

  const db = getDb(c.env);
  const tokenHash = await hashRefreshToken(refreshToken);
  const stored = await db.prepare(
    'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ?'
  ).bind(tokenHash).first<{ id: number; user_id: number; expires_at: string }>();

  if (!stored) {
    return c.json({ error: 'Invalid refresh token', code: 401 }, 401);
  }

  if (new Date(stored.expires_at) < new Date()) {
    await db.prepare('DELETE FROM refresh_tokens WHERE id = ?').bind(stored.id).run();
    return c.json({ error: 'Refresh token expired', code: 401 }, 401);
  }

  const user = await db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(stored.user_id).first<{ id: number; username: string; role: string }>();
  if (!user) {
    await db.prepare('DELETE FROM refresh_tokens WHERE id = ?').bind(stored.id).run();
    return c.json({ error: 'User not found', code: 401 }, 401);
  }

  await db.prepare('DELETE FROM refresh_tokens WHERE id = ?').bind(stored.id).run();

  const [newToken, newRefreshToken] = await Promise.all([
    createToken(user.id, user.username, c.env.JWT_SECRET),
    storeRefreshToken(db, user.id),
  ]);

  return c.json({ token: newToken, refreshToken: newRefreshToken });
});

auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', code: 401 }, 401);
  }

  try {
    const payload = await verifyToken(authHeader.slice(7), c.env.JWT_SECRET);
    const db = getDb(c.env);
    await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(payload.sub).run();
    return c.json({ message: 'Logged out' });
  } catch {
    return c.json({ error: 'Invalid token', code: 401 }, 401);
  }
});

export default auth;
