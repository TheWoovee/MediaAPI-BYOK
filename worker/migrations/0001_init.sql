CREATE TABLE users (
  email TEXT PRIMARY KEY,
  wrapped_dek BLOB NOT NULL,
  dek_iv BLOB NOT NULL,
  kek_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  reveal_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  last4 TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX credentials_by_user ON credentials(email, provider_id);

CREATE TABLE local_servers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  mode TEXT NOT NULL,
  auth_ciphertext BLOB,
  auth_iv BLOB,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_settings (
  email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  request_json TEXT NOT NULL,
  provider_ref_json TEXT,
  status TEXT NOT NULL,
  outputs_json TEXT,
  error TEXT,
  cost_hint TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX jobs_by_user_time ON jobs(email, created_at DESC);

CREATE TABLE temp_uploads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
