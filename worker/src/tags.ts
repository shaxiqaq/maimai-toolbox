/** Chart tag votes. Anyone can read the totals; signed-in users add or remove their own votes. */
import { isTagId, type TagCounts, type TagId } from "@mt/shared";
import type { Db } from "./db";

export const MAX_VOTES_PER_USER = 5000;

export class TagError extends Error {
  constructor(
    readonly status: 400,
    message: string,
  ) {
    super(message);
  }
}

export interface ChartRef {
  songId: number;
  difficulty: number;
}

/** Validate route parameters; song ids are not checked against the catalog, which only the browser has. */
export function parseChart(songIdRaw: string, difficultyRaw: string): ChartRef {
  const songId = Number(songIdRaw);
  const difficulty = Number(difficultyRaw);
  if (!Number.isInteger(songId) || songId <= 0 || songId > 999_999) throw new TagError(400, "曲目 ID 无效");
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 4) throw new TagError(400, "难度无效");
  return { songId, difficulty };
}

export function parseTag(raw: string): TagId {
  if (!isTagId(raw)) throw new TagError(400, "未知的标签");
  return raw;
}

export async function tagCounts(db: Db): Promise<TagCounts> {
  const rows = await db.all<{ song_id: number; difficulty: number; tag: TagId; n: number }>(
    "SELECT song_id, difficulty, tag, COUNT(*) AS n FROM chart_tag_votes GROUP BY song_id, difficulty, tag",
  );
  const out: TagCounts = {};
  for (const r of rows) (out[`${r.song_id}:${r.difficulty}`] ??= {})[r.tag] = r.n;
  return out;
}

/** The caller's own votes on one song, as { difficulty: tags[] }. */
export async function myVotes(db: Db, userId: number, songId: number): Promise<Record<number, TagId[]>> {
  const rows = await db.all<{ difficulty: number; tag: TagId }>(
    "SELECT difficulty, tag FROM chart_tag_votes WHERE user_id = ? AND song_id = ? ORDER BY created_at",
    userId,
    songId,
  );
  const out: Record<number, TagId[]> = {};
  for (const r of rows) (out[r.difficulty] ??= []).push(r.tag);
  return out;
}

export async function addVote(db: Db, userId: number, chart: ChartRef, tag: TagId): Promise<void> {
  const n = (await db.first<{ c: number }>("SELECT COUNT(*) AS c FROM chart_tag_votes WHERE user_id = ?", userId))?.c ?? 0;
  if (n >= MAX_VOTES_PER_USER) throw new TagError(400, `每个账号最多打 ${MAX_VOTES_PER_USER} 个标签`);
  await db.run(
    "INSERT OR IGNORE INTO chart_tag_votes (user_id, song_id, difficulty, tag, created_at) VALUES (?, ?, ?, ?, ?)",
    userId,
    chart.songId,
    chart.difficulty,
    tag,
    Date.now(),
  );
}

export async function removeVote(db: Db, userId: number, chart: ChartRef, tag: TagId): Promise<void> {
  await db.run(
    "DELETE FROM chart_tag_votes WHERE user_id = ? AND song_id = ? AND difficulty = ? AND tag = ?",
    userId,
    chart.songId,
    chart.difficulty,
    tag,
  );
}
