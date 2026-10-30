-- Friends and the score snapshots they can see. A friendship is stored in both directions so each
-- side can list and remove it with a simple lookup.

CREATE TABLE IF NOT EXISTS friend_requests (
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id);

CREATE TABLE IF NOT EXISTS friendships (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

-- One snapshot per user, uploaded from the browser; only the owner and their friends can read it.
CREATE TABLE IF NOT EXISTS score_snapshots (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,
  nickname     TEXT NOT NULL,
  full         INTEGER NOT NULL,
  rating       INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  data         TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);
