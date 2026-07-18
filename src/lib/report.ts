import type { D1Database } from '@cloudflare/workers-types';
import { sendWhatsApp, type WahaEnv } from './waha';

export async function buildWeeklyReport(
  db: D1Database,
  userId: number,
  username: string
): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [glucoseStats, bpStats, glucoseDays, bpDays, streak] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) as total, AVG(value) as avg,
        SUM(CASE WHEN value >= 70 AND value <= 100 THEN 1 ELSE 0 END) as fasting_in_range
      FROM readings WHERE user_id = ? AND recorded_at >= ?
    `).bind(userId, weekAgo).first<{ total: number; avg: number | null; fasting_in_range: number }>(),

    db.prepare(`
      SELECT COUNT(*) as total, AVG(systolic) as sys_avg, AVG(diastolic) as dia_avg
      FROM blood_pressure WHERE user_id = ? AND recorded_at >= ?
    `).bind(userId, weekAgo).first<{ total: number; sys_avg: number | null; dia_avg: number | null }>(),

    db.prepare(`
      SELECT COUNT(DISTINCT date(recorded_at)) as days FROM readings
      WHERE user_id = ? AND recorded_at >= ?
    `).bind(userId, weekAgo).first<{ days: number }>(),

    db.prepare(`
      SELECT COUNT(DISTINCT date(recorded_at)) as days FROM blood_pressure
      WHERE user_id = ? AND recorded_at >= ?
    `).bind(userId, weekAgo).first<{ days: number }>(),

    db.prepare(`
      WITH dates AS (
        SELECT date(recorded_at) as d FROM readings WHERE user_id = ?
        UNION SELECT date(recorded_at) FROM blood_pressure WHERE user_id = ?
      )
      SELECT COUNT(*) as streak FROM dates WHERE d >= date('now', '-' || (
        SELECT min(d) FROM (
          SELECT julianday('now') - julianday(d) - row_number() OVER (ORDER BY d DESC) as gap
          FROM (SELECT DISTINCT date(recorded_at) as d FROM readings WHERE user_id = ?
            UNION SELECT DISTINCT date(recorded_at) FROM blood_pressure WHERE user_id = ?)
        ) WHERE gap = 0
      ) || ' days')
    `).bind(userId, userId, userId, userId).first<{ streak: number }>(),
  ]);

  const glucDays = glucoseDays?.days || 0;
  const bpD = bpDays?.days || 0;
  const combinedDays = new Set<number>();
  const todayGluc = glucoseStats?.total || 0;
  const currentStreak = streak?.streak || 0;

  let msg = `📊 *Resumen Semanal — GlucoReg*\n`;
  msg += `Hola *${username}*, acá están tus métricas de la última semana:\n\n`;

  if (glucoseStats && glucoseStats.total > 0) {
    const avg = Math.round(glucoseStats.avg ?? 0);
    msg += `🍬 *Glucosa:*\n`;
    msg += `📈 ${glucoseStats.total} lecturas en ${glucDays} día(s) · Promedio ${avg} mg/dL\n`;
    if (glucoseStats.fasting_in_range > 0) {
      msg += `🌅 Ayunas en rango: ${glucoseStats.fasting_in_range} vez/ces\n`;
    }
    if (glucDays < 7) {
      msg += `⚠️ Sin registro ${7 - glucDays} día(s) esta semana\n`;
    }
  } else {
    msg += `🍬 *Glucosa:* sin lecturas esta semana\n`;
  }

  if (bpStats && bpStats.total > 0) {
    const sys = Math.round(bpStats.sys_avg ?? 0);
    const dia = Math.round(bpStats.dia_avg ?? 0);
    msg += `\n💓 *Presión Arterial:*\n`;
    msg += `📈 ${bpStats.total} mediciones en ${bpD} día(s) · ${sys}/${dia} mmHg\n`;
    if (bpD < 7) {
      msg += `⚠️ Sin registro ${7 - bpD} día(s) esta semana\n`;
    }
  } else {
    msg += `\n💓 *Presión Arterial:* sin mediciones esta semana\n`;
  }

  if (currentStreak > 0) {
    msg += `\n🔥 Racha actual: ${currentStreak} día(s) seguidos`;
  }

  if (!glucoseStats?.total && !bpStats?.total) {
    msg += `\n📭 No registraste nada esta semana.\n`;
    msg += `¡Animate a registrar para ver tu evolución!\n`;
  } else {
    msg += `\n\n¡Seguí así! 💪 Cuidar tu salud es el mejor hábito.`;
  }

  return msg;
}

export async function sendWeeklyReportToAll(
  db: D1Database,
  env: WahaEnv & { DB: D1Database },
  delayMs: number = 10000
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const users = await db.prepare(
    'SELECT id, username, phone FROM users WHERE phone IS NOT NULL AND phone != \'\''
  ).all<{ id: number; username: string; phone: string }>();

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < users.results.length; i++) {
    const u = users.results[i];
    const msg = await buildWeeklyReport(db, u.id, u.username);
    const result = await sendWhatsApp(env, u.phone, msg);
    if (result.ok) sent++;
    else {
      failed++;
      errors.push(`${u.username}: ${result.error || 'desconocido'}`);
    }
    if (i < users.results.length - 1 && delayMs > 0) {
      const jitter = delayMs * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, Math.round(jitter)));
    }
  }

  return { sent, failed, errors };
}
