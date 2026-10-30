import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { Catalog, Chart, Song } from "@mt/shared";
import { catalogIdOf, fetchLxnsB50, isPlausibleToken, toRecords, type LxScore } from "./lxns";
import { PlayerLookupError } from "./players";

const chart = (difficulty: 0 | 1 | 2 | 3 | 4, level: string, ds: number): Chart => ({
  difficulty,
  level,
  ds,
  charter: "",
  notes: { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, total: 0 },
  stats: null,
});

const song = (id: number, isNew: boolean, charts: Chart[]): Song => ({
  id,
  lxnsId: id % 10000,
  type: id >= 100000 ? "UTAGE" : id >= 10000 ? "DX" : "SD",
  title: `song ${id}`,
  artist: "",
  genre: "",
  bpm: 120,
  version: "",
  releaseDate: "",
  isNew,
  aliases: [],
  charts,
});

const catalog: Catalog = {
  builtAt: "",
  versions: [],
  genres: [],
  songs: [
    song(8, false, [chart(0, "5", 5), chart(1, "7", 7.2), chart(2, "10", 10.2), chart(3, "12", 12.4)]),
    song(11663, true, [chart(0, "7", 7), chart(1, "9", 9), chart(2, "12", 12), chart(3, "13+", 13.7)]),
    song(100018, false, [chart(0, "12?", 12)]),
  ],
};

const score = (over: Partial<LxScore>): LxScore => ({
  id: 8,
  song_name: "x",
  level: "12",
  level_index: 3,
  achievements: 100.5,
  fc: null,
  fs: null,
  dx_score: 0,
  type: "standard",
  ...over,
});

afterEach(() => mock.restoreAll());

describe("toRecords", () => {
  it("maps dx ids, fills ds from the catalog and counts unknown charts", () => {
    const { records, unmatched } = toRecords(
      [
        score({}),
        score({ id: 1663, type: "dx", achievements: 100, fc: "ap", fs: "fsdp" }),
        score({ id: 100018, type: "utage", level_index: 0 }),
        score({ id: 9999 }),
        score({ id: 8, level_index: 4 }), // no Re:Master in catalog
      ],
      catalog,
    );
    assert.equal(unmatched, 2);
    assert.deepEqual(
      records.map((r) => [r.songId, r.ds, r.rating, r.combo, r.sync]),
      [
        [8, 12.4, 279, "", ""],
        [11663, 13.7, 295, "ap", "fsdp"], // 13.7 × 21.6 × 1.0 = 295.92
        [100018, 12, 270, "", ""],
      ],
    );
    assert.equal(catalogIdOf({ id: 1663, type: "dx" }), 11663);
  });
});

describe("fetchLxnsB50", () => {
  it("builds B50 from player + scores and sends the token as a header only", async () => {
    const seen: { url: string; token: string | null }[] = [];
    mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, token: new Headers(init.headers).get("X-User-Token") });
      const data = url.endsWith("/player")
        ? { name: "ナマエ", rating: 15000, friend_code: 123456789, name_plate: { name: "plate" } }
        : [score({}), score({ id: 1663, type: "dx" }), score({ id: 100018, type: "utage", level_index: 0 })];
      return new Response(JSON.stringify({ success: true, code: 200, data }), { status: 200 });
    });
    const token = "test-token-0123456789abcdef";
    const b50 = await fetchLxnsB50(token, catalog);
    assert.equal(b50.source, "lxns");
    assert.equal(b50.nickname, "ナマエ");
    assert.deepEqual(b50.b35.map((r) => r.songId), [8]);
    assert.deepEqual(b50.b15.map((r) => r.songId), [11663]);
    assert.equal(seen.length, 2);
    assert.ok(seen.every((s) => s.token === token && !s.url.includes(token)));
  });

  it("maps an invalid token to a 403 with a clear message", async () => {
    mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
    await assert.rejects(
      fetchLxnsB50("another-token-0123456789", catalog),
      (e) => e instanceof PlayerLookupError && e.status === 403,
    );
  });
});

describe("isPlausibleToken", () => {
  it("rejects empty, short or non-printable values", () => {
    assert.equal(isPlausibleToken(undefined), false);
    assert.equal(isPlausibleToken("short"), false);
    assert.equal(isPlausibleToken("has space in the middle!!"), false);
    assert.equal(isPlausibleToken("abcdefghijklmnopqrstuvwxyz012345"), true);
  });
});
