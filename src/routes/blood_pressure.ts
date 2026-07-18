import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { authMiddleware, getUser } from '../middleware/auth';

type Bindings = { DB: D1Database };
const VALID_CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];

const bp = new Hono<{ Bindings: Bindings }>();

bp.use(authMiddleware);

bp.post('/', async (c) => {
  const { systolic, diastolic, heart_rate, recorded_at, context, tz_offset } = await c.req.json<{
    systolic: number; diastolic: number; heart_rate?: number; recorded_at?: string; context?: string; tz_offset?: number
  }>();

  if (!Number.isInteger(systolic) || systolic < 50 || systolic > 300) return c.json({ error: 'Invalid systolic', code: 400 }, 400);
  if (!Number.isInteger(diastolic) || diastolic < 30 || diastolic > 200) return c.json({ error: 'Invalid diastolic', code: 400 }, 400);

  const ctx = context && VALID_CONTEXTS.includes(context) ? context : heuristicContext(recorded_at, tz_offset);
  const user = getUser(c);
  const db = getDb(c.env);
  const timestamp = recorded_at || new Date().toISOString();

  const result = await db.prepare(
    'INSERT INTO blood_pressure (user_id, systolic, diastolic, heart_rate, context, recorded_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, systolic, diastolic, heart_rate, context, recorded_at, created_at'
  ).bind(user.sub, systolic, diastolic, heart_rate ?? null, ctx, timestamp).first();

  return c.json(result, 201);
});

bp.get('/', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Math.min(parseInt(c.req.query('limit') || '50') || 50, 100);
  const offset = parseInt(c.req.query('offset') || '0') || 0;

  let where = 'WHERE user_id = ?';
  const params: (string | number)[] = [user.sub];
  if (from) { where += ' AND recorded_at >= ?'; params.push(from); }
  if (to) { where += ' AND recorded_at <= ?'; params.push(to); }

  const count = await db.prepare(`SELECT COUNT(*) as total FROM blood_pressure ${where}`).bind(...params).first<{ total: number }>();
  const rows = await db.prepare(`SELECT id, systolic, diastolic, heart_rate, context, recorded_at, created_at FROM blood_pressure ${where} ORDER BY recorded_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();

  return c.json({ readings: rows.results, total: count?.total || 0 });
});

bp.delete('/:id', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);
  const r = await db.prepare('DELETE FROM blood_pressure WHERE id = ? AND user_id = ?').bind(id, user.sub).run();
  if (r.meta.changes === 0) return c.json({ error: 'Not found', code: 404 }, 404);
  return c.json({ message: 'Deleted' });
});

bp.patch('/:id', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const id = parseInt(c.req.param('id'));
  const { context } = await c.req.json<{ context: string }>();
  if (isNaN(id)) return c.json({ error: 'Invalid id', code: 400 }, 400);
  if (!context || !VALID_CONTEXTS.includes(context)) return c.json({ error: 'Invalid context', code: 400 }, 400);
  const r = await db.prepare('UPDATE blood_pressure SET context = ? WHERE id = ? AND user_id = ?').bind(context, id, user.sub).run();
  if (r.meta.changes === 0) return c.json({ error: 'Not found', code: 404 }, 404);
  return c.json({ message: 'Context updated' });
});

bp.post('/bulk', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const contentType = c.req.header('Content-Type') || '';

  let records: { systolic: number; diastolic: number; heart_rate?: number; recorded_at: string; context: string }[] = [];
  let tzOffset = 0;

  if (contentType.includes('multipart/form-data')) {
    const fd = await c.req.parseBody();
    const file = fd['file'] as File;
    tzOffset = parseInt((fd['tz_offset'] as string) || '0') || 0;
    if (!file) return c.json({ error: 'No file uploaded', code: 400 }, 400);
    const text = await file.text();
    records = parseCsvBloodPressure(text, tzOffset);
  } else if (contentType.includes('application/json')) {
    const body = await c.req.json<typeof records>();
    records = body;
  } else if (contentType.includes('text/csv')) {
    const text = await c.req.text();
    records = parseCsvBloodPressure(text, parseInt(c.req.query('tz_offset') || '0') || 0);
  } else {
    return c.json({ error: 'Send JSON, CSV (text/csv), or multipart with file', code: 400 }, 400);
  }

  if (records.length === 0) return c.json({ error: 'No valid records', code: 400 }, 400);

  const stmt = db.prepare('INSERT INTO blood_pressure (user_id, systolic, diastolic, heart_rate, context, recorded_at) VALUES (?, ?, ?, ?, ?, ?)');
  let inserted = 0;
  for (const r of records) {
    await stmt.bind(user.sub, r.systolic, r.diastolic, r.heart_rate ?? null, r.context, r.recorded_at).run();
    inserted++;
  }

  return c.json({ message: `${inserted} blood pressure records imported`, count: inserted }, 201);
});

type CsvBpRecord = { systolic: number; diastolic: number; heart_rate?: number; recorded_at: string; context: string };

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function localToUtc(date: string, time: string, tzOffset: number): string {
  const iso = time ? `${date}T${time}:00` : `${date}T12:00:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso + '.000Z';
  return new Date(d.getTime() - tzOffset * 60000).toISOString();
}

function parseCsvBloodPressure(text: string, tzOffset = 0): CsvBpRecord[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => normalize(h.trim()));
  const results: CsvBpRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    if (vals.length < 3) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => row[h] = vals[idx] || '');

    const systolic = parseInt(row['sistolica'] || row['systolic'] || row['alta'] || '');
    const diastolic = parseInt(row['diastolica'] || row['diastolic'] || row['baja'] || '');
    if (isNaN(systolic) || isNaN(diastolic)) continue;

    const date = row['fecha'] || row['date'] || '';
    const time = row['hora'] || row['time'] || '';
    const recorded_at = localToUtc(date, time, tzOffset);

    results.push({
      systolic,
      diastolic,
      heart_rate: parseInt(row['pulso'] || row['heart_rate'] || row['heartrate'] || '' ) || undefined,
      recorded_at,
      context: row['contexto'] || row['context'] || 'other',
    });
  }
  return results;
}

