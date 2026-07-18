CREATE TABLE IF NOT EXISTS blood_pressure (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  systolic INTEGER NOT NULL CHECK(systolic > 0 AND systolic < 300),
  diastolic INTEGER NOT NULL CHECK(diastolic > 0 AND diastolic < 200),
  heart_rate INTEGER CHECK(heart_rate IS NULL OR (heart_rate > 20 AND heart_rate < 300)),
  context TEXT NOT NULL DEFAULT 'other',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bp_user_id ON blood_pressure(user_id);
CREATE INDEX IF NOT EXISTS idx_bp_recorded_at ON blood_pressure(recorded_at);
CREATE INDEX IF NOT EXISTS idx_bp_user_recorded ON blood_pressure(user_id, recorded_at);
