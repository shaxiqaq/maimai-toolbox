import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildB50, summarizeB50, withRating, type PlayRecord } from "./player";

function rec(songId: number, ds: number, achievement: number, extra: Partial<PlayRecord> = {}): PlayRecord {
  return withRating({
    songId,
    title: String(songId),
    type: songId >= 100000 ? "UTAGE" : songId >= 10000 ? "DX" : "SD",
    difficulty: 3,
    level: "",
    ds,
    achievement,
    dxScore: 0,
    combo: "",
    sync: "",
    ...extra,
  });
}

const NEW_IDS = new Set([11001, 11002]);
const isNew = (id: number) => NEW_IDS.has(id);

describe("buildB50", () => {
  it("splits by isNew, sorts by rating and drops utage", () => {
    const { b35, b15 } = buildB50(
      [rec(8, 12.0, 100.5), rec(9, 13.0, 100.5), rec(11001, 14.0, 99.0), rec(100018, 15.0, 101), rec(11002, 14.5, 100.0)],
      isNew,
    );
    assert.deepEqual(b35.map((r) => r.songId), [9, 8]);
    assert.deepEqual(b15.map((r) => r.songId), [11002, 11001]);
  });

  it("keeps only the best entry per chart", () => {
    const { b35 } = buildB50([rec(8, 12.0, 97.0), rec(8, 12.0, 100.0), rec(8, 12.0, 98.0, { difficulty: 2 })], isNew);
    assert.deepEqual(b35.map((r) => [r.difficulty, r.achievement]), [[3, 100], [2, 98]]);
  });

  it("caps lists at 35 and 15", () => {
    const old = Array.from({ length: 40 }, (_, i) => rec(i + 1, 10 + i / 10, 100));
    const fresh = Array.from({ length: 20 }, () => rec(11001, 14, 100)).map((r, i) => ({ ...r, difficulty: (i % 5) as 0 }));
    const { b35, b15 } = buildB50([...old, ...fresh], isNew);
    assert.equal(b35.length, 35);
    assert.equal(b15.length, 5, "duplicates of the same chart collapse");
    assert.equal(summarizeB50(b35, b15).b35Floor, b35[34]!.rating);
  });
});
