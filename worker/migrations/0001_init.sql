-- Accounts, favorites and saved B50 snapshots. Everything else the site shows comes straight from
-- public sources in the browser.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at    INTEGER
);

-- token_hash is sha256(session token); the raw token only ever lives in the user's cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Failed login/register attempts, for rate limiting across Worker instances.
CREATE TABLE IF NOT EXISTS attempts (
  key TEXT NOT NULL,
  at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_key_at ON attempts (key, at);

CREATE TABLE IF NOT EXISTS fav_folders (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fav_folders_user ON fav_folders (user_id);

CREATE TABLE IF NOT EXISTS fav_songs (
  folder_id TEXT NOT NULL REFERENCES fav_folders(id) ON DELETE CASCADE,
  song_id   INTEGER NOT NULL,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (folder_id, song_id)
);

CREATE TABLE IF NOT EXISTS b50_archives (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  rating     INTEGER NOT NULL,
  source     TEXT NOT NULL,
  data       TEXT NOT NULL,
  share_id   TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS b50_archives_user ON b50_archives (user_id);
