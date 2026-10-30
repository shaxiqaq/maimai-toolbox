import type { Catalog, Chart, Song } from "./catalog";
import { buildB50, type PlayerB50, type PlayRecord } from "./player";

/** A player's complete best-score list (currently only available from LXNS with a personal token). */
export interface PlayerScores {
  source: "lxns";
  username: string;
  nickname: string;
  plate: string;
  reportedRating: number;
  records: PlayRecord[];
  /** Scores whose chart is missing from our catalog. */
  unmatched: number;
  fetchedAt: string;
}

export function recordKey(songId: number, difficulty: number): string {
  return `${songId}:${difficulty}`;
}

/** Best record per chart. */
export function indexRecords(records: PlayRecord[]): Map<string, PlayRecord> {
  const map = new Map<string, PlayRecord>();
  for (const r of records) {
    const key = recordKey(r.songId, r.difficulty);
    const prev = map.get(key);
    if (!prev || r.achievement > prev.achievement) map.set(key, r);
  }
  return map;
}

export function b50FromScores(scores: PlayerScores, catalog: Catalog): PlayerB50 {
  const newIds = new Set(catalog.songs.filter((s) => s.isNew).map((s) => s.id));
  const { b35, b15 } = buildB50(scores.records, (id) => newIds.has(id));
  return {
    source: scores.source,
    username: scores.username,
    nickname: scores.nickname,
    plate: scores.plate,
    reportedRating: scores.reportedRating,
    b35,
    b15,
    unmatched: scores.unmatched,
    fetchedAt: scores.fetchedAt,
  };
}

export interface ChartRef {
  song: Song;
  chart: Chart;
}

/** Every non-utage chart in the catalog. */
export function allCharts(songs: Song[]): ChartRef[] {
  return songs.filter((s) => s.type !== "UTAGE").flatMap((song) => song.charts.map((chart) => ({ song, chart })));
}
