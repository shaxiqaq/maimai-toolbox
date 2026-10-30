import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(join(config.dataDir, "toolbox.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sources (
    name       TEXT PRIMARY KEY,
    etag       TEXT,
    fetched_at INTEGER NOT NULL,
    body       TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS fav_folders (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

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
`);

export interface SourceRow {
  name: string;
  etag: string | null;
  fetched_at: number;
  body: string;
}

export function getSource(name: string): SourceRow | undefined {
  return db.prepare("SELECT * FROM sources WHERE name = ?").get(name) as SourceRow | undefined;
}

export function putSource(name: string, body: string, etag: string | null): void {
  db.prepare(
    `INSERT INTO sources (name, etag, fetched_at, body) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET etag = excluded.etag, fetched_at = excluded.fetched_at, body = excluded.body`,
  ).run(name, etag, Date.now(), body);
}

export function touchSource(name: string): void {
  db.prepare("UPDATE sources SET fetched_at = ? WHERE name = ?").run(Date.now(), name);
}
