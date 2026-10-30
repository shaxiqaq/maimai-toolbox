/** End-to-end API tests against a throwaway database. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "mt-app-"));
const { app } = await import("./app");
const { createInvites, hashPassword, verifyPassword } = await import("./auth");

const ORIGIN = "http://localhost";

/** Minimal cookie-carrying client. */
function client() {
  let cookie = "";
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(`${ORIGIN}/api${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!.includes("=;") || /Max-Age=0/i.test(set) ? "" : set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: set };
  };
}

const record = (songId: number, rating: number) => ({
  songId,
  title: `s${songId}`,
  type: "SD",
  difficulty: 3,
  level: "13",
  ds: 13,
  achievement: 100,
  dxScore: 0,
  combo: "",
  sync: "",
  rank: "sss",
  rating,
});

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("correct horse", a), true);
    assert.equal(await verifyPassword("wrong horse", a), false);
  });
});

describe("auth", () => {
  it("registers with a one-time invite, sets an HttpOnly cookie, and logs in/out", async () => {
    const api = client();
    const [code] = createInvites(1);

    assert.equal((await api("POST", "/auth/register", { username: "alice", password: "short", invite: code })).status, 400);
    assert.equal((await api("POST", "/auth/register", { username: "alice", password: "password123", invite: "NOPE" })).status, 400);

    const reg = await api("POST", "/auth/register", { username: "alice", password: "password123", invite: code!.toLowerCase() });
    assert.equal(reg.status, 200);
    assert.match(reg.setCookie!, /HttpOnly/i);
    assert.match(reg.setCookie!, /SameSite=Lax/i);
    assert.equal((await api("GET", "/auth/me")).body.user.username, "alice");

    const reuse = await client()("POST", "/auth/register", { username: "bob", password: "password123", invite: code });
    assert.equal(reuse.status, 400, "invite cannot be reused");

    await api("POST", "/auth/logout");
    assert.equal((await api("GET", "/auth/me")).body.user, null);

    assert.equal((await api("POST", "/auth/login", { username: "ALICE", password: "nope-nope" })).status, 401);
    assert.equal((await api("POST", "/auth/login", { username: "ALICE", password: "password123" })).status, 200);
    assert.equal((await api("GET", "/auth/me")).body.user.username, "alice");
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    const [code] = createInvites(1);
    const res = await client()("POST", "/auth/register", { username: "Alice", password: "password123", invite: code });
    assert.equal(res.status, 409);
  });

  it("blocks cross-site form posts", async () => {
    const res = await app.request(`${ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });
    assert.equal(res.status, 403);
  });

  it("rate-limits repeated failed logins", async () => {
    const api = client();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api("POST", "/auth/login", { username: "ratelimited", password: "x".repeat(8) })).status;
    assert.equal(last, 429);
  });
});

async function signedIn(name: string) {
  const api = client();
  const [code] = createInvites(1);
  assert.equal((await api("POST", "/auth/register", { username: name, password: "password123", invite: code })).status, 200);
  return api;
}

describe("favorites", () => {
  it("requires login", async () => {
    assert.equal((await client()("GET", "/favorites")).status, 401);
  });

  it("creates folders, adds/removes songs idempotently, and isolates users", async () => {
    const api = await signedIn("fav1");
    const other = await signedIn("fav2");

    const folder = (await api("POST", "/favorites", { name: "  练习  " })).body;
    assert.equal(folder.name, "练习");
    await api("PUT", `/favorites/${folder.id}/songs/834`);
    await api("PUT", `/favorites/${folder.id}/songs/834`);
    await api("PUT", `/favorites/${folder.id}/songs/11663`);
    assert.deepEqual((await api("GET", "/favorites")).body[0].songIds.sort(), [11663, 834].sort());

    assert.equal((await other("PUT", `/favorites/${folder.id}/songs/1`)).status, 404, "cannot touch someone else's folder");
    assert.deepEqual((await other("GET", "/favorites")).body, []);

    await api("DELETE", `/favorites/${folder.id}/songs/834`);
    await api("PATCH", `/favorites/${folder.id}`, { name: "Master 练习" });
    const [after] = (await api("GET", "/favorites")).body;
    assert.equal(after.name, "Master 练习");
    assert.deepEqual(after.songIds, [11663]);

    assert.equal((await api("POST", "/favorites", { name: "" })).status, 400);
    await api("DELETE", `/favorites/${folder.id}`);
    assert.deepEqual((await api("GET", "/favorites")).body, []);
  });
});

describe("archives", () => {
  const b50 = {
    source: "lxns",
    username: "123",
    nickname: "Alice",
    plate: "",
    reportedRating: 0,
    b35: [record(1, 300), record(2, 290)],
    b15: [record(10001, 310)],
    fetchedAt: "2026-10-30T00:00:00.000Z",
    extra: "<script>should not be stored</script>",
  };

  it("saves a sanitized snapshot with server-computed rating", async () => {
    const api = await signedIn("arc1");
    const saved = (await api("POST", "/archives", { title: "", b50 })).body;
    assert.equal(saved.rating, 900);
    assert.equal(saved.title, "Alice · 900");

    const full = (await api("GET", `/archives/${saved.id}`)).body;
    assert.equal(full.b50.extra, undefined);
    assert.equal(full.b50.b35.length, 2);

    assert.equal((await api("POST", "/archives", { b50: { b35: "nope" } })).status, 400);
  });

  it("shares through a revocable public link and stays private to its owner", async () => {
    const api = await signedIn("arc2");
    const other = await signedIn("arc3");
    const saved = (await api("POST", "/archives", { title: "我的 B50", b50 })).body;

    assert.equal((await other("GET", `/archives/${saved.id}`)).status, 404);

    const { shareId } = (await api("POST", `/archives/${saved.id}/share`)).body;
    assert.match(shareId, /^[A-Za-z0-9_-]{22}$/);
    assert.equal((await api("POST", `/archives/${saved.id}/share`)).body.shareId, shareId, "sharing twice reuses the link");

    const pub = await client()("GET", `/shared/${shareId}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.title, "我的 B50");

    await api("DELETE", `/archives/${saved.id}/share`);
    assert.equal((await client()("GET", `/shared/${shareId}`)).status, 404);

    await api("PATCH", `/archives/${saved.id}`, { title: "改名了" });
    assert.equal((await api("GET", "/archives")).body[0].title, "改名了");
    await api("DELETE", `/archives/${saved.id}`);
    assert.deepEqual((await api("GET", "/archives")).body, []);
  });
});