bp.get('/metrics', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const from = c.req.query('from');
  const to = c.req.query('to');

  let where = 'WHERE user_id = ?';
  const params: (string | number)[] = [user.sub];
  if (from) { where += ' AND recorded_at >= ?'; params.push(from); }
  if (to) { where += ' AND recorded_at <= ?'; params.push(to); }

  const stats = await db.prepare(`SELECT
    COUNT(*) as total,
    AVG(systolic) as sys_avg, AVG(diastolic) as dia_avg,
    MAX(systolic) as sys_max, MIN(systolic) as sys_min,
    MAX(diastolic) as dia_max, MIN(diastolic) as dia_min,
    AVG(heart_rate) as hr_avg
  FROM blood_pressure ${where}`).bind(...params).first<{
    total: number; sys_avg: number | null; dia_avg: number | null;
    sys_max: number | null; sys_min: number | null;
    dia_max: number | null; dia_min: number | null;
    hr_avg: number | null;
  }>();

  if (!stats || stats.total === 0) return c.json({ error: 'No data', code: 404 }, 404);

  const sysAvg = Math.round(stats.sys_avg ?? 0);
  const diaAvg = Math.round(stats.dia_avg ?? 0);
  const hrAvg = stats.hr_avg != null ? Math.round(stats.hr_avg * 10) / 10 : null;

  let classification: string;
  if (sysAvg < 120 && diaAvg < 80) classification = 'normal';
  else if (sysAvg < 130 && diaAvg < 80) classification = 'elevada';
  else if (sysAvg < 140 || diaAvg < 90) classification = 'hipertension_1';
  else if (sysAvg >= 180 || diaAvg >= 120) classification = 'crisis';
  else classification = 'hipertension_2';

  const dailyCount = await db.prepare(`SELECT date(recorded_at) as day, COUNT(*) as count, AVG(systolic) as sys_day, AVG(diastolic) as dia_day FROM blood_pressure ${where} GROUP BY day ORDER BY day DESC`).bind(...params).all<{ day: string; count: number; sys_day: number; dia_day: number }>();

  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  if (dailyCount.results && dailyCount.results.length > 0) {
    const checkDate = new Date(today);
    for (const d of dailyCount.results) {
      const dStr = checkDate.toISOString().slice(0, 10);
      if (d.day === dStr) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
      else break;
    }
  }

  const inRangeCount = await db.prepare(`SELECT COUNT(*) as cnt FROM blood_pressure ${where} AND systolic < 130 AND diastolic < 80`).bind(...params).first<{ cnt: number }>();

  return c.json({
    averages: { systolic: sysAvg, diastolic: diaAvg, heartRate: hrAvg },
    extremes: {
      systolicMax: stats.sys_max, systolicMin: stats.sys_min,
      diastolicMax: stats.dia_max, diastolicMin: stats.dia_min,
    },
    classification,
    inRange: inRangeCount?.cnt ?? 0,
    total: stats.total,
    dailyReadings: (dailyCount.results || []).slice(0, 14).map(d => ({ day: d.day, count: d.count, systolic: Math.round(d.sys_day), diastolic: Math.round(d.dia_day) })),
    streak,
    daysWithReadings: dailyCount.results?.length ?? 0,
  });
});

function heuristicContext(recorded_at?: string, tz_offset?: number): string {
  if (!recorded_at) return 'other';
  try {
    const d = new Date(recorded_at);
    let h = d.getUTCHours();
    if (tz_offset !== undefined) h = (h + Math.round(tz_offset / 60) + 24) % 24;
    if (h >= 5 && h <= 8) return 'fasting';
    if (h >= 9 && h <= 11) return 'after_meal';
    if (h === 12) return 'before_meal';
    if (h >= 13 && h <= 15) return 'after_meal';
    if (h >= 16 && h <= 18) return 'before_meal';
    if (h >= 19 && h <= 21) return 'after_meal';
    return 'bedtime';
  } catch { return 'other'; }
}

export default bp;
