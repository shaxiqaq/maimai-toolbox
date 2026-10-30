import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withRating, type PlayRecord } from "./player";
import type { Catalog } from "./catalog";
import { autoTags, chartTags, isTagId, skillRadar, tagLookup, type TagCounts } from "./tags";

const rec = (songId: number, achievement: number, type: PlayRecord["type"] = "DX"): PlayRecord =>
  withRating({ songId, title: `s${songId}`, type, difficulty: 3, level: "13", ds: 13, achievement, dxScore: 0, combo: "", sync: "" });

describe("tags", () => {
  it("validates tag ids", () => {
    assert.equal(isTagId("spin"), true);
    assert.equal(isTagId("nope"), false);
    assert.equal(isTagId(1), false);
  });

  it("lists a chart's tags by votes, skipping zero counts", () => {
    const counts: TagCounts = { "1:3": { spin: 1, stream: 4, burst: 0 } };
    assert.deepEqual(chartTags(counts, 1, 3), [
      { tag: "stream", votes: 4 },
      { tag: "spin", votes: 1 },
    ]);
    assert.deepEqual(chartTags(counts, 2, 3), []);
  });
});

describe("skillRadar", () => {
  // Community average is 98 everywhere; the player is +2 overall, +3 on spin charts, +1 on stream charts.
  const counts: TagCounts = {};
  for (const id of [1, 2, 3]) counts[`${id}:3`] = { spin: 1 };
  for (const id of [4, 5, 6]) counts[`${id}:3`] = { stream: 2 };
  counts["7:3"] = { burst: 1 }; // only one play: too few for an axis
  const records = [rec(1, 101), rec(2, 101), rec(3, 101), rec(4, 99), rec(5, 99), rec(6, 99), rec(7, 100), rec(100001, 50, "UTAGE")];

  it("draws each tag relative to the player's own overall margin", () => {
    const radar = skillRadar(records, tagLookup(counts, {}), (songId) => (songId === 100001 ? 0 : 98));
    assert.equal(radar.played, 7, "utage is ignored");
    assert.ok(Math.abs(radar.overallDelta - 2) < 1e-9);
    const byTag = Object.fromEntries(radar.axes.map((a) => [a.tag, a]));
    assert.deepEqual(Object.keys(byTag).sort(), ["spin", "stream"]);
    assert.ok(byTag.spin!.score > 50 && byTag.stream!.score < 50);
    assert.equal(byTag.spin!.played, 3);
    assert.ok(Math.abs(byTag.spin!.delta - 3) < 1e-9);
  });

  it("skips charts without community stats", () => {
    const radar = skillRadar(records, tagLookup(counts, {}), (songId) => (songId <= 3 ? null : 98));
    assert.deepEqual(radar.axes.map((a) => a.tag), ["stream"]);
  });
});

describe("autoTags", () => {
  const chart = (id: number, o: { ds?: number; level?: string; fit?: number; samples?: number; total?: number; touch?: number; brk?: number }) => ({
    id,
    type: "DX",
    charts: [
      {
        difficulty: 3,
        level: o.level ?? "13",
        ds: o.ds ?? 13,
        notes: { tap: 0, hold: 0, slide: 0, touch: o.touch ?? 0, break: o.brk ?? 0, total: o.total ?? 700 },
        stats: o.fit === undefined ? null : { fitDiff: o.fit, count: o.samples ?? 500, avgAchievement: 98 },
      },
    ],
  });
  // 20 ordinary level-13 charts with 700 notes, plus special cases.
  const songs = Array.from({ length: 20 }, (_, i) => chart(i + 1, {}));
  songs.push(
    chart(101, { fit: 13.5 }), // fitted 0.5 above: underrated
    chart(102, { fit: 13.5, samples: 10 }), // too few samples
    chart(103, { ds: 9, level: "9", fit: 9.8 }), // below the minimum constant
    chart(104, { total: 900 }), // top note count among level 13
    chart(105, { touch: 120 }), // 17% touch
    chart(106, { brk: 70 }), // 10% break
  );
  const auto = autoTags({ songs } as unknown as Catalog);

  it("tags charts from their data", () => {
    assert.deepEqual(auto["101:3"], ["underrated"]);
    assert.equal(auto["102:3"], undefined);
    assert.equal(auto["103:3"], undefined);
    assert.deepEqual(auto["104:3"], ["density"]);
    assert.deepEqual(auto["105:3"], ["touch"]);
    assert.deepEqual(auto["106:3"], ["break"]);
    assert.equal(auto["1:3"], undefined);
  });

  it("combines with votes in one lookup", () => {
    const has = tagLookup({ "1:3": { spin: 1 } }, auto);
    assert.equal(has(1, 3, "spin"), true);
    assert.equal(has(101, 3, "underrated"), true);
    assert.equal(has(101, 3, "spin"), false);
  });
});
