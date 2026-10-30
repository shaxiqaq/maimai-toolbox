/**
 * maimai collectibles (name plates, titles, icons, frames) from the LXNS public API, including the exact
 * conditions for the ones earned by playing, and progress against a player's best scores.
 */
import type { PlayRecord } from "./player";
import { meetsGoal, type Goal } from "./progress";
import type { ComboFlag, RankId, SyncFlag } from "./rating";
import { recordKey } from "./scores";

export type CollectionKind = "plate" | "trophy" | "icon" | "frame";

export const COLLECTION_KINDS: CollectionKind[] = ["plate", "trophy", "icon", "frame"];

export const COLLECTION_LABELS: Record<CollectionKind, string> = {
  plate: "姓名框（牌子）",
  trophy: "称号",
  icon: "头像",
  frame: "背景",
};

export interface LxRequirementSong {
  id: number;
  title: string;
  type: "standard" | "dx" | "utage";
}

/** One condition block: every listed song, on every listed difficulty, must meet the (optional) condition. */
export interface LxRequirement {
  difficulties: number[];
  songs: LxRequirementSong[];
  fc?: string;
  fs?: string;
  rate?: string;
}

export interface Collectible {
  id: number;
  name: string;
  description?: string;
  genre?: string;
  /** Titles only: Normal / Bronze / Silver / Gold / Rainbow. */
  color?: string;
  release_date?: string;
  /** All blocks must be satisfied. Absent for items earned some other way (events, ratings, …). */
  required?: LxRequirement[];
}

export function collectionUrl(kind: CollectionKind): string {
  return `https://maimai.lxns.net/api/v0/maimai/${kind}/list?required=true`;
}

/** The list key in each response ("plates", "trophies", "icons", "frames"). */
export function collectionListKey(kind: CollectionKind): string {
  return kind === "trophy" ? "trophies" : `${kind}s`;
}

/** Image for plates, icons and frames (titles have none). */
export function collectionImageUrl(kind: CollectionKind, id: number): string | null {
  return kind === "trophy" ? null : `https://assets2.lxns.net/maimai/${kind}/${id}.png`;
}

const COMBOS = new Set(["fc", "fcp", "ap", "app"]);
const SYNCS = new Set(["fs", "fsp", "fsd", "fsdp"]);
const RANKS = new Set(["d", "c", "b", "bb", "bbb", "a", "aa", "aaa", "s", "sp", "ss", "ssp", "sss", "sssp"]);

/**
 * The goal a requirement block sets, or null for "just play it". LXNS sometimes files sync
 * conditions under `fc` (e.g. `fc: "fsd"`), so the value decides, not the key.
 */
export function requirementGoal(r: LxRequirement): Goal | null {
  for (const v of [r.fc, r.fs, r.rate]) {
    if (!v) continue;
    if (COMBOS.has(v)) return { kind: "combo", combo: v as Exclude<ComboFlag, ""> };
    if (SYNCS.has(v)) return { kind: "sync", sync: v as Exclude<SyncFlag, "" | "sync"> };
    if (RANKS.has(v)) return { kind: "rank", rank: v as RankId };
  }
  return null;
}

/** Human-readable condition, e.g. "FC", "SSS", "游玩". */
export function requirementLabel(r: LxRequirement): string {
  const goal = requirementGoal(r);
  if (!goal) return "游玩";
  if (goal.kind === "combo") return { fc: "FC", fcp: "FC+", ap: "AP", app: "AP+" }[goal.combo];
  if (goal.kind === "sync") return { fs: "FS", fsp: "FS+", fsd: "FDX", fsdp: "FDX+" }[goal.sync];
  return goal.kind === "rank" ? goal.rank.toUpperCase().replace("P", "+") : "";
}

/** Our catalog id for a requirement song (Diving-Fish ids: DX charts are base + 10000). */
export function requirementSongId(s: Pick<LxRequirementSong, "id" | "type">): number {
  return s.type === "dx" ? s.id + 10000 : s.id;
}

export interface MissingChart {
  songId: number;
  title: string;
  difficulty: number;
  current: PlayRecord | null;
}

export interface CollectibleProgress {
  done: number;
  total: number;
  complete: boolean;
  /** Charts still short of the condition, in requirement order. */
  missing: MissingChart[];
  /** Condition labels per block, for display. */
  conditions: string[];
}

/** Progress towards an item's requirements, or null when it is not earned by playing. */
export function collectibleProgress(item: Collectible, records: Map<string, PlayRecord>): CollectibleProgress | null {
  if (!item.required?.length) return null;
  let done = 0;
  let total = 0;
  const missing: MissingChart[] = [];
  for (const block of item.required) {
    const goal = requirementGoal(block);
    for (const song of block.songs) {
      const songId = requirementSongId(song);
      // Utage charts are stored at difficulty 0 regardless of the listed index.
      const difficulties = song.type === "utage" ? [0] : block.difficulties;
      for (const difficulty of difficulties) {
        total++;
        const current = records.get(recordKey(songId, difficulty)) ?? null;
        const ok = goal ? meetsGoal(current ?? undefined, goal) : current !== null;
        if (ok) done++;
        else missing.push({ songId, title: song.title, difficulty, current });
      }
    }
  }
  return { done, total, complete: done === total, missing, conditions: item.required.map(requirementLabel) };
}
