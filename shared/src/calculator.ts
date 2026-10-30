/**
 * Achievement math. Every chart is worth 100% base (weighted by note type) plus a 1% BREAK bonus
 * shared evenly across its BREAK notes. Each non-perfect judgement removes a fixed slice of that.
 */
import type { NoteCounts } from "./catalog";
import { chartRating, MAX_ACHIEVEMENT, rankOf, type RankId } from "./rating";

export type NoteKind = "tap" | "hold" | "slide" | "touch" | "break";
export const NOTE_KINDS: NoteKind[] = ["tap", "hold", "slide", "touch", "break"];
export const NOTE_WEIGHT: Record<NoteKind, number> = { tap: 1, hold: 2, slide: 3, touch: 1, break: 5 };

/** Non-perfect judgements for TAP/HOLD/SLIDE/TOUCH. */
export type NormalJudge = "great" | "good" | "miss";
/** BREAK judgements below CRITICAL PERFECT, best to worst. */
export type BreakJudge = "perfectHigh" | "perfectLow" | "greatHigh" | "greatMid" | "greatLow" | "good" | "miss";

export const NORMAL_JUDGES: NormalJudge[] = ["great", "good", "miss"];
export const BREAK_JUDGES: BreakJudge[] = ["perfectHigh", "perfectLow", "greatHigh", "greatMid", "greatLow", "good", "miss"];

/** Fraction of a note's base value lost. */
const NORMAL_BASE_LOSS: Record<NormalJudge, number> = { great: 0.2, good: 0.5, miss: 1 };
const BREAK_BASE_LOSS: Record<BreakJudge, number> = {
  perfectHigh: 0,
  perfectLow: 0,
  greatHigh: 0.2,
  greatMid: 0.4,
  greatLow: 0.5,
  good: 0.6,
  miss: 1,
};
/** Fraction of one BREAK's share of the 1% bonus lost. */
const BREAK_BONUS_LOSS: Record<BreakJudge, number> = {
  perfectHigh: 0.25,
  perfectLow: 0.5,
  greatHigh: 0.6,
  greatMid: 0.6,
  greatLow: 0.6,
  good: 0.7,
  miss: 1,
};

export interface Judgements {
  tap: Partial<Record<NormalJudge, number>>;
  hold: Partial<Record<NormalJudge, number>>;
  slide: Partial<Record<NormalJudge, number>>;
  touch: Partial<Record<NormalJudge, number>>;
  break: Partial<Record<BreakJudge, number>>;
}

export const EMPTY_JUDGEMENTS: Judgements = { tap: {}, hold: {}, slide: {}, touch: {}, break: {} };

function totalWeight(notes: NoteCounts): number {
  return NOTE_KINDS.reduce((sum, k) => sum + NOTE_WEIGHT[k] * notes[k], 0);
}

/** Best achievable score: 101% when the chart has BREAK notes, otherwise 100%. */
export function maxAchievement(notes: NoteCounts): number {
  return notes.break > 0 ? MAX_ACHIEVEMENT : 100;
}

/** Achievement lost (in percentage points) by one judgement of the given kind. */
export function judgementLoss(notes: NoteCounts, kind: NoteKind, judge: NormalJudge | BreakJudge): number {
  const W = totalWeight(notes);
  if (W === 0) return 0;
  const unit = (NOTE_WEIGHT[kind] / W) * 100;
  if (kind !== "break") return unit * NORMAL_BASE_LOSS[judge as NormalJudge];
  const b = judge as BreakJudge;
  return unit * BREAK_BASE_LOSS[b] + BREAK_BONUS_LOSS[b] / notes.break;
}

export interface JudgementProblem {
  kind: NoteKind;
  message: string;
}

/** Form inputs may hand over "" or negative numbers; treat anything unusable as 0. */
function count(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Judgement counts that exceed the chart's notes of that kind. */
export function validateJudgements(notes: NoteCounts, j: Judgements): JudgementProblem[] {
  return NOTE_KINDS.flatMap((kind) => {
    const used = Object.values(j[kind]).reduce<number>((a, n) => a + count(n), 0);
    return used > notes[kind] ? [{ kind, message: `${kind.toUpperCase()} 判定数 ${used} 超过物量 ${notes[kind]}` }] : [];
  });
}

export interface AchievementResult {
  achievement: number;
  rank: RankId;
  rating: number | null;
}

/** Achievement for a judgement breakdown, truncated to 4 decimals like the game displays it. */
export function computeAchievement(notes: NoteCounts, j: Judgements, ds?: number): AchievementResult {
  let loss = 0;
  for (const kind of NOTE_KINDS) {
    for (const [judge, n] of Object.entries(j[kind])) {
      const c = count(n);
      if (c) loss += c * judgementLoss(notes, kind, judge as NormalJudge);
    }
  }
  const raw = Math.max(0, maxAchievement(notes) - loss);
  // Small epsilon so 100.49999999998 from float addition still reads as 100.5000.
  const achievement = Math.floor(raw * 10000 + 1e-6) / 10000;
  return { achievement, rank: rankOf(achievement), rating: ds == null ? null : chartRating(ds, achievement) };
}

export interface ToleranceRow {
  kind: NoteKind;
  judge: NormalJudge | BreakJudge;
  /** Achievement lost per occurrence. */
  loss: number;
  /** How many of this judgement alone still reach the target; Infinity when it costs nothing. */
  allowed: number;
}

/** For each single judgement type, how many can occur before dropping below `target`. */
export function tolerance(notes: NoteCounts, target: number): ToleranceRow[] {
  const budget = maxAchievement(notes) - target;
  const rows: ToleranceRow[] = [];
  for (const kind of NOTE_KINDS) {
    if (notes[kind] === 0) continue;
    for (const judge of kind === "break" ? BREAK_JUDGES : NORMAL_JUDGES) {
      const loss = judgementLoss(notes, kind, judge);
      const allowed = budget < 0 ? 0 : loss === 0 ? Infinity : Math.min(notes[kind], Math.floor(budget / loss + 1e-9));
      rows.push({ kind, judge, loss, allowed });
    }
  }
  return rows;
}

/** Lowest achievement (4 decimals) that gives at least `rating` on a chart, or null if unreachable. */
export function achievementForRating(ds: number, rating: number): number | null {
  if (rating <= 0) return 0;
  if (chartRating(ds, 100.5) < rating) return null;
  // Rating is monotonic in achievement, so binary search over 0.0001% units.
  let lo = 0;
  let hi = 1005000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (chartRating(ds, mid / 10000) >= rating) hi = mid;
    else lo = mid + 1;
  }
  return lo / 10000;
}
