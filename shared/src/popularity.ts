/** Song popularity, approximated by how many plays Diving-Fish users have uploaded across a song's charts. */
import type { Song } from "./catalog";

export function songPlayCount(song: Song): number {
  return song.charts.reduce((sum, c) => sum + (c.stats?.count ?? 0), 0);
}

/** 1-based popularity rank per song id (utage excluded); ties share a rank. */
export function popularityRanks(songs: Song[]): Map<number, number> {
  const counted = songs.filter((s) => s.type !== "UTAGE").map((s) => ({ id: s.id, n: songPlayCount(s) }));
  counted.sort((a, b) => b.n - a.n);
  const ranks = new Map<number, number>();
  counted.forEach((s, i) => ranks.set(s.id, i > 0 && counted[i - 1]!.n === s.n ? ranks.get(counted[i - 1]!.id)! : i + 1));
  return ranks;
}
