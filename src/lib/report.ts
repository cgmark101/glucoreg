import type { D1Database } from '@cloudflare/workers-types';
import { sendWhatsApp, type WahaEnv } from './waha';

export async function buildWeeklyReport(
  db: D1Database,
  userId: number,
  username: string
): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [glucoseStats, bpStats] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) as total, AVG(value) as avg,
        SUM(CASE WHEN value >= 70 AND value <= 100 THEN 1 ELSE 0 END) as fasting_in_range
      FROM readings WHERE user_id = ? AND recorded_at >= ?
    `).bind(userId, weekAgo).first<{ total: number; avg: number | null; fasting_in_range: number }>(),

    db.prepare(`
      SELECT COUNT(*) as total, AVG(systolic) as sys_avg, AVG(diastolic) as dia_avg
      FROM blood_pressure WHERE user_id = ? AND recorded_at >= ?
    `).bind(userId, weekAgo).first<{ total: number; sys_avg: number | null; dia_avg: number | null }>(),
  ]);

  let msg = `📊 *Resumen Semanal — GlucoReg*\n`;
  msg += `Hola *${username}*, acá están tus métricas de la última semana:\n\n`;

  if (glucoseStats && glucoseStats.total > 0) {
    const avg = Math.round(glucoseStats.avg ?? 0);
    msg += `🍬 *Glucosa:*\n`;
    msg += `📈 ${glucoseStats.total} lecturas · Promedio ${avg} mg/dL\n`;
    msg += glucoseStats.fasting_in_range > 0
      ? `🌅 Ayunas en rango: ${glucoseStats.fasting_in_range} vez/ces\n`
      : '';
  }

  if (bpStats && bpStats.total > 0) {
    const sys = Math.round(bpStats.sys_avg ?? 0);
    const dia = Math.round(bpStats.dia_avg ?? 0);
    msg += `💓 *Presión Arterial:*\n`;
    msg += `📈 ${bpStats.total} lecturas · ${sys}/${dia} mmHg\n`;
  }

  if (!glucoseStats?.total && !bpStats?.total) {
    msg += `📭 No registraste lecturas esta semana.\n`;
    msg += `¡Animate a registrar para ver tu evolución!\n`;
  } else {
    msg += `\n¡Seguí así! 💪 Cuidar tu salud es el mejor hábito.`;
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
