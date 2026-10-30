import { B15_SIZE, B35_SIZE, type PlayRecord } from "./player";
import { chartRating, minAchievementFor, type RankId } from "./rating";
import { recordKey, type ChartRef } from "./scores";

/** Rank steps a suggestion can target, lowest first. */
export const TARGET_RANKS: RankId[] = ["s", "sp", "ss", "ssp", "sss", "sssp"];

export interface Suggestion extends ChartRef {
  list: "b35" | "b15";
  current: PlayRecord | null;
  targetRank: RankId;
  targetAchievement: number;
  newRating: number;
  /** Total rating increase if the target is reached. */
  gain: number;
  /** Constant minus community-fitted constant; positive means the chart plays easier than its constant. */
  easiness: number | null;
}

export interface RecommendInput {
  charts: ChartRef[];
  records: Map<string, PlayRecord>;
  b35: PlayRecord[];
  b15: PlayRecord[];
  /** Only consider charts whose constant lies in this inclusive range. */
  dsMin: number;
  dsMax: number;
}

/** Lowest constant whose SSS+ still beats the list floor; a sensible default lower bound for suggestions. */
export function suggestedDsFloor(listFloor: number): number {
  return Math.ceil((listFloor / 22.512) * 10) / 10;
}

/**
 * For every chart in range, find the lowest rank step above the current score that raises total rating,
 * and how much it raises it. A chart already in a best list only gains its own improvement; a chart outside
 * replaces the list's lowest entry (or fills an empty slot).
 */
export function recommend(input: RecommendInput): Suggestion[] {
  const inB50 = new Map<string, PlayRecord>();
  for (const r of [...input.b35, ...input.b15]) inB50.set(recordKey(r.songId, r.difficulty), r);
  const floorOf = (list: PlayRecord[], size: number) => (list.length >= size ? Math.min(...list.map((r) => r.rating)) : 0);
  const floors = { b35: floorOf(input.b35, B35_SIZE), b15: floorOf(input.b15, B15_SIZE) };

  const out: Suggestion[] = [];
  for (const ref of input.charts) {
    const { song, chart } = ref;
    if (chart.ds < input.dsMin || chart.ds > input.dsMax) continue;
    const key = recordKey(song.id, chart.difficulty);
    const current = input.records.get(key) ?? null;
    const list = song.isNew ? "b15" : "b35";
    const listed = inB50.get(key);
    const baseline = listed ? listed.rating : floors[list];

    for (const rank of TARGET_RANKS) {
      const targetAchievement = minAchievementFor(rank);
      if (current && current.achievement >= targetAchievement) continue;
      const newRating = chartRating(chart.ds, targetAchievement);
      const gain = newRating - baseline;
      if (gain <= 0) continue;
      out.push({
        ...ref,
        list,
        current,
        targetRank: rank,
        targetAchievement,
        newRating,
        gain,
        easiness: chart.stats ? chart.ds - chart.stats.fitDiff : null,
      });
      break;
    }
  }
  return out;
}

export type SuggestionSort = "easiest" | "gain";

/** "easiest": lowest target step first, then charts that play easier than their constant. */
export function sortSuggestions(list: Suggestion[], by: SuggestionSort): Suggestion[] {
  const rankIdx = (s: Suggestion) => TARGET_RANKS.indexOf(s.targetRank);
  return [...list].sort((a, b) =>
    by === "gain"
      ? b.gain - a.gain || (b.easiness ?? 0) - (a.easiness ?? 0)
      : rankIdx(a) - rankIdx(b) || (b.easiness ?? 0) - (a.easiness ?? 0) || b.gain - a.gain,
  );
}
