import type { DifficultyIndex, SongType } from "./catalog";
import { chartRating, rankOf, type ComboFlag, type RankId, type SyncFlag } from "./rating";

/** One played chart, normalized from whichever prober it came from. */
export interface PlayRecord {
  songId: number;
  title: string;
  type: SongType;
  difficulty: DifficultyIndex;
  level: string;
  ds: number;
  achievement: number;
  dxScore: number;
  combo: ComboFlag;
  sync: SyncFlag;
  rank: RankId;
  rating: number;
}

export interface PlayerB50 {
  source: "diving-fish" | "lxns";
  username: string;
  nickname: string;
  plate: string;
  /** Rating reported by the prober; compare with `computed.total` to spot stale data. */
  reportedRating: number;
  /** Old-version best 35. */
  b35: PlayRecord[];
  /** Current-version best 15. */
  b15: PlayRecord[];
  /** Scores that could not be placed because the chart is missing from our catalog. */
  unmatched?: number;
  fetchedAt: string;
}

export interface B50Summary {
  total: number;
  b35: number;
  b15: number;
  /** Lowest rating that still makes each list, 0 when the list is not full. */
  b35Floor: number;
  b15Floor: number;
}

export function withRating<T extends Pick<PlayRecord, "ds" | "achievement">>(r: T): T & Pick<PlayRecord, "rank" | "rating"> {
  return { ...r, rank: rankOf(r.achievement), rating: chartRating(r.ds, r.achievement) };
}

/** Sort for best lists: rating, then constant, then achievement, all descending. */
export function compareRecords(a: PlayRecord, b: PlayRecord): number {
  return b.rating - a.rating || b.ds - a.ds || b.achievement - a.achievement;
}

export const B35_SIZE = 35;
export const B15_SIZE = 15;

/**
 * Pick B35/B15 from a full list of best scores. Utage charts never count; `isNew` decides the
 * current-version list. Duplicate charts keep the higher-rated entry.
 */
export function buildB50(records: PlayRecord[], isNew: (songId: number) => boolean): { b35: PlayRecord[]; b15: PlayRecord[] } {
  const best = new Map<string, PlayRecord>();
  for (const r of records) {
    if (r.type === "UTAGE") continue;
    const key = `${r.songId}:${r.difficulty}`;
    const prev = best.get(key);
    if (!prev || compareRecords(r, prev) < 0) best.set(key, r);
  }
  const sorted = [...best.values()].sort(compareRecords);
  return {
    b35: sorted.filter((r) => !isNew(r.songId)).slice(0, B35_SIZE),
    b15: sorted.filter((r) => isNew(r.songId)).slice(0, B15_SIZE),
  };
}

export function summarizeB50(b35: PlayRecord[], b15: PlayRecord[]): B50Summary {
  const sum = (list: PlayRecord[]) => list.reduce((acc, r) => acc + r.rating, 0);
  const floor = (list: PlayRecord[], size: number) => (list.length >= size ? Math.min(...list.map((r) => r.rating)) : 0);
  const s35 = sum(b35);
  const s15 = sum(b15);
  return { total: s35 + s15, b35: s35, b15: s15, b35Floor: floor(b35, B35_SIZE), b15Floor: floor(b15, B15_SIZE) };
}
