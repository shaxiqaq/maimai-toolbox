/** Minimal async database interface so the same queries run on D1 in production and on node:sqlite in tests. */
export interface Db {
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
}

export function d1(db: D1Database): Db {
  return {
    first: (sql, ...params) => db.prepare(sql).bind(...params).first(),
    all: async <T>(sql: string, ...params: unknown[]) => (await db.prepare(sql).bind(...params).all<T>()).results,
    run: async (sql, ...params) => ({ changes: (await db.prepare(sql).bind(...params).run()).meta.changes }),
  };
}
