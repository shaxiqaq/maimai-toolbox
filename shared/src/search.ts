import type { Chart, Song, SongType } from "./catalog";

function toHalfWidth(text: string): string {
  return text.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** Lowercase, full-width → half-width, drop whitespace, so "ＡＢＣ d" matches "abcd". */
export function normalize(text: string): string {
  return toHalfWidth(text).replace(/\s+/g, "").toLowerCase();
}

export interface Range {
  min: number;
  max: number;
}

/** Structured form of the search box. Free text plus optional range operators. */
export interface ParsedQuery {
  text: string;
  bpm: Range | null;
  ds: Range | null;
  level: string | null;
}

const OPERATOR = /^(bpm|ds|lv)(>=|<=|>|<|:|=)(.+)$/i;

/** "13.5~14", "13.5-14" or "13.5" → inclusive range. */
function parseRangeValue(value: string): Range | null {
  const parts = value.split(/[~\-～]/).map((p) => p.trim());
  const nums = parts.map(Number);
  if (nums.some((n, i) => parts[i] === "" || !Number.isFinite(n))) return null;
  if (nums.length === 1) return { min: nums[0]!, max: nums[0]! };
  if (nums.length === 2) return { min: Math.min(nums[0]!, nums[1]!), max: Math.max(nums[0]!, nums[1]!) };
  return null;
}

function parseComparison(op: string, value: string): Range | null {
  if (op === ":" || op === "=") return parseRangeValue(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Strict comparisons on these values only ever need one decimal of slack.
  if (op === ">") return { min: n + 1e-6, max: Infinity };
  if (op === ">=") return { min: n, max: Infinity };
  if (op === "<") return { min: -Infinity, max: n - 1e-6 };
  return { min: -Infinity, max: n };
}

/**
 * Split the search box into operators and free text.
 * Supported: `bpm>180`, `bpm:150~180`, `ds:13.5`, `ds>=14`, `lv:13+`. Unrecognized tokens stay as text.
 */
export function parseQuery(input: string): ParsedQuery {
  const parsed: ParsedQuery = { text: "", bpm: null, ds: null, level: null };
  const text: string[] = [];
  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    const m = OPERATOR.exec(toHalfWidth(token));
    const key = m?.[1]!.toLowerCase();
    if (m && key === "lv") {
      parsed.level = m[3]!;
      continue;
    }
    const range = m ? parseComparison(m[2]!, m[3]!) : null;
    if (range && (key === "bpm" || key === "ds")) {
      parsed[key] = range;
      continue;
    }
    text.push(token);
  }
  parsed.text = normalize(text.join(" "));
  return parsed;
}

export interface SongFilter {
  query: string;
  type: SongType | "";
  genre: string;
  version: string;
  /** Matches any chart whose display level equals this, e.g. "13+". */
  level: string;
}

export const EMPTY_FILTER: SongFilter = { query: "", type: "", genre: "", version: "", level: "" };

interface IndexedSong {
  song: Song;
  /** Normalized title first, then artist and aliases. */
  haystack: string[];
}

const indexCache = new WeakMap<Song[], IndexedSong[]>();

function indexSongs(songs: Song[]): IndexedSong[] {
  let index = indexCache.get(songs);
  if (!index) {
    index = songs.map((song) => ({ song, haystack: [song.title, song.artist, ...song.aliases].map(normalize) }));
    indexCache.set(songs, index);
  }
  return index;
}

const inRange = (n: number, r: Range) => n >= r.min && n <= r.max;

/** A chart must satisfy every chart-level condition at once (e.g. lv:14 and ds>=14.5 on the same chart). */
function chartMatches(chart: Chart, level: string | null, ds: Range | null): boolean {
  return (!level || chart.level === level) && (!ds || inRange(chart.ds, ds));
}

/**
 * Filter and rank songs. A bare number also matches the song id (with or without the DX +10000 offset).
 * Ranking: exact id / exact title, then title substring, then artist/alias substring; ties go to new songs, then newest id.
 */
export function searchSongs(songs: Song[], filter: SongFilter): Song[] {
  const q = parseQuery(filter.query);
  const level = q.level ?? (filter.level || null);
  const numeric = /^\d+$/.test(q.text) ? Number(q.text) : null;
  const hits: { song: Song; rank: number }[] = [];

  for (const { song, haystack } of indexSongs(songs)) {
    if (filter.type && song.type !== filter.type) continue;
    if (filter.genre && song.genre !== filter.genre) continue;
    if (filter.version && song.version !== filter.version) continue;
    if (q.bpm && !inRange(song.bpm, q.bpm)) continue;
    if ((level || q.ds) && !song.charts.some((c) => chartMatches(c, level, q.ds))) continue;

    let rank = 0;
    if (q.text) {
      const title = haystack[0]!;
      if (numeric != null && (song.id === numeric || song.id % 10000 === numeric)) rank = 0;
      else if (title === q.text) rank = 0;
      else if (title.includes(q.text)) rank = 1;
      else if (haystack.some((h) => h.includes(q.text))) rank = 2;
      else continue;
    }
    hits.push({ song, rank });
  }

  return hits
    .sort((a, b) => a.rank - b.rank || Number(b.song.isNew) - Number(a.song.isNew) || b.song.id - a.song.id)
    .map((h) => h.song);
}
