import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(join(config.dataDir, "toolbox.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sources (
    name       TEXT PRIMARY KEY,
    etag       TEXT,
    fetched_at INTEGER NOT NULL,
    body       TEXT NOT NULL
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
