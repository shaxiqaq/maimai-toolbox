import type { Song, SongType } from "@mt/shared";

/** Lowercase, full-width → half-width, drop whitespace, so "ＡＢＣ d" matches "abcd". */
export function normalize(text: string): string {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
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
  haystack: string[];
}

const indexCache = new WeakMap<Song[], IndexedSong[]>();

function indexSongs(songs: Song[]): IndexedSong[] {
  let index = indexCache.get(songs);
  if (!index) {
    index = songs.map((song) => ({
      song,
      haystack: [song.title, song.artist, ...song.aliases].map(normalize),
    }));
    indexCache.set(songs, index);
  }
  return index;
}

/**
 * Basic search for M0: numeric query matches the song id, otherwise substring match on
 * title, artist and aliases. Title hits rank before artist/alias hits. Full syntax arrives in M1.
 */
export function searchSongs(songs: Song[], filter: SongFilter): Song[] {
  const q = normalize(filter.query);
  const numeric = /^\d+$/.test(q) ? Number(q) : null;
  const hits: { song: Song; rank: number }[] = [];

  for (const { song, haystack } of indexSongs(songs)) {
    if (filter.type && song.type !== filter.type) continue;
    if (filter.genre && song.genre !== filter.genre) continue;
    if (filter.version && song.version !== filter.version) continue;
    if (filter.level && !song.charts.some((c) => c.level === filter.level)) continue;

    let rank = 0;
    if (q) {
      if (numeric != null && (song.id === numeric || song.id % 10000 === numeric)) rank = 0;
      else if (haystack[0]!.includes(q)) rank = haystack[0] === q ? 0 : 1;
      else if (haystack.some((h) => h.includes(q))) rank = 2;
      else continue;
    }
    hits.push({ song, rank });
  }

  return hits
    .sort((a, b) => a.rank - b.rank || Number(b.song.isNew) - Number(a.song.isNew) || b.song.id - a.song.id)
    .map((h) => h.song);
}
