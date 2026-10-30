import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectibleProgress, requirementGoal, requirementLabel, requirementSongId, type Collectible } from "./collections";
import { withRating, type PlayRecord } from "./player";
import { indexRecords } from "./scores";

const rec = (songId: number, difficulty: 0 | 1 | 2 | 3, achievement: number, extra: Partial<PlayRecord> = {}) =>
  withRating({
    songId,
    title: "",
    type: songId >= 10000 ? "DX" : "SD",
    difficulty,
    level: "",
    ds: 12,
    achievement,
    dxScore: 0,
    combo: "",
    sync: "",
    ...extra,
  }) as PlayRecord;

describe("requirementGoal", () => {
  it("reads the condition by value, even when LXNS files sync flags under fc", () => {
    assert.deepEqual(requirementGoal({ difficulties: [], songs: [], fc: "ap" }), { kind: "combo", combo: "ap" });
    assert.deepEqual(requirementGoal({ difficulties: [], songs: [], fc: "fsd" }), { kind: "sync", sync: "fsd" });
    assert.deepEqual(requirementGoal({ difficulties: [], songs: [], rate: "sss" }), { kind: "rank", rank: "sss" });
    assert.equal(requirementGoal({ difficulties: [], songs: [] }), null);
    assert.equal(requirementLabel({ difficulties: [], songs: [], rate: "sssp" }), "SSS+");
    assert.equal(requirementLabel({ difficulties: [], songs: [], fc: "fs" }), "FS");
  });

  it("maps DX requirement songs to catalog ids", () => {
    assert.equal(requirementSongId({ id: 1663, type: "dx" }), 11663);
    assert.equal(requirementSongId({ id: 834, type: "standard" }), 834);
  });
});

describe("collectibleProgress", () => {
  const plate: Collectible = {
    id: 1,
    name: "测極",
    required: [
      {
        difficulties: [2, 3],
        fc: "fc",
        songs: [
          { id: 8, title: "A", type: "standard" },
          { id: 1663, title: "B", type: "dx" },
        ],
      },
    ],
  };

  it("counts every song × difficulty and lists what is missing", () => {
    const records = indexRecords([
      rec(8, 2, 99, { combo: "fc" }),
      rec(8, 3, 100.5, { combo: "ap" }), // AP satisfies FC
      rec(11663, 3, 100.6, { combo: "" }), // high score but no FC
    ]);
    const p = collectibleProgress(plate, records)!;
    assert.equal(p.total, 4);
    assert.equal(p.done, 2);
    assert.equal(p.complete, false);
    assert.deepEqual(p.missing.map((m) => [m.songId, m.difficulty, m.current?.achievement ?? null]), [
      [11663, 2, null],
      [11663, 3, 100.6],
    ]);
    assert.deepEqual(p.conditions, ["FC"]);
  });

  it("treats a block without a condition as 'play it' and needs every block", () => {
    const item: Collectible = {
      id: 2,
      name: "x",
      required: [
        { difficulties: [3], songs: [{ id: 8, title: "A", type: "standard" }] },
        { difficulties: [3], rate: "sss", songs: [{ id: 9, title: "C", type: "standard" }] },
      ],
    };
    const p = collectibleProgress(item, indexRecords([rec(8, 3, 50), rec(9, 3, 99.9)]))!;
    assert.equal(p.done, 1);
    assert.equal(p.complete, false);
  });

  it("returns null for items not earned by playing", () => {
    assert.equal(collectibleProgress({ id: 3, name: "event" }, new Map()), null);
  });
});
