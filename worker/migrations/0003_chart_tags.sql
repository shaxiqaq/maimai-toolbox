-- Community chart tags: one row per user, chart and tag. Counts are aggregated on read.

CREATE TABLE IF NOT EXISTS chart_tag_votes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id    INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  tag        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, song_id, difficulty, tag)
);
CREATE INDEX IF NOT EXISTS chart_tag_votes_chart ON chart_tag_votes (song_id, difficulty);
