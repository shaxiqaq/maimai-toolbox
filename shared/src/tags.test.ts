import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withRating, type PlayRecord } from "./player";
import { chartTags, isTagId, skillRadar, type TagCounts } from "./tags";

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
    const radar = skillRadar(records, counts, (songId) => (songId === 100001 ? 0 : 98));
    assert.equal(radar.played, 7, "utage is ignored");
    assert.ok(Math.abs(radar.overallDelta - 2) < 1e-9);
    const byTag = Object.fromEntries(radar.axes.map((a) => [a.tag, a]));
    assert.deepEqual(Object.keys(byTag).sort(), ["spin", "stream"]);
    assert.ok(byTag.spin!.score > 50 && byTag.stream!.score < 50);
    assert.equal(byTag.spin!.played, 3);
    assert.ok(Math.abs(byTag.spin!.delta - 3) < 1e-9);
  });

  it("skips charts without community stats", () => {
    const radar = skillRadar(records, counts, (songId) => (songId <= 3 ? null : 98));
    assert.deepEqual(radar.axes.map((a) => a.tag), ["stream"]);
  });
});
