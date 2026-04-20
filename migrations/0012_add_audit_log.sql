CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  user_id TEXT,
  auth_method TEXT NOT NULL,
  api_key_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  route TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_created_at ON audit_log(user_id, created_at DESC);
