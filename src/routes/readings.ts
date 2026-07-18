import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { authMiddleware, getUser } from '../middleware/auth';

type Bindings = { DB: D1Database };
const VALID_CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];

const readings = new Hono<{ Bindings: Bindings }>();

readings.use(authMiddleware);

readings.post('/', async (c) => {
  const { value, recorded_at, context, tz_offset } = await c.req.json<{ value: number; recorded_at?: string; context?: string; tz_offset?: number }>();

  if (typeof value !== 'number' || value <= 0) {
    return c.json({ error: 'Value must be a positive number', code: 400 }, 400);
  }

  const ctx = context && VALID_CONTEXTS.includes(context) ? context : heuristicContext(recorded_at, tz_offset);
  const user = getUser(c);
  const db = getDb(c.env);
  const timestamp = recorded_at || new Date().toISOString();

  const result = await db.prepare('INSERT INTO readings (user_id, value, recorded_at, context) VALUES (?, ?, ?, ?) RETURNING id, value, recorded_at, context, created_at').bind(user.sub, value, timestamp, ctx).first<{ id: number; value: number; recorded_at: string; context: string; created_at: string }>();

  return c.json(result, 201);
});

readings.get('/', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);

  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Math.min(parseInt(c.req.query('limit') || '50') || 50, 100);
  const offset = parseInt(c.req.query('offset') || '0') || 0;

  let where = 'WHERE user_id = ?';
  const params: (string | number)[] = [user.sub];

  if (from) {
    where += ' AND recorded_at >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND recorded_at <= ?';
    params.push(to);
  }

  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM readings ${where}`).bind(...params).first<{ total: number }>();
  const readings = await db.prepare(`SELECT id, value, recorded_at, context, created_at FROM readings ${where} ORDER BY recorded_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();

  return c.json({ readings: readings.results, total: countResult?.total || 0 });
});

readings.patch('/:id', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));
  const { context } = await c.req.json<{ context: string }>();

  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);
  if (!context || !VALID_CONTEXTS.includes(context)) return c.json({ error: 'Invalid context', code: 400 }, 400);

  const result = await db.prepare('UPDATE readings SET context = ? WHERE id = ? AND user_id = ?').bind(context, id, user.sub).run();
  if (result.meta.changes === 0) return c.json({ error: 'Reading not found', code: 404 }, 404);

  return c.json({ message: 'Context updated' });
});

readings.delete('/:id', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);

  const result = await db.prepare('DELETE FROM readings WHERE id = ? AND user_id = ?').bind(id, user.sub).run();
  if (result.meta.changes === 0) return c.json({ error: 'Reading not found', code: 404 }, 404);

  return c.json({ message: 'Reading deleted' });
});

readings.post('/bulk', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const contentType = c.req.header('Content-Type') || '';

  let records: { value: number; recorded_at: string; context: string }[] = [];
  let tzOffset = 0;

  if (contentType.includes('multipart/form-data')) {
    const fd = await c.req.parseBody();
    const file = fd['file'] as File;
    tzOffset = parseInt((fd['tz_offset'] as string) || '0') || 0;
    if (!file) return c.json({ error: 'No file uploaded', code: 400 }, 400);
    records = parseCsvReadings(await file.text(), tzOffset);
  } else if (contentType.includes('application/json')) {
    records = await c.req.json<typeof records>();
  } else if (contentType.includes('text/csv')) {
    records = parseCsvReadings(await c.req.text(), parseInt(c.req.query('tz_offset') || '0') || 0);
  } else {
    return c.json({ error: 'Send JSON, CSV (text/csv), or multipart with file', code: 400 }, 400);
  }

  if (records.length === 0) return c.json({ error: 'No valid records', code: 400 }, 400);

  const stmt = db.prepare('INSERT INTO readings (user_id, value, context, recorded_at) VALUES (?, ?, ?, ?)');
  let inserted = 0;
  for (const r of records) {
    await stmt.bind(user.sub, r.value, r.context, r.recorded_at).run();
    inserted++;
  }

  return c.json({ message: `${inserted} readings imported`, count: inserted }, 201);
});

type CsvReading = { value: number; recorded_at: string; context: string };

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function localToUtc(date: string, time: string, tzOffset: number): string {
  const iso = time ? `${date}T${time}:00` : `${date}T12:00:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso + '.000Z';
  return new Date(d.getTime() - tzOffset * 60000).toISOString();
}

function parseCsvReadings(text: string, tzOffset = 0): CsvReading[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => normalize(h.trim()));
  const results: CsvReading[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    if (vals.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => row[h] = vals[idx] || '');

    const value = parseFloat(row['valor'] || row['value'] || row['glucosa'] || row['glucose'] || '');
    if (isNaN(value) || value <= 0) continue;

    const date = row['fecha'] || row['date'] || '';
    const time = row['hora'] || row['time'] || '';
    const recorded_at = localToUtc(date, time, tzOffset);

    results.push({
      value,
      recorded_at,
      context: row['contexto'] || row['context'] || 'other',
    });
  }
  return results;
}

function localHour(recorded_at: string, tz_offset?: number): number {
  const d = new Date(recorded_at);
  let h = d.getUTCHours();
  if (tz_offset !== undefined) {
    h = (h + Math.round(tz_offset / 60) + 24) % 24;
  }
  return h;
}

function heuristicContext(recorded_at?: string, tz_offset?: number): string {
  if (!recorded_at) return 'other';
  try {
    const h = localHour(recorded_at, tz_offset);
    if (h >= 5 && h <= 8) return 'fasting';
    if (h >= 9 && h <= 11) return 'after_meal';
    if (h === 12) return 'before_meal';
    if (h >= 13 && h <= 15) return 'after_meal';
    if (h >= 16 && h <= 18) return 'before_meal';
    if (h >= 19 && h <= 21) return 'after_meal';
    return 'bedtime';
  } catch { return 'other'; }
}

export default readings;
