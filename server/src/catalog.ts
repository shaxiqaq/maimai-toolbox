import { createHash } from "node:crypto";
import { baseSongId, type Catalog, type Chart, type DifficultyIndex, type NoteCounts, type Song } from "@mt/shared";
import { loadRawSources, type DfMusic, type RawSources } from "./sources";

function noteCounts(type: DfMusic["type"], notes: number[]): NoteCounts {
  const [tap = 0, hold = 0, slide = 0] = notes;
  const touch = type === "DX" ? (notes[3] ?? 0) : 0;
  const brk = type === "DX" ? (notes[4] ?? 0) : (notes[3] ?? 0);
  return { tap, hold, slide, touch, break: brk, total: tap + hold + slide + touch + brk };
}

export function buildCatalog(raw: RawSources): Catalog {
  const lxById = new Map(raw.lxSongs.songs.map((s) => [s.id, s]));
  const aliasesById = new Map(raw.lxAliases.aliases.map((a) => [a.song_id, a.aliases]));

  const songs: Song[] = raw.dfMusic.map((m) => {
    const id = Number(m.id);
    const isUtage = id >= 100000;
    const base = baseSongId(id);
    const lx = isUtage ? undefined : lxById.get(base);
    const stats = raw.dfStats.charts[m.id] ?? [];

    const charts: Chart[] = m.ds.map((ds, i) => {
      const st = stats[i];
      return {
        difficulty: (isUtage ? 0 : i) as DifficultyIndex,
        level: m.level[i] ?? "",
        ds,
        charter: m.charts[i]?.charter ?? "",
        notes: noteCounts(m.type, m.charts[i]?.notes ?? []),
        stats:
          st?.fit_diff != null && st.cnt != null && st.avg != null
            ? { count: st.cnt, fitDiff: st.fit_diff, avgAchievement: st.avg }
            : null,
      };
    });

    return {
      id,
      lxnsId: lx?.id ?? null,
      type: isUtage ? "UTAGE" : m.type,
      title: m.basic_info.title,
      artist: m.basic_info.artist,
      genre: m.basic_info.genre,
      bpm: m.basic_info.bpm,
      version: m.basic_info.from,
      releaseDate: lx?.release_date || m.basic_info.release_date,
      isNew: m.basic_info.is_new,
      aliases: lx ? (aliasesById.get(lx.id) ?? []) : [],
      charts,
    };
  });

  // Diving-Fish names versions differently from LXNS. Rank each Diving-Fish version by the most common
  // LXNS version number of its charts, using the chart type's own version (a DX chart of an old song is new).
  const votes = new Map<string, Map<number, number>>();
  for (const s of songs) {
    const lx = s.lxnsId != null ? lxById.get(s.lxnsId) : undefined;
    const lxVersion = (s.type === "DX" ? lx?.difficulties.dx : lx?.difficulties.standard)?.[0]?.version;
    if (lxVersion == null) continue;
    const counts = votes.get(s.version) ?? new Map<number, number>();
    counts.set(lxVersion, (counts.get(lxVersion) ?? 0) + 1);
    votes.set(s.version, counts);
  }
  const versionRank = new Map(
    [...votes].map(([name, counts]) => [name, [...counts].sort((a, b) => b[1] - a[1])[0]![0]]),
  );
  const versions = [...new Set(songs.map((s) => s.version))].sort(
    (a, b) => (versionRank.get(a) ?? Infinity) - (versionRank.get(b) ?? Infinity),
  );
  const genres = [...new Set(songs.map((s) => s.genre))];

  return { builtAt: new Date().toISOString(), songs, versions, genres };
}

interface CatalogCache {
  catalog: Catalog;
  body: string;
  etag: string;
}

let cache: CatalogCache | null = null;

/** Rebuild the in-memory catalog from cached sources. Returns false when sources are missing. */
export function rebuildCatalog(): boolean {
  const raw = loadRawSources();
  if (!raw) return false;
  const catalog = buildCatalog(raw);
  const body = JSON.stringify(catalog);
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  cache = { catalog, body, etag };
  return true;
}

export function getCatalog(): CatalogCache | null {
  return cache;
}
