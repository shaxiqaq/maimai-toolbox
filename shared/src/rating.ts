/** DX Rating rules. Achievements are percentages such as 100.5432. */

export type RankId =
  | "d" | "c" | "b" | "bb" | "bbb" | "a" | "aa" | "aaa"
  | "s" | "sp" | "ss" | "ssp" | "sss" | "sssp";

interface RankStep {
  /** Minimum achievement in units of 0.0001%. */
  min: number;
  rank: RankId;
  /** Rating factor ×10 (e.g. 224 = 22.4). */
  factor: number;
}

/** Highest first. Two exact values sit just below a rank boundary and carry a higher factor. */
const RANK_STEPS: RankStep[] = [
  { min: 1005000, rank: "sssp", factor: 224 },
  { min: 1004999, rank: "sss", factor: 222 },
  { min: 1000000, rank: "sss", factor: 216 },
  { min: 999999, rank: "ssp", factor: 214 },
  { min: 995000, rank: "ssp", factor: 211 },
  { min: 990000, rank: "ss", factor: 208 },
  { min: 980000, rank: "sp", factor: 203 },
  { min: 970000, rank: "s", factor: 200 },
  { min: 940000, rank: "aaa", factor: 168 },
  { min: 900000, rank: "aa", factor: 152 },
  { min: 800000, rank: "a", factor: 136 },
  { min: 750000, rank: "bbb", factor: 120 },
  { min: 700000, rank: "bb", factor: 112 },
  { min: 600000, rank: "b", factor: 96 },
  { min: 500000, rank: "c", factor: 80 },
  { min: 0, rank: "d", factor: 0 },
];

export const MAX_ACHIEVEMENT = 101;
const CAP = 1005000;

export const RANK_LABELS: Record<RankId, string> = {
  d: "D", c: "C", b: "B", bb: "BB", bbb: "BBB", a: "A", aa: "AA", aaa: "AAA",
  s: "S", sp: "S+", ss: "SS", ssp: "SS+", sss: "SSS", sssp: "SSS+",
};

/** Achievement as an integer number of 0.0001% units, immune to float noise like 100.49990000001. */
function toUnits(achievement: number): number {
  return Math.round(achievement * 10000);
}

function stepFor(units: number): RankStep {
  return RANK_STEPS.find((s) => units >= s.min) ?? RANK_STEPS[RANK_STEPS.length - 1]!;
}

export function rankOf(achievement: number): RankId {
  return stepFor(toUnits(achievement)).rank;
}

/** Single-chart rating: floor(ds × factor × min(achievement, 100.5) / 100), computed in integers. */
export function chartRating(ds: number, achievement: number): number {
  const units = toUnits(achievement);
  const ds10 = Math.round(ds * 10);
  const { factor } = stepFor(units);
  // ds10 × factor10 × units / (10 × 10 × 100 × 10000)
  return Math.floor((ds10 * factor * Math.min(units, CAP)) / 100_000_000);
}

/** Lowest achievement that reaches `rank` on a chart, or null for unknown ranks. */
export function minAchievementFor(rank: RankId): number {
  const step = [...RANK_STEPS].reverse().find((s) => s.rank === rank)!;
  return step.min / 10000;
}

/** DX score stars: 0–5 by dxScore / (3 × total notes). */
export function dxStars(dxScore: number, totalNotes: number): number {
  if (totalNotes <= 0) return 0;
  const ratio = dxScore / (3 * totalNotes);
  const thresholds = [0.97, 0.95, 0.93, 0.9, 0.85];
  const idx = thresholds.findIndex((t) => ratio >= t);
  return idx === -1 ? 0 : 5 - idx;
}

export type ComboFlag = "" | "fc" | "fcp" | "ap" | "app";
export type SyncFlag = "" | "sync" | "fs" | "fsp" | "fsd" | "fsdp";

export const COMBO_LABELS: Record<ComboFlag, string> = { "": "", fc: "FC", fcp: "FC+", ap: "AP", app: "AP+" };
export const SYNC_LABELS: Record<SyncFlag, string> = {
  "": "",
  sync: "SYNC",
  fs: "FS",
  fsp: "FS+",
  fsd: "FDX",
  fsdp: "FDX+",
};
