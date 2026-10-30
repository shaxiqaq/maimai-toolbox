/** Community chart tags (voted by signed-in users) and the skill radar built on top of them. */
import type { PlayRecord } from "./player";
import { recordKey } from "./scores";

export const TAG_GROUPS = ["键型", "星星", "节奏", "综合"] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

export const CHART_TAGS = [
  { id: "stream", label: "纵连", group: "键型" },
  { id: "alternate", label: "交互", group: "键型" },
  { id: "offset", label: "错位", group: "键型" },
  { id: "sweep", label: "扫键", group: "键型" },
  { id: "crossover", label: "反手", group: "键型" },
  { id: "touch", label: "触摸", group: "键型" },
  { id: "spin", label: "转圈", group: "星星" },
  { id: "oneline", label: "一笔画", group: "星星" },
  { id: "movement", label: "大位移", group: "星星" },
  { id: "syncopation", label: "跳拍", group: "节奏" },
  { id: "scattered", label: "散打", group: "节奏" },
  { id: "burst", label: "爆发", group: "节奏" },
  { id: "break", label: "绝赞段", group: "节奏" },
  { id: "stamina", label: "体力", group: "综合" },
  { id: "density", label: "高物量", group: "综合" },
  { id: "underrated", label: "诈称", group: "综合" },
] as const satisfies readonly { id: string; label: string; group: TagGroup }[];

export type TagId = (typeof CHART_TAGS)[number]["id"];

const TAG_IDS = new Set<string>(CHART_TAGS.map((t) => t.id));
export const isTagId = (v: unknown): v is TagId => typeof v === "string" && TAG_IDS.has(v);
export const TAG_LABELS = Object.fromEntries(CHART_TAGS.map((t) => [t.id, t.label])) as Record<TagId, string>;

/** Vote counts per chart, keyed by recordKey(songId, difficulty). */
export type TagCounts = Record<string, Partial<Record<TagId, number>>>;

/** Tags on one chart, most votes first. */
export function chartTags(counts: TagCounts, songId: number, difficulty: number): { tag: TagId; votes: number }[] {
  const entry = counts[recordKey(songId, difficulty)] ?? {};
  return (Object.entries(entry) as [TagId, number][])
    .filter(([, n]) => n > 0)
    .map(([tag, votes]) => ({ tag, votes }))
    .sort((a, b) => b.votes - a.votes);
}

export function hasTag(counts: TagCounts, songId: number, difficulty: number, tag: TagId): boolean {
  return (counts[recordKey(songId, difficulty)]?.[tag] ?? 0) > 0;
}

export interface SkillAxis {
  tag: TagId;
  /** Tagged charts the player has played (with community stats to compare against). */
  played: number;
  /** Mean achievement on those charts. */
  avgAchievement: number;
  /** Mean of (player's achievement − community average) on those charts, in percentage points. */
  delta: number;
  /** 0–100 for drawing: 50 is the player's own overall level, higher means relatively stronger. */
  score: number;
}

export interface SkillRadar {
  axes: SkillAxis[];
  /** Mean delta over every played chart with stats; each axis is drawn relative to this. */
  overallDelta: number;
  /** Charts that counted toward `overallDelta`. */
  played: number;
}

/** Fewer plays than this on a tag is too noisy to draw. */
export const MIN_PLAYS_PER_AXIS = 3;
/** How many score points one percentage point above or below the player's own average moves an axis. */
const SCORE_PER_POINT = 15;

/**
 * Compare the player against the community average chart by chart, then average per tag. Each axis is
 * relative to the player's own overall margin, so the shape shows strengths and weaknesses at any skill
 * level. Utage charts and charts without community stats are ignored.
 */
export function skillRadar(
  records: PlayRecord[],
  counts: TagCounts,
  communityAvg: (songId: number, difficulty: number) => number | null,
): SkillRadar {
  const rows = records.flatMap((r) => {
    if (r.type === "UTAGE") return [];
    const avg = communityAvg(r.songId, r.difficulty);
    return avg === null ? [] : [{ r, delta: r.achievement - avg }];
  });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const overallDelta = mean(rows.map((x) => x.delta));

  const axes = CHART_TAGS.flatMap(({ id }) => {
    const tagged = rows.filter((x) => hasTag(counts, x.r.songId, x.r.difficulty, id));
    if (tagged.length < MIN_PLAYS_PER_AXIS) return [];
    const delta = mean(tagged.map((x) => x.delta));
    return [
      {
        tag: id,
        played: tagged.length,
        avgAchievement: mean(tagged.map((x) => x.r.achievement)),
        delta,
        score: Math.max(0, Math.min(100, 50 + (delta - overallDelta) * SCORE_PER_POINT)),
      },
    ];
  });
  return { axes, overallDelta, played: rows.length };
}
