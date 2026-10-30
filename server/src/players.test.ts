import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { fetchB50, parsePlayerQuery, PlayerLookupError } from "./players";

function record(over: Record<string, unknown>) {
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
    ra: 0,
    rate: "sssp",
    level_label: "Master",
    ...over,
  };
}

function respond(status: number, body: unknown) {
  return mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => mock.restoreAll());

describe("fetchB50", () => {
  it("normalizes records, recomputes rating and sorts by rating", async () => {
    respond(200, {
      username: "tester",
      nickname: "T",
      plate: "",
      rating: 999,
      charts: {
        sd: [record({ song_id: 8, type: "SD", ds: 12.4, achievements: 99.5, fc: "", fs: "" }), record({ song_id: 9, ds: 14.0 })],
        dx: [record({ song_id: 11663, fc: "unknown", fs: "sync" })],
      },
    });
    const b50 = await fetchB50({ username: "tester-normalize" });
    assert.deepEqual(
      b50.b35.map((r) => [r.songId, r.rating, r.rank]),
      [
        [9, 315, "sssp"],
        [8, 260, "ssp"], // 12.4 × 21.1 × 0.995 = 260.33
      ],
    );
    assert.equal(b50.b35[1]!.type, "SD");
    assert.equal(b50.b15[0]!.combo, "", "unknown combo flags are dropped");
    assert.equal(b50.b15[0]!.sync, "sync");
    assert.equal(b50.reportedRating, 999);
  });

  it("maps upstream 400 and 403 to friendly errors", async () => {
    respond(400, { message: "user not exists" });
    await assert.rejects(fetchB50({ username: "missing" }), (e) => e instanceof PlayerLookupError && e.status === 404);
    mock.restoreAll();
    respond(403, { message: "privacy" });
    await assert.rejects(fetchB50({ qq: "123456" }), (e) => e instanceof PlayerLookupError && e.status === 403);
  });
});

describe("fetchB50 network failures", () => {
  it("retries once after a dropped connection", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ message: "nope" }), { status: 400 });
    });
    await assert.rejects(fetchB50({ username: "retry-check" }), (e) => e instanceof PlayerLookupError && e.status === 404);
    assert.equal(calls, 2);
  });

  it("reports 502 when both attempts fail", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(fetchB50({ username: "down-check" }), (e) => e instanceof PlayerLookupError && e.status === 502);
  });
});

describe("parsePlayerQuery", () => {
  it("prefers qq and validates it", () => {
    assert.deepEqual(parsePlayerQuery({ qq: " 123456 ", username: "x" }), { qq: "123456" });
    assert.equal(parsePlayerQuery({ qq: "abc" }), null);
    assert.deepEqual(parsePlayerQuery({ username: " name " }), { username: "name" });
    assert.equal(parsePlayerQuery({}), null);
  });
});
