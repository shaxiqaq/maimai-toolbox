import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Song } from "./catalog";
import { popularityRanks, songPlayCount } from "./popularity";

const song = (id: number, counts: (number | null)[], type: Song["type"] = "DX") =>
  ({ id, type, charts: counts.map((n) => ({ stats: n === null ? null : { count: n } })) }) as unknown as Song;

describe("popularity", () => {
  it("sums uploaded plays across charts, treating missing stats as zero", () => {
    assert.equal(songPlayCount(song(1, [10, null, 5])), 15);
  });

  it("ranks by play count with shared ranks for ties and skips utage", () => {
    const ranks = popularityRanks([song(1, [5]), song(2, [9]), song(3, [5]), song(100001, [99], "UTAGE")]);
    assert.deepEqual([...ranks].sort((a, b) => a[0] - b[0]), [
      [1, 2],
      [2, 1],
      [3, 2],
    ]);
  });
});
