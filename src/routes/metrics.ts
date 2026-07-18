import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../db/client';
import { authMiddleware, getUser } from '../middleware/auth';

type Bindings = { DB: D1Database };

const metrics = new Hono<{ Bindings: Bindings }>();

metrics.use(authMiddleware);

metrics.get('/', async (c) => {
  const user = getUser(c);
  const db = getDb(c.env);
  const from = c.req.query('from');
  const to = c.req.query('to');
  const tzOffset = parseInt(c.req.query('tz_offset') || '') || 0;

  let where = 'WHERE user_id = ?';
  const p: (string | number)[] = [user.sub];
  if (from) { where += ' AND recorded_at >= ?'; p.push(from); }
  if (to) { where += ' AND recorded_at <= ?'; p.push(to); }

  const base = where; const bp = [...p];
  const fw = where + ' AND context = \'fasting\'';
  const pw = where + ' AND context = \'after_meal\'';
  const bw = where + ' AND context = \'before_meal\'';
  const btw = where + ' AND context = \'bedtime\'';

  const [stats, fasting, pp, bm, bed, hours, dailyInRange, dailyCount] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total, AVG(value) as avg, MAX(value) as max, MIN(value) as min FROM readings ${base}`).bind(...bp).first<{ total: number; avg: number | null; max: number | null; min: number | null }>(),
    db.prepare(`SELECT AVG(value) as avg, COUNT(*) as count, SUM(CASE WHEN value >= 70 AND value <= 100 THEN 1 ELSE 0 END) as in_range FROM readings ${fw}`).bind(...bp).first<{ avg: number | null; count: number; in_range: number }>(),
    db.prepare(`SELECT AVG(value) as avg, COUNT(*) as count, SUM(CASE WHEN value >= 70 AND value < 140 THEN 1 ELSE 0 END) as in_range FROM readings ${pw}`).bind(...bp).first<{ avg: number | null; count: number; in_range: number }>(),
    db.prepare(`SELECT AVG(value) as avg, COUNT(*) as count, SUM(CASE WHEN value >= 70 AND value <= 130 THEN 1 ELSE 0 END) as in_range FROM readings ${bw}`).bind(...bp).first<{ avg: number | null; count: number; in_range: number }>(),
    db.prepare(`SELECT AVG(value) as avg, COUNT(*) as count, SUM(CASE WHEN value >= 70 AND value <= 150 THEN 1 ELSE 0 END) as in_range FROM readings ${btw}`).bind(...bp).first<{ avg: number | null; count: number; in_range: number }>(),
    db.prepare(`SELECT CAST(strftime('%H', recorded_at) AS INTEGER) as hour, AVG(value) as avg, COUNT(*) as count FROM readings ${base} GROUP BY hour ORDER BY avg DESC`).bind(...bp).all<{ hour: number; avg: number; count: number }>(),
    db.prepare(`SELECT date(recorded_at) as day, context, value FROM readings ${base} ORDER BY day`).bind(...bp).all<{ day: string; context: string; value: number }>(),
    db.prepare(`SELECT date(recorded_at) as day, COUNT(*) as count FROM readings ${base} GROUP BY day ORDER BY day DESC`).bind(...bp).all<{ day: string; count: number }>(),
  ]);

  if (!stats) return c.json({ error: 'No data', code: 404 }, 404);

  // In range per context
  const ctxRanges: Record<string, { low: number; high: number }> = {
    fasting: { low: 70, high: 100 },
    after_meal: { low: 70, high: 140 },
    before_meal: { low: 70, high: 130 },
    bedtime: { low: 70, high: 150 },
    other: { low: 70, high: 140 },
  };

  const byContext: Record<string, { total: number; inRange: number; avg: number | null }> = {};
  for (const r of (dailyInRange?.results || [])) {
    const ctx = r.context || 'other';
    if (!byContext[ctx]) byContext[ctx] = { total: 0, inRange: 0, avg: null };
    byContext[ctx].total++;
    const range = ctxRanges[ctx] || ctxRanges.other;
    if (r.value >= range.low && r.value <= range.high) byContext[ctx].inRange++;
  }

  const ctxDefs = [
    { key: 'fasting', label: 'En ayunas', range: '70-100', status: (a: number) => a <= 100 ? { cls: 'good', emoji: '✅', msg: 'Normal' } : a <= 125 ? { cls: 'warn', emoji: '👀', msg: 'Prediabetes' } : { cls: 'bad', emoji: '🔴', msg: 'Diabetes' } },
    { key: 'after_meal', label: 'Después de comer', range: '70-140', status: (a: number) => a < 140 ? { cls: 'good', emoji: '✅', msg: 'Normal' } : a < 200 ? { cls: 'warn', emoji: '👀', msg: 'Elevado' } : { cls: 'bad', emoji: '🔴', msg: 'Muy alto' } },
    { key: 'before_meal', label: 'Antes de comer', range: '70-130', status: (a: number) => a <= 130 ? { cls: 'good', emoji: '✅', msg: 'Normal' } : { cls: 'warn', emoji: '👀', msg: 'Elevado' } },
    { key: 'bedtime', label: 'Al acostarse', range: '70-150', status: (a: number) => a <= 150 ? { cls: 'good', emoji: '✅', msg: 'Normal' } : { cls: 'warn', emoji: '👀', msg: 'Elevado' } },
  ];

  const ctxMetrics = ctxDefs.map(def => {
    const data = byContext[def.key];
    const avg = data?.avg ?? (def.key === 'fasting' ? fasting?.avg : def.key === 'after_meal' ? pp?.avg : def.key === 'before_meal' ? bm?.avg : bed?.avg);
    const count = data?.total ?? (def.key === 'fasting' ? fasting?.count : def.key === 'after_meal' ? pp?.count : def.key === 'before_meal' ? bm?.count : bed?.count) ?? 0;
    const inR = data?.inRange ?? 0;
    return {
      ...def,
      avg: avg ?? null,
      count,
      inRange: inR,
      inRangePct: count > 0 ? Math.round(inR / count * 100) : 0,
      status: avg != null ? def.status(avg) : { cls: '', emoji: '📊', msg: 'Sin datos' },
    };
  });

  const total = stats.total;
  const inRangeTotal = ctxMetrics.reduce((s, m) => s + m.inRange, 0);

  const tzShift = Math.round(tzOffset / 60);
  const peakHours = ((hours?.results || []).map(h => ({ ...h, hour: (h.hour + tzShift + 24) % 24 })).sort((a, b) => b.avg - a.avg)).slice(0, 5);
  const totalDays = (dailyCount?.results || []).length;

  const thisWeekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const lastWeekStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  let weekComparison = { thisWeek: null as number | null, lastWeek: null as number | null };
  if (!from && !to) {
    const [thisW, lastW] = await Promise.all([
      db.prepare(`SELECT AVG(value) as avg FROM readings WHERE user_id = ? AND date(recorded_at) >= ?`).bind(user.sub, thisWeekStart).first<{ avg: number | null }>(),
      db.prepare(`SELECT AVG(value) as avg FROM readings WHERE user_id = ? AND date(recorded_at) >= ? AND date(recorded_at) < ?`).bind(user.sub, lastWeekStart, thisWeekStart).first<{ avg: number | null }>(),
    ]);
    weekComparison = { thisWeek: thisW?.avg ?? null, lastWeek: lastW?.avg ?? null };
  }

  let streak = 0;
  if (dailyCount.results && dailyCount.results.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...dailyCount.results].sort((a, b) => b.day.localeCompare(a.day));
    const checkDate = new Date(sorted[0].day);
    if (sorted[0].day < today && Math.floor((new Date(today).getTime() - checkDate.getTime()) / 86400000) > 1) streak = 0;
    else {
      for (const d of sorted) {
        const dStr = checkDate.toISOString().slice(0, 10);
        if (d.day === dStr) { streak++; checkDate.setDate(checkDate.getDate() - 1); } else break;
      }
    }
  }

  // Daily in range % (for the chart at bottom)
  const dailyPct: Record<string, { total: number; inRange: number }> = {};
  for (const r of (dailyInRange?.results || [])) {
    if (!dailyPct[r.day]) dailyPct[r.day] = { total: 0, inRange: 0 };
    dailyPct[r.day].total++;
    const range = ctxRanges[r.context] || ctxRanges.other;
    if (r.value >= range.low && r.value <= range.high) dailyPct[r.day].inRange++;
  }
  const dailyChart = Object.entries(dailyPct).map(([day, v]) => ({ day, pct: v.total > 0 ? Math.round(v.inRange / v.total * 100) : 0 })).sort((a, b) => a.day.localeCompare(b.day));

  return c.json({
    byContext: ctxMetrics,
    overall: { total, avg: stats.avg ?? null, max: stats.max ?? null, min: stats.min ?? null },
    weekComparison,
    peakHours,
    streak,
    daysWithReadings: totalDays,
    dailyChart: dailyChart.slice(-14),
  });
});

export default metrics;
