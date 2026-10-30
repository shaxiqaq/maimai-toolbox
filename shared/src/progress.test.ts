import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Chart, Song } from "./catalog";
import { withRating, type PlayRecord } from "./player";
import { levelDistribution, meetsGoal, progressFor } from "./progress";
import { chartRating } from "./rating";
import { recommend, sortSuggestions, suggestedDsFloor } from "./recommend";
import { allCharts, indexRecords } from "./scores";

const chart = (difficulty: 0 | 1 | 2 | 3, level: string, ds: number, fitDiff?: number): Chart => ({
  difficulty,
  level,
  ds,
  charter: "",
  notes: { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, total: 0 },
  stats: fitDiff == null ? null : { count: 100, fitDiff, avgAchievement: 99 },
});

const song = (id: number, isNew: boolean, charts: Chart[]): Song => ({
  id,
  lxnsId: id % 10000,
  type: id >= 100000 ? "UTAGE" : id >= 10000 ? "DX" : "SD",
  title: `s${id}`,
  artist: "",
  genre: "",
  bpm: 120,
  version: "v",
  releaseDate: "",
  isNew,
  aliases: [],
  charts,
});

const rec = (songId: number, difficulty: 0 | 1 | 2 | 3, ds: number, achievement: number, extra: Partial<PlayRecord> = {}) =>
  withRating({
    songId,
    title: "",
    type: songId >= 10000 ? "DX" : "SD",
    difficulty,
    level: "",
    ds,
    achievement,
    dxScore: 0,
    combo: "",
    sync: "",
    ...extra,
  }) as PlayRecord;

describe("meetsGoal", () => {
  it("handles clear, rank, combo and sync tiers", () => {
    const r = rec(1, 3, 13, 100.2, { combo: "fcp", sync: "sync" });
    assert.equal(meetsGoal(r, { kind: "clear" }), true);
    assert.equal(meetsGoal(r, { kind: "rank", rank: "sss" }), true);
    assert.equal(meetsGoal(r, { kind: "rank", rank: "sssp" }), false);
    assert.equal(meetsGoal(r, { kind: "combo", combo: "fc" }), true);
    assert.equal(meetsGoal(r, { kind: "combo", combo: "ap" }), false);
    assert.equal(meetsGoal(r, { kind: "sync", sync: "fs" }), false, "SYNC PLAY is not a full sync");
    assert.equal(meetsGoal(undefined, { kind: "clear" }), false);
    assert.equal(meetsGoal(rec(1, 3, 13, 79.9999), { kind: "clear" }), false);
  });
});

describe("progressFor / levelDistribution", () => {
  const songs = [song(1, false, [chart(2, "12", 12.2), chart(3, "13", 13.4)]), song(2, false, [chart(3, "13", 13.0)])];
  const charts = allCharts(songs);
  const records = indexRecords([rec(1, 3, 13.4, 100.6), rec(1, 3, 13.4, 99.0), rec(2, 3, 13.0, 96.0, { combo: "ap" })]);

  it("counts done charts and lists the rest hardest first", () => {
    const p = progressFor(charts, records, { kind: "rank", rank: "sss" });
    assert.equal(p.total, 3);
    assert.equal(p.done, 1);
    assert.deepEqual(p.remaining.map((r) => r.chart.ds), [13.0, 12.2]);
  });

  it("buckets ranks and counts FC/AP", () => {
    const d = levelDistribution(charts.filter((c) => c.chart.level === "13"), records);
    assert.equal(d.total, 2);
    assert.equal(d.ranks.sssp, 1, "best of duplicate records is used");
    assert.equal(d.ranks.below, 1);
    assert.equal(d.ap, 1);
    assert.equal(d.fc, 1);
  });
});

describe("recommend", () => {
  const songs = [
    song(1, false, [chart(3, "13+", 13.5, 12.6)]), // in B35 at SS+, plays easier than its constant
    song(2, false, [chart(3, "13+", 13.7, 13.9)]), // unplayed, plays harder than its constant
    song(3, false, [chart(3, "12", 12.0)]), // even SSS+ cannot beat the floor
    song(11001, true, [chart(3, "13", 13.2)]), // new song, B15 empty
  ];
  // 34 fillers at 13.0 SSS make the B35 floor exactly 280; the listed chart sits above it.
  const b35 = [rec(1, 3, 13.5, 99.5), ...Array.from({ length: 34 }, (_, i) => rec(500 + i, 3, 13.0, 100.0))];
  const floor = chartRating(13.0, 100);
  const records = indexRecords(b35);

  const suggestions = recommend({ charts: allCharts(songs), records, b35, b15: [], dsMin: 12.0, dsMax: 14.0 });
  const byId = new Map(suggestions.map((s) => [s.song.id, s]));

  it("improves a listed chart by its own delta", () => {
    const s = byId.get(1)!;
    assert.equal(s.targetRank, "sss");
    assert.equal(s.gain, chartRating(13.5, 100) - chartRating(13.5, 99.5));
    assert.ok(Math.abs(s.easiness! - 0.9) < 1e-9);
  });

  it("replaces the floor for unlisted charts and skips charts that cannot beat it", () => {
    assert.equal(floor, 280);
    assert.ok(chartRating(13.7, 98) <= floor, "S+ does not beat the floor");
    assert.equal(byId.get(2)!.targetRank, "ss");
    assert.equal(byId.get(2)!.gain, chartRating(13.7, 99) - floor);
    assert.equal(byId.has(3), false);
  });

  it("fills an empty B15 slot from the lowest step", () => {
    const s = byId.get(11001)!;
    assert.equal(s.list, "b15");
    assert.equal(s.targetRank, "s");
    assert.equal(s.gain, chartRating(13.2, 97));
  });

  it("sorts by easiest step or by gain", () => {
    assert.deepEqual(sortSuggestions(suggestions, "easiest").map((s) => s.song.id), [11001, 2, 1]);
    assert.equal(sortSuggestions(suggestions, "gain")[0]!.song.id, 11001);
  });

  it("derives a default lower constant bound from the floor", () => {
    assert.equal(suggestedDsFloor(280), 12.5); // 280 / 22.512 = 12.44 → 12.5
  });
});
