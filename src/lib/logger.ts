import type { D1Database } from '@cloudflare/workers-types';

const MAX_LOG_AGE_DAYS = 90;
const MAX_LOG_ROWS = 2000;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

let tableReady = false;

export async function ensureLogTable(db: D1Database): Promise<void> {
  if (tableReady) return;
  await db.prepare(CREATE_TABLE_SQL).run();
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)'
  ).run();
  tableReady = true;
}

export async function auditLog(
  db: D1Database,
  userId: number,
  username: string,
  action: string,
  detail?: string
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, ?, ?)'
    ).bind(userId, username, action, detail || null).run();
    tableReady = true;
  } catch {
    await ensureLogTable(db);
    try {
      await db.prepare(
        'INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, ?, ?)'
      ).bind(userId, username, action, detail || null).run();
    } catch {}
  }

  try { await pruneLogs(db); } catch {}
}

async function pruneLogs(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_LOG_AGE_DAYS * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  await db.prepare('DELETE FROM audit_logs WHERE created_at < ?').bind(cutoff).run();

  const count = await db.prepare('SELECT COUNT(*) as c FROM audit_logs').first<{ c: number }>();
  if (count && count.c > MAX_LOG_ROWS) {
    const excess = count.c - MAX_LOG_ROWS;
    await db.prepare(
      `DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs ORDER BY id LIMIT ?)`
    ).bind(excess).run();
  }
}
