import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Chart, Song } from "./catalog";
import { EMPTY_FILTER, parseQuery, searchSongs } from "./search";

function chart(level: string, ds: number): Chart {
  return {
    difficulty: 3,
    level,
    ds,
    charter: "",
    notes: { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, total: 0 },
    stats: null,
  };
}

function song(id: number, title: string, bpm: number, charts: Chart[], extra: Partial<Song> = {}): Song {
  return {
    id,
    lxnsId: id % 10000,
    type: id >= 10000 ? "DX" : "SD",
    title,
    artist: "artist",
    genre: "g",
    bpm,
    version: "v",
    releaseDate: "",
    isNew: false,
    aliases: [],
    charts,
    ...extra,
  };
}

const songs = [
  song(8, "True Love Song", 150, [chart("12", 12.4)], { aliases: ["真爱"] }),
  song(11663, "系ぎて", 88, [chart("13+", 13.7), chart("14+", 14.8)], { isNew: true }),
  song(834, "PANDORA PARADOXXX", 150, [chart("14+", 14.9)]),
  song(10834, "Love Song Remix", 200, [chart("13", 13.2)]),
];

const ids = (query: string, extra = {}) => searchSongs(songs, { ...EMPTY_FILTER, query, ...extra }).map((s) => s.id);

describe("parseQuery", () => {
  it("extracts operators and keeps the rest as text", () => {
    const q = parseQuery("love bpm>180 ds:13~13.5 lv:13");
    assert.equal(q.text, "love");
    assert.equal(q.bpm!.min > 180, true);
    assert.deepEqual(q.ds, { min: 13, max: 13.5 });
    assert.equal(q.level, "13");
  });

  it("accepts full-width operators and leaves invalid ones as text", () => {
    assert.deepEqual(parseQuery("ｂｐｍ：150").bpm, { min: 150, max: 150 });
    assert.deepEqual(parseQuery("DS＞＝14").ds, { min: 14, max: Infinity });
    assert.equal(parseQuery("bpm>abc").text, "bpm>abc");
  });
});

describe("searchSongs", () => {
  it("ranks exact and title hits before alias/artist hits", () => {
    assert.deepEqual(ids("love song"), [10834, 8]);
    assert.deepEqual(ids("真爱"), [8]);
  });

  it("matches ids with or without the DX offset", () => {
    assert.deepEqual(ids("1663"), [11663]);
    assert.deepEqual(ids("834"), [10834, 834]);
  });

  it("filters by bpm and by chart constant on the same chart", () => {
    assert.deepEqual(ids("bpm>=150"), [10834, 834, 8]);
    assert.deepEqual(ids("ds>=14.8"), [11663, 834]);
    assert.deepEqual(ids("lv:13+ ds>=14"), []); // 13+ chart is 13.7, the 14.x chart is 14+
    assert.deepEqual(ids("", { level: "14+" }), [11663, 834]);
  });
});
