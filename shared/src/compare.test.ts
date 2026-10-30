import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Catalog } from "./catalog";
import { compareScores, sanitizeSnapshot, snapshotRecords, toSnapshot } from "./compare";
import { withRating, type PlayRecord } from "./player";

const rec = (songId: number, difficulty: number, achievement: number, type: PlayRecord["type"] = "DX"): PlayRecord =>
  withRating({ songId, title: `s${songId}`, type, difficulty: difficulty as 0, level: "13", ds: 13, achievement, dxScore: 1000, combo: "", sync: "" });

describe("compareScores", () => {
  it("counts wins, losses, ties and one-sided charts, ignoring utage", () => {
    const mine = [rec(1, 3, 100.5), rec(2, 3, 99), rec(3, 3, 98), rec(4, 3, 97), rec(100001, 0, 100, "UTAGE")];
    const theirs = [rec(1, 3, 100.1), rec(2, 3, 99.5), rec(3, 3, 98), rec(5, 3, 96), rec(100001, 0, 90, "UTAGE")];
    const c = compareScores(mine, theirs);
    assert.deepEqual([c.wins, c.losses, c.ties, c.onlyMine, c.onlyTheirs], [1, 1, 1, 1, 1]);
    assert.equal(c.charts.find((x) => x.songId === 1)!.diff, 0.4);
    assert.equal(c.charts.find((x) => x.songId === 5)!.diff, null);
  });

  it("uses each player's best entry for a chart", () => {
    const c = compareScores([rec(1, 3, 99), rec(1, 3, 100.2)], [rec(1, 3, 100)]);
    assert.equal(c.wins, 1);
  });
});

describe("snapshots", () => {
  const catalog = {
    songs: [{ id: 1, title: "Song", type: "DX", charts: [{ difficulty: 3, level: "13+", ds: 13.7 }] }],
  } as unknown as Catalog;

  it("round-trips through the compact form, taking titles and constants from the catalog", () => {
    const snap = toSnapshot([rec(1, 3, 100.5), rec(1, 3, 99), rec(2, 3, 98)], {
      source: "lxns",
      nickname: "n",
      full: true,
      rating: 300,
      fetchedAt: "t",
    });
    assert.equal(snap.records.length, 2);
    const back = snapshotRecords(snap, catalog);
    assert.equal(back.length, 1, "chart 2 is not in the catalog");
    assert.deepEqual([back[0]!.title, back[0]!.ds, back[0]!.achievement, back[0]!.rank], ["Song", 13.7, 100.5, "sssp"]);
  });

  it("rejects malformed uploads and strips unknown fields", () => {
    const ok = sanitizeSnapshot({ source: "lxns", nickname: "n", full: true, rating: 15000, records: [[1, 3, 100.5, 10, "ap", "fsd"]], fetchedAt: "t", extra: 1 });
    assert.deepEqual(ok, { source: "lxns", nickname: "n", full: true, rating: 15000, records: [[1, 3, 100.5, 10, "ap", "fsd"]], fetchedAt: "t" });
    for (const bad of [
      null,
      { records: "x" },
      { records: [[1, 3, 100.5, 10, "bogus", ""]] },
      { records: [[1, 9, 100.5, 10, "", ""]] },
      { records: [[1, 3, 150, 10, "", ""]] },
      { records: [[1, 3, 100, 10, ""]] },
    ]) {
      assert.equal(sanitizeSnapshot(bad), null, JSON.stringify(bad));
    }
  });
});
