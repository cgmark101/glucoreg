import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database } from '@cloudflare/workers-types';
import auth from './routes/auth';
import readings from './routes/readings';
import metrics from './routes/metrics';
import bloodPressure from './routes/blood_pressure';
import admin from './routes/admin';
import profile from './routes/profile';
import { sendWhatsApp } from './lib/waha';

type Bindings = { DB: D1Database; JWT_SECRET?: string; WAHA_API_KEY: string; WAHA_BASE_URL?: string };

const app = new Hono<{ Bindings: Bindings }>();

app.use(cors());

app.route('/auth', auth);
app.route('/readings', readings);
app.route('/metrics', metrics);
app.route('/blood-pressure', bloodPressure);
app.route('/admin', admin);
app.route('/auth/profile', profile);

async function handleWeeklyReport(env: Bindings) {
  const db = env.DB;

  const users = await db.prepare(
    'SELECT id, username, phone FROM users WHERE phone IS NOT NULL AND phone != \'\''
  ).all<{ id: number; username: string; phone: string }>();

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  for (const user of users.results) {
    const [glucoseStats, bpStats] = await Promise.all([
      db.prepare(`
        SELECT COUNT(*) as total, AVG(value) as avg,
          SUM(CASE WHEN value >= 70 AND value <= 100 THEN 1 ELSE 0 END) as fasting_in_range
        FROM readings WHERE user_id = ? AND recorded_at >= ?
      `).bind(user.id, weekAgo).first<{ total: number; avg: number | null; fasting_in_range: number }>(),

      db.prepare(`
        SELECT COUNT(*) as total, AVG(systolic) as sys_avg, AVG(diastolic) as dia_avg
        FROM blood_pressure WHERE user_id = ? AND recorded_at >= ?
      `).bind(user.id, weekAgo).first<{ total: number; sys_avg: number | null; dia_avg: number | null }>(),
    ]);

    let msg = `📊 *Resumen Semanal — GlucoReg*\n`;
    msg += `Hola *${user.username}*, acá están tus métricas de la última semana:\n\n`;

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

    await sendWhatsApp(env, user.phone, msg);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(handleWeeklyReport(env));
  },
};
