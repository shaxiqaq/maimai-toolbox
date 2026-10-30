/** Song catalog served by our own backend. Merged from Diving-Fish music_data/chart_stats and LXNS song/alias lists. */

export type SongType = "SD" | "DX" | "UTAGE";

/** 0 Basic, 1 Advanced, 2 Expert, 3 Master, 4 Re:Master. Utage charts use 0. */
export type DifficultyIndex = 0 | 1 | 2 | 3 | 4;

export const DIFFICULTY_NAMES = ["Basic", "Advanced", "Expert", "Master", "Re:Master"] as const;

export interface NoteCounts {
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;
  total: number;
}

/** Community statistics for one chart (Diving-Fish chart_stats). */
export interface ChartStats {
  /** Number of submitted plays. */
  count: number;
  /** Fitted constant derived from player results. */
  fitDiff: number;
  /** Average achievement in percent. */
  avgAchievement: number;
}

export interface Chart {
  difficulty: DifficultyIndex;
  /** Display level, e.g. "13+". */
  level: string;
  /** Chart constant (定数). */
  ds: number;
  charter: string;
  notes: NoteCounts;
  stats: ChartStats | null;
}

export interface Song {
  /** Diving-Fish id: SD < 10000, DX = 10000 + base id, utage >= 100000. */
  id: number;
  /** LXNS id (the shared base id) or null when not matched. */
  lxnsId: number | null;
  type: SongType;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  /** Version the song first appeared in, e.g. "maimai でらっくす PRiSM PLUS". */
  version: string;
  releaseDate: string;
  /** Counts toward B15 (new songs) rather than B35. */
  isNew: boolean;
  aliases: string[];
  charts: Chart[];
}

export interface Catalog {
  /** ISO time the catalog was built on the server. */
  builtAt: string;
  songs: Song[];
  /** Versions in release order, oldest first. */
  versions: string[];
  genres: string[];
}

export function baseSongId(id: number): number {
  return id >= 100000 ? id : id % 10000;
}

/**
 * DXRating search for this song. Its chart dialog links to chart-preview videos (YouTube / Bilibili).
 * DXRating uses its own song ids, so a title search is the only stable way in.
 */
export function chartPreviewUrl(song: Pick<Song, "title">): string {
  return `https://dxrating.net/?q=${encodeURIComponent(song.title)}`;
}

/** Jacket image URL, served by our backend from a disk cache of LXNS assets (keyed by the shared base id). */
export function jacketUrl(song: Pick<Song, "id" | "lxnsId">): string {
  return `/api/jacket/${song.lxnsId ?? baseSongId(song.id)}.png`;
}
