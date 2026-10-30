/** Upstream public data sources and their raw response shapes (only the fields we use). */
import { config } from "./config";
import { getSource, putSource, touchSource } from "./db";

export const SOURCES = {
  dfMusic: "https://www.diving-fish.com/api/maimaidxprober/music_data",
  dfStats: "https://www.diving-fish.com/api/maimaidxprober/chart_stats",
  lxSongs: "https://maimai.lxns.net/api/v0/maimai/song/list",
  lxAliases: "https://maimai.lxns.net/api/v0/maimai/alias/list",
} as const;

export type SourceName = keyof typeof SOURCES;

export interface DfMusic {
  id: string;
  title: string;
  type: "SD" | "DX";
  ds: number[];
  level: string[];
  /** SD: [tap, hold, slide, break]; DX: [tap, hold, slide, touch, break]. */
  charts: { notes: number[]; charter: string }[];
  basic_info: {
    title: string;
    artist: string;
    genre: string;
    bpm: number;
    release_date: string;
    from: string;
    is_new: boolean;
  };
}

export interface DfChartStat {
  cnt?: number;
  fit_diff?: number;
  avg?: number;
}

export interface DfStats {
  charts: Record<string, DfChartStat[]>;
}

export interface LxSong {
  id: number;
  title: string;
  version: number;
  release_date: string;
  /** Per chart-type difficulties; each carries the version that chart type was added in. */
  difficulties: {
    standard: { version: number }[];
    dx: { version: number }[];
  };
}

export interface LxSongList {
  songs: LxSong[];
  versions: { title: string; version: number }[];
}

export interface LxAliasList {
  aliases: { song_id: number; aliases: string[] }[];
}

export interface RawSources {
  dfMusic: DfMusic[];
  dfStats: DfStats;
  lxSongs: LxSongList;
  lxAliases: LxAliasList;
}

/** Fetch one source unless the cached copy is fresh. Uses ETag when the upstream supports it. */
async function refreshSource(name: SourceName, force: boolean): Promise<"fresh" | "updated" | "not-modified"> {
  const cached = getSource(name);
  if (!force && cached && Date.now() - cached.fetched_at < config.syncIntervalMs) return "fresh";

  const headers: Record<string, string> = { "User-Agent": config.userAgent };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  const res = await fetch(SOURCES[name], { headers, signal: AbortSignal.timeout(60_000) });
  if (res.status === 304 && cached) {
    touchSource(name);
    return "not-modified";
  }
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = await res.text();
  JSON.parse(body); // reject truncated or non-JSON bodies before caching
  putSource(name, body, res.headers.get("etag"));
  return "updated";
}

/**
 * Refresh all sources. Sources are fetched one at a time to stay well under upstream rate limits.
 * A failing source keeps its previous cached copy.
 */
export async function syncSources(force = false): Promise<Record<SourceName, string>> {
  const result = {} as Record<SourceName, string>;
  for (const name of Object.keys(SOURCES) as SourceName[]) {
    try {
      result[name] = await refreshSource(name, force);
    } catch (err) {
      result[name] = `error: ${(err as Error).message}`;
    }
  }
  return result;
}

export function loadRawSources(): RawSources | null {
  const raw: Partial<Record<SourceName, unknown>> = {};
  for (const name of Object.keys(SOURCES) as SourceName[]) {
    const row = getSource(name);
    if (!row) return null;
    raw[name] = JSON.parse(row.body);
  }
  return raw as RawSources;
}
