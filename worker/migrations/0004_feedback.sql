-- Site announcements (written by admins) and user feedback with admin replies.

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- user_id is null for feedback sent without signing in.
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  contact    TEXT NOT NULL,
  body       TEXT NOT NULL,
  page       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',
  reply      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_user ON feedback (user_id);
CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status, created_at);
