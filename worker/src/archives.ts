/** Saved B50 snapshots per user, optionally shared through an unguessable, revocable link id. */
import { B15_SIZE, B35_SIZE, summarizeB50, type PlayerB50, type PlayRecord } from "@mt/shared";
import { toBase64Url } from "./auth";
import type { Db } from "./db";

export const MAX_ARCHIVES = 100;

export interface ArchiveSummary {
  id: string;
  title: string;
  rating: number;
  source: PlayerB50["source"];
  shareId: string | null;
  createdAt: number;
}

export interface Archive extends ArchiveSummary {
  b50: PlayerB50;
}

export class ArchiveError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function isRecord(r: unknown): r is PlayRecord {
  const x = r as Record<string, unknown>;
  return !!x && isNum(x.songId) && isNum(x.ds) && isNum(x.achievement) && isNum(x.rating) && typeof x.title === "string";
}

/** Accept only the fields we render, so stored snapshots cannot carry arbitrary payloads. */
function sanitizeB50(input: unknown): PlayerB50 {
  const b = input as Record<string, unknown>;
  const lists = [b?.b35, b?.b15];
  if (!Array.isArray(lists[0]) || !Array.isArray(lists[1]) || !lists.every((l) => (l as unknown[]).every(isRecord))) {
    throw new ArchiveError(400, "B50 数据格式不正确");
  }
  const pick = (r: PlayRecord): PlayRecord => ({
    songId: r.songId,
    title: String(r.title).slice(0, 200),
    type: r.type,
    difficulty: r.difficulty,
    level: String(r.level).slice(0, 8),
    ds: r.ds,
    achievement: r.achievement,
    dxScore: Number(r.dxScore) || 0,
    combo: r.combo,
    sync: r.sync,
    rank: r.rank,
    rating: r.rating,
  });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    source: b.source === "lxns" ? "lxns" : "diving-fish",
    username: str(b.username, 64),
    nickname: str(b.nickname, 64),
    plate: str(b.plate, 64),
    reportedRating: Number(b.reportedRating) || 0,
    b35: (b.b35 as PlayRecord[]).slice(0, B35_SIZE).map(pick),
    b15: (b.b15 as PlayRecord[]).slice(0, B15_SIZE).map(pick),
    fetchedAt: str(b.fetchedAt, 40) || new Date().toISOString(),
  };
}

interface Row {
  id: string;
  title: string;
  rating: number;
  source: PlayerB50["source"];
  share_id: string | null;
  created_at: number;
  data?: string;
}

const summary = (r: Row): ArchiveSummary => ({
  id: r.id,
  title: r.title,
  rating: r.rating,
  source: r.source,
  shareId: r.share_id,
  createdAt: r.created_at,
});

function validTitle(title: unknown, fallback: string): string {
  const t = typeof title === "string" ? title.trim() : "";
  if (t.length > 40) throw new ArchiveError(400, "标题最多 40 个字符");
  return t || fallback;
}

export async function listArchives(db: Db, userId: number): Promise<ArchiveSummary[]> {
  const rows = await db.all<Row>(
    "SELECT id, title, rating, source, share_id, created_at FROM b50_archives WHERE user_id = ? ORDER BY created_at DESC",
    userId,
  );
  return rows.map(summary);
}

export async function saveArchive(db: Db, userId: number, title: unknown, b50Input: unknown): Promise<ArchiveSummary> {
  const count = (await db.first<{ c: number }>("SELECT COUNT(*) AS c FROM b50_archives WHERE user_id = ?", userId))?.c ?? 0;
  if (count >= MAX_ARCHIVES) throw new ArchiveError(400, `最多保存 ${MAX_ARCHIVES} 份存档，请先删除一些`);
  const b50 = sanitizeB50(b50Input);
  const rating = summarizeB50(b50.b35, b50.b15).total;
  const row: Row = {
    id: crypto.randomUUID(),
    title: validTitle(title, `${b50.nickname || b50.username} · ${rating}`),
    rating,
    source: b50.source,
    share_id: null,
    created_at: Date.now(),
  };
  await db.run(
    "INSERT INTO b50_archives (id, user_id, title, rating, source, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    row.id,
    userId,
    row.title,
    row.rating,
    row.source,
    JSON.stringify(b50),
    row.created_at,
  );
  return summary(row);
}

async function ownRow(db: Db, userId: number, id: string): Promise<Row> {
  const row = await db.first<Row>(
    "SELECT id, title, rating, source, share_id, created_at, data FROM b50_archives WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!row) throw new ArchiveError(404, "存档不存在");
  return row;
}

export async function getArchive(db: Db, userId: number, id: string): Promise<Archive> {
  const row = await ownRow(db, userId, id);
  return { ...summary(row), b50: JSON.parse(row.data!) as PlayerB50 };
}

export async function renameArchive(db: Db, userId: number, id: string, title: unknown): Promise<void> {
  const row = await ownRow(db, userId, id);
  await db.run("UPDATE b50_archives SET title = ? WHERE id = ?", validTitle(title, row.title), id);
}

export async function deleteArchive(db: Db, userId: number, id: string): Promise<void> {
  await ownRow(db, userId, id);
  await db.run("DELETE FROM b50_archives WHERE id = ?", id);
}

/** Create (or return the existing) public share id. */
export async function shareArchive(db: Db, userId: number, id: string): Promise<string> {
  const row = await ownRow(db, userId, id);
  if (row.share_id) return row.share_id;
  const shareId = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  await db.run("UPDATE b50_archives SET share_id = ? WHERE id = ?", shareId, id);
  return shareId;
}

export async function unshareArchive(db: Db, userId: number, id: string): Promise<void> {
  await ownRow(db, userId, id);
  await db.run("UPDATE b50_archives SET share_id = NULL WHERE id = ?", id);
}

/** Public read of a shared archive. Returns null for unknown or revoked links. */
export async function getShared(db: Db, shareId: string): Promise<Pick<Archive, "title" | "rating" | "createdAt" | "b50"> | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(shareId)) return null;
  const row = await db.first<{ title: string; rating: number; created_at: number; data: string }>(
    "SELECT title, rating, created_at, data FROM b50_archives WHERE share_id = ?",
    shareId,
  );
  return row ? { title: row.title, rating: row.rating, createdAt: row.created_at, b50: JSON.parse(row.data) } : null;
}
