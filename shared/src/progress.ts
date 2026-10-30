import type { PlayRecord } from "./player";
import { minAchievementFor, type ComboFlag, type RankId, type SyncFlag } from "./rating";
import { recordKey, type ChartRef } from "./scores";

/** A completion target for a set of charts. */
export type Goal =
  | { kind: "clear" }
  | { kind: "rank"; rank: RankId }
  | { kind: "combo"; combo: Exclude<ComboFlag, ""> }
  | { kind: "sync"; sync: Exclude<SyncFlag, "" | "sync"> };

export const CLEAR_ACHIEVEMENT = 80;

const COMBO_ORDER: ComboFlag[] = ["", "fc", "fcp", "ap", "app"];
// SYNC PLAY is not a full sync, so it ranks with "none".
const SYNC_ORDER: SyncFlag[] = ["", "fs", "fsp", "fsd", "fsdp"];

export function meetsGoal(record: PlayRecord | undefined, goal: Goal): boolean {
  if (!record) return false;
  switch (goal.kind) {
    case "clear":
      return record.achievement >= CLEAR_ACHIEVEMENT;
    case "rank":
      return record.achievement >= minAchievementFor(goal.rank);
    case "combo":
      return COMBO_ORDER.indexOf(record.combo) >= COMBO_ORDER.indexOf(goal.combo);
    case "sync":
      return Math.max(0, SYNC_ORDER.indexOf(record.sync)) >= SYNC_ORDER.indexOf(goal.sync);
  }
}

export interface Progress {
  total: number;
  done: number;
  /** Charts not yet meeting the goal, hardest (highest constant) first. */
  remaining: ChartRef[];
}

export function progressFor(charts: ChartRef[], records: Map<string, PlayRecord>, goal: Goal): Progress {
  const remaining = charts.filter(({ song, chart }) => !meetsGoal(records.get(recordKey(song.id, chart.difficulty)), goal));
  remaining.sort((a, b) => b.chart.ds - a.chart.ds);
  return { total: charts.length, done: charts.length - remaining.length, remaining };
}

/** Rank buckets shown for a level, best first. "below" is played but under S; "none" is unplayed. */
export const DISTRIBUTION_BUCKETS = ["sssp", "sss", "ssp", "ss", "sp", "s", "below", "none"] as const;
export type DistributionBucket = (typeof DISTRIBUTION_BUCKETS)[number];

export interface LevelDistribution {
  total: number;
  ranks: Record<DistributionBucket, number>;
  fc: number;
  ap: number;
}

export function levelDistribution(charts: ChartRef[], records: Map<string, PlayRecord>): LevelDistribution {
  const ranks = Object.fromEntries(DISTRIBUTION_BUCKETS.map((b) => [b, 0])) as Record<DistributionBucket, number>;
  let fc = 0;
  let ap = 0;
  for (const { song, chart } of charts) {
    const r = records.get(recordKey(song.id, chart.difficulty));
    if (!r) {
      ranks.none++;
      continue;
    }
    const bucket = (DISTRIBUTION_BUCKETS as readonly string[]).includes(r.rank) ? (r.rank as DistributionBucket) : "below";
    ranks[bucket]++;
    if (meetsGoal(r, { kind: "combo", combo: "fc" })) fc++;
    if (meetsGoal(r, { kind: "combo", combo: "ap" })) ap++;
  }
  return { total: charts.length, ranks, fc, ap };
}
