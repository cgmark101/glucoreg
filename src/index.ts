import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database } from '@cloudflare/workers-types';
import auth from './routes/auth';
import readings from './routes/readings';
import metrics from './routes/metrics';
import bloodPressure from './routes/blood_pressure';
import admin from './routes/admin';
import profile from './routes/profile';
import { sendWeeklyReportToAll } from './lib/report';

type Bindings = { DB: D1Database; JWT_SECRET?: string; WAHA_API_KEY: string; WAHA_BASE_URL?: string };

const app = new Hono<{ Bindings: Bindings }>();

app.use(cors());

app.route('/auth', auth);
app.route('/readings', readings);
app.route('/metrics', metrics);
app.route('/blood-pressure', bloodPressure);
app.route('/admin', admin);
app.route('/auth/profile', profile);

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(sendWeeklyReportToAll(env.DB, env, 10000));
  },
};
