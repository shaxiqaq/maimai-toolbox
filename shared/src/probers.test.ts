import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { Catalog, Chart, Song } from "./catalog";
import {
  catalogIdOf,
  fetchDivingFishB50,
  fetchLxnsScores,
  isPlausibleToken,
  lxnsRecords,
  parsePlayerQuery,
  ProberError,
  type LxScore,
} from "./probers";

afterEach(() => mock.restoreAll());

// ---- Diving-Fish ----

function dfRecord(over: Record<string, unknown>) {
  return {
    song_id: 11663,
    title: "Song",
    type: "DX",
    level_index: 3,
    level: "13",
    ds: 13.0,
    achievements: 100.5,
    dxScore: 1800,
    fc: "ap",
    fs: "fsdp",
    ...over,
  };
}

function respond(status: number, body: unknown) {
  return mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status }));
}

describe("fetchDivingFishB50", () => {
  it("posts the query with b50, recomputes ratings and sorts", async () => {
    let sent: unknown;
    mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return Response.json({
        username: "tester",
        nickname: "T",
        plate: "",
        rating: 999,
        charts: {
          sd: [dfRecord({ song_id: 8, type: "SD", ds: 12.4, achievements: 99.5, fc: "", fs: "" }), dfRecord({ song_id: 9, ds: 14.0 })],
          dx: [dfRecord({ fc: "unknown", fs: "sync" })],
        },
      });
    });
    const b50 = await fetchDivingFishB50({ username: "tester" });
    assert.deepEqual(sent, { username: "tester", b50: true });
    assert.deepEqual(
      b50.b35.map((r) => [r.songId, r.rating, r.rank]),
      [
        [9, 315, "sssp"],
        [8, 260, "ssp"],
      ],
    );
    assert.equal(b50.b15[0]!.combo, "", "unknown combo flags are dropped");
    assert.equal(b50.b15[0]!.sync, "sync");
    assert.equal(b50.reportedRating, 999);
  });

  it("maps 400 / 403 to friendly errors and retries one dropped connection", async () => {
    respond(400, {});
    await assert.rejects(fetchDivingFishB50({ username: "x" }), (e) => e instanceof ProberError && e.status === 404);
    mock.restoreAll();
    respond(403, {});
    await assert.rejects(fetchDivingFishB50({ qq: "123456" }), (e) => e instanceof ProberError && e.status === 403);
    mock.restoreAll();
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      if (++calls === 1) throw new TypeError("fetch failed");
      return new Response("{}", { status: 400 });
    });
    await assert.rejects(fetchDivingFishB50({ username: "x" }), (e) => e instanceof ProberError && e.status === 404);
    assert.equal(calls, 2);
  });

  it("validates queries", () => {
    assert.deepEqual(parsePlayerQuery({ qq: " 123456 ", username: "x" }), { qq: "123456" });
    assert.equal(parsePlayerQuery({ qq: "abc" }), null);
    assert.deepEqual(parsePlayerQuery({ username: " name " }), { username: "name" });
    assert.equal(parsePlayerQuery({}), null);
  });
});

// ---- LXNS ----

const chart = (difficulty: 0 | 1 | 2 | 3, level: string, ds: number): Chart => ({
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
  gameVersions: [],
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

describe("lxnsRecords", () => {
  it("maps dx ids, fills ds from the catalog and counts unknown charts", () => {
    const { records, unmatched } = lxnsRecords(
      [
        score({}),
        score({ id: 1663, type: "dx", achievements: 100, fc: "ap", fs: "fsdp" }),
        score({ id: 100018, type: "utage", level_index: 0 }),
        score({ id: 9999 }),
        score({ id: 8, level_index: 4 }),
      ],
      catalog,
    );
    assert.equal(unmatched, 2);
    assert.deepEqual(
      records.map((r) => [r.songId, r.ds, r.rating, r.combo, r.sync]),
      [
        [8, 12.4, 279, "", ""],
        [11663, 13.7, 295, "ap", "fsdp"],
        [100018, 12, 270, "", ""],
      ],
    );
    assert.equal(catalogIdOf({ id: 1663, type: "dx" }), 11663);
  });
});

describe("fetchLxnsScores", () => {
  it("sends the token only as a header and returns all records", async () => {
    const seen: { url: string; token: string | null }[] = [];
    mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, token: new Headers(init.headers).get("X-User-Token") });
      const data = url.endsWith("/player")
        ? { name: "ナマエ", rating: 15000, friend_code: 123456789, name_plate: { name: "plate" } }
        : [score({}), score({ id: 1663, type: "dx" })];
      return Response.json({ success: true, code: 200, data });
    });
    const token = "test-token-0123456789abcdef";
    const scores = await fetchLxnsScores(token, catalog);
    assert.equal(scores.nickname, "ナマエ");
    assert.equal(scores.username, "123456789");
    assert.deepEqual(scores.records.map((r) => r.songId), [8, 11663]);
    assert.ok(seen.length === 2 && seen.every((s) => s.token === token && !s.url.includes(token)));
  });

  it("maps an invalid token to 403 and rejects implausible tokens up front", async () => {
    mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
    await assert.rejects(fetchLxnsScores("another-token-0123456789", catalog), (e) => e instanceof ProberError && e.status === 403);
    await assert.rejects(fetchLxnsScores("short", catalog), (e) => e instanceof ProberError && e.status === 400);
    assert.equal(isPlausibleToken("has space in the middle!!"), false);
  });
});
