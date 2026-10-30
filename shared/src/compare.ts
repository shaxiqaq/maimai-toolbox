/** Score snapshots shared between friends, and chart-by-chart comparison of two players. */
import type { Catalog, DifficultyIndex } from "./catalog";
import { buildB50, summarizeB50, withRating, type PlayRecord } from "./player";
import { COMBO_LABELS, SYNC_LABELS, type ComboFlag, type SyncFlag } from "./rating";
import { recordKey } from "./scores";

/** One chart in a snapshot: [songId, difficulty, achievement, dxScore, combo, sync]. Titles and constants come from the catalog. */
export type SnapshotRecord = [number, number, number, number, ComboFlag, SyncFlag];

export interface ScoreSnapshot {
  source: "diving-fish" | "lxns";
  nickname: string;
  /** True for a full best-score list (LXNS), false when only the B50 was available (Diving-Fish). */
  full: boolean;
  /** B50 total when the snapshot was taken, for list display. */
  rating: number;
  records: SnapshotRecord[];
  fetchedAt: string;
}

/** Enough for every chart in the game several times over. */
export const MAX_SNAPSHOT_RECORDS = 10_000;

export function toSnapshot(
  records: PlayRecord[],
  meta: Omit<ScoreSnapshot, "records">,
): ScoreSnapshot {
  return {
    ...meta,
    records: [...indexBest(records).values()].map((r) => [r.songId, r.difficulty, r.achievement, r.dxScore, r.combo, r.sync]),
  };
}

const COMBOS = new Set(Object.keys(COMBO_LABELS));
const SYNCS = new Set(Object.keys(SYNC_LABELS));
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Validate an uploaded snapshot, keeping only known fields; null when it is malformed. */
export function sanitizeSnapshot(input: unknown): ScoreSnapshot | null {
  const s = input as Record<string, unknown> | null;
  if (!s || !Array.isArray(s.records) || s.records.length > MAX_SNAPSHOT_RECORDS) return null;
  const records: SnapshotRecord[] = [];
  for (const r of s.records as unknown[]) {
    if (!Array.isArray(r) || r.length !== 6) return null;
    const [songId, difficulty, achievement, dxScore, combo, sync] = r as unknown[];
    if (!isInt(songId, 1, 999_999) || !isInt(difficulty, 0, 4) || !isInt(dxScore, 0, 99_999)) return null;
    if (typeof achievement !== "number" || !(achievement >= 0 && achievement <= 101)) return null;
    if (!COMBOS.has(combo as string) || !SYNCS.has(sync as string)) return null;
    records.push([songId as number, difficulty as number, achievement, dxScore as number, combo as ComboFlag, sync as SyncFlag]);
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    source: s.source === "lxns" ? "lxns" : "diving-fish",
    nickname: str(s.nickname, 64),
    full: s.full === true,
    rating: isInt(s.rating, 0, 99_999) ? (s.rating as number) : 0,
    records,
    fetchedAt: str(s.fetchedAt, 40),
  };
}

/** Turn snapshot rows back into full records using the catalog; charts it no longer has are dropped. */
export function snapshotRecords(snapshot: Pick<ScoreSnapshot, "records">, catalog: Catalog): PlayRecord[] {
  const songs = new Map(catalog.songs.map((s) => [s.id, s]));
  return snapshot.records.flatMap(([songId, difficulty, achievement, dxScore, combo, sync]) => {
    const song = songs.get(songId);
    const chart = song?.charts.find((c) => c.difficulty === difficulty);
    if (!song || !chart) return [];
    return [
      withRating({
        songId,
        title: song.title,
        type: song.type,
        difficulty: difficulty as DifficultyIndex,
        level: chart.level,
        ds: chart.ds,
        achievement,
        dxScore,
        combo,
        sync,
      }),
    ];
  });
}

function indexBest(records: PlayRecord[]): Map<string, PlayRecord> {
  const map = new Map<string, PlayRecord>();
  for (const r of records) {
    const key = recordKey(r.songId, r.difficulty);
    const prev = map.get(key);
    if (!prev || r.achievement > prev.achievement) map.set(key, r);
  }
  return map;
}

/** B50 total from a record list, with `isNew` deciding which songs go to B15. */
export function b50Total(records: PlayRecord[], isNew: (songId: number) => boolean): number {
  const { b35, b15 } = buildB50(records, isNew);
  return summarizeB50(b35, b15).total;
}

export interface ComparedChart {
  key: string;
  songId: number;
  difficulty: number;
  mine: PlayRecord | null;
  theirs: PlayRecord | null;
  /** Achievement difference (mine − theirs) when both played; null otherwise. */
  diff: number | null;
}

export interface Comparison {
  charts: ComparedChart[];
  wins: number;
  losses: number;
  ties: number;
  onlyMine: number;
  onlyTheirs: number;
}

/** Line up two players' best scores chart by chart. Utage charts are left out. */
export function compareScores(mine: PlayRecord[], theirs: PlayRecord[]): Comparison {
  const a = indexBest(mine.filter((r) => r.type !== "UTAGE"));
  const b = indexBest(theirs.filter((r) => r.type !== "UTAGE"));
  const out: Comparison = { charts: [], wins: 0, losses: 0, ties: 0, onlyMine: 0, onlyTheirs: 0 };
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const m = a.get(key) ?? null;
    const t = b.get(key) ?? null;
    const ref = (m ?? t)!;
    // Achievements have four decimals; round so float noise never turns a tie into a win.
    const diff = m && t ? Math.round((m.achievement - t.achievement) * 10_000) / 10_000 : null;
    if (diff === null) {
      if (m) out.onlyMine++;
      else out.onlyTheirs++;
    } else if (diff > 0) out.wins++;
    else if (diff < 0) out.losses++;
    else out.ties++;
    out.charts.push({ key, songId: ref.songId, difficulty: ref.difficulty, mine: m, theirs: t, diff });
  }
  return out;
}
