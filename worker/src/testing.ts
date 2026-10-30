/** Test-only: the app's Db interface backed by node:sqlite with the real migrations applied. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db } from "./db";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

export function memoryDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const file of readdirSync(MIGRATIONS).sort()) sqlite.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  // D1 returns null for missing rows and rejects undefined bindings; mirror that here.
  const bind = (params: unknown[]) => params.map((p) => (p === undefined ? null : p)) as never[];
  return {
    first: async (sql, ...params) => (sqlite.prepare(sql).get(...bind(params)) as never) ?? null,
    all: async (sql, ...params) => sqlite.prepare(sql).all(...bind(params)) as never[],
    run: async (sql, ...params) => ({ changes: Number(sqlite.prepare(sql).run(...bind(params)).changes) }),
  };
}
