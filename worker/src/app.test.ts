/** End-to-end API tests against an in-memory database with the real migrations applied. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "./app";
import { generateInviteCode, hashPassword, verifyPassword } from "./auth";
import { memoryDb } from "./testing";

const testDb = memoryDb();
const app = createApp(() => testDb);
const ENV = { COOKIE_SECURE: "1", ALLOWED_ORIGINS: "" };
const OPEN_ENV = { ...ENV, OPEN_REGISTRATION: "1" };

async function createInvites(n: number): Promise<string[]> {
  const codes = Array.from({ length: n }, generateInviteCode);
  for (const code of codes) await testDb.run("INSERT INTO invites (code, created_at) VALUES (?, ?)", code, Date.now());
  return codes;
}

const ORIGIN = "http://localhost";

let nextIp = 0;

/** Minimal cookie-carrying client, each with its own client IP so rate limits do not leak between tests. */
function client(env: Record<string, string> = ENV) {
  let cookie = "";
  const ip = `10.0.0.${++nextIp}`;
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(`${ORIGIN}/api${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        "CF-Connecting-IP": ip,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, env);
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
  it("hashes with PBKDF2 and a random salt, and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    assert.notEqual(a, b);
    assert.match(a, /^pbkdf2-sha256\$20000\$/);
    assert.equal(await verifyPassword("correct horse", a), true);
    assert.equal(await verifyPassword("wrong horse", a), false);
  });
});

describe("auth", () => {
  it("registers with a one-time invite, sets an HttpOnly cookie, and logs in/out", async () => {
    const api = client();
    const [code] = await createInvites(1);

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

  it("registers without an invite when registration is open, and reports it", async () => {
    const api = client(OPEN_ENV);
    assert.equal((await api("GET", "/auth/me")).body.inviteRequired, false);
    assert.equal((await client()("GET", "/auth/me")).body.inviteRequired, true);
    const reg = await api("POST", "/auth/register", { username: "carol", password: "password123" });
    assert.equal(reg.status, 200);
    assert.equal((await api("GET", "/auth/me")).body.user.username, "carol");
    assert.equal((await client()("POST", "/auth/register", { username: "dave", password: "password123" })).status, 400);
  });

  it("limits sign-ups per client even when they succeed", async () => {
    const api = client(OPEN_ENV);
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await api("POST", "/auth/register", { username: `bulk${i}`, password: "password123" })).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    const [code] = await createInvites(1);
    const res = await client()("POST", "/auth/register", { username: "Alice", password: "password123", invite: code });
    assert.equal(res.status, 409);
  });

  it("blocks cross-site form posts", async () => {
    const res = await app.request(
      `${ORIGIN}/api/auth/logout`,
      { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" }, body: "" },
      ENV,
    );
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
  const [code] = await createInvites(1);
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

describe("friends", () => {
  const snapshot = {
    source: "lxns",
    nickname: "Bea",
    full: true,
    rating: 15000,
    records: [[834, 3, 100.5, 2000, "ap", "fsd"]],
    fetchedAt: "2026-10-30T00:00:00.000Z",
  };
  const idOf = async (api: Awaited<ReturnType<typeof signedIn>>) => (await api("GET", "/auth/me")).body.user.id as number;

  it("sends, accepts and removes friend requests", async () => {
    const a = await signedIn("fr-a");
    const b = await signedIn("fr-b");
    const aId = await idOf(a);
    const bId = await idOf(b);

    assert.equal((await a("POST", "/friends/requests", { username: "nobody-here" })).status, 404);
    assert.equal((await a("POST", "/friends/requests", { username: "FR-A" })).status, 400, "not yourself");
    assert.equal((await a("POST", "/friends/requests", { username: "FR-B" })).body.status, "requested");
    assert.deepEqual((await b("GET", "/friends")).body.incoming.map((r: { id: number }) => r.id), [aId]);
    assert.deepEqual((await a("GET", "/friends")).body.outgoing.map((r: { id: number }) => r.id), [bId]);

    assert.equal((await b("POST", `/friends/requests/${aId}/accept`)).status, 200);
    const view = (await a("GET", "/friends")).body;
    assert.deepEqual(view.friends.map((f: { username: string }) => f.username), ["fr-b"]);
    assert.deepEqual([view.incoming, view.outgoing], [[], []]);
    assert.equal((await a("POST", "/friends/requests", { username: "fr-b" })).status, 409);

    await b("DELETE", `/friends/${aId}`);
    assert.deepEqual((await a("GET", "/friends")).body.friends, []);
  });

  it("accepts automatically when both sides ask, and lets requests be declined", async () => {
    const a = await signedIn("fr-c");
    const b = await signedIn("fr-d");
    await a("POST", "/friends/requests", { username: "fr-d" });
    assert.equal((await b("POST", "/friends/requests", { username: "fr-c" })).body.status, "accepted");
    assert.equal((await a("GET", "/friends")).body.friends.length, 1);

    const c = await signedIn("fr-e");
    await c("POST", "/friends/requests", { username: "fr-c" });
    await a("DELETE", `/friends/requests/${await idOf(c)}`);
    assert.deepEqual((await c("GET", "/friends")).body.outgoing, []);
  });

  it("shares a sanitized score snapshot with friends only", async () => {
    const a = await signedIn("fr-f");
    const b = await signedIn("fr-g");
    const stranger = await signedIn("fr-h");
    const aId = await idOf(a);

    assert.equal((await a("PUT", "/snapshot", { ...snapshot, records: [[834, 3, 100.5, 2000, "bogus", ""]] })).status, 400);
    const info = (await a("PUT", "/snapshot", { ...snapshot, extra: "<x>" })).body;
    assert.deepEqual([info.recordCount, info.rating, info.full], [1, 15000, true]);
    assert.equal((await a("GET", "/friends")).body.snapshot.recordCount, 1);

    assert.equal((await stranger("GET", `/friends/${aId}/snapshot`)).status, 403);
    await a("POST", "/friends/requests", { username: "fr-g" });
    await b("POST", `/friends/requests/${aId}/accept`);
    const got = await b("GET", `/friends/${aId}/snapshot`);
    assert.equal(got.status, 200);
    assert.deepEqual(got.body.snapshot.records, snapshot.records);
    assert.equal(got.body.snapshot.extra, undefined);
    assert.equal((await b("GET", "/friends")).body.friends[0].snapshot.nickname, "Bea");

    await a("DELETE", "/snapshot");
    assert.equal((await b("GET", `/friends/${aId}/snapshot`)).status, 404);
  });

  it("requires login", async () => {
    assert.equal((await client()("GET", "/friends")).status, 401);
    assert.equal((await client()("PUT", "/snapshot", snapshot)).status, 401);
  });
});

describe("chart tags", () => {
  it("counts votes per chart, one per user and tag, and lets users take them back", async () => {
    const a = await signedIn("tag-a");
    const b = await signedIn("tag-b");
    assert.equal((await client()("PUT", "/tags/834/3/spin")).status, 401);

    await a("PUT", "/tags/834/3/spin");
    await a("PUT", "/tags/834/3/spin"); // idempotent
    await a("PUT", "/tags/834/3/stream");
    await b("PUT", "/tags/834/3/spin");
    await b("PUT", "/tags/834/4/burst");

    const counts = (await client()("GET", "/tags")).body;
    assert.deepEqual(counts["834:3"], { spin: 2, stream: 1 });
    assert.deepEqual(counts["834:4"], { burst: 1 });
    assert.deepEqual((await a("GET", "/tags/mine/834")).body, { 3: ["spin", "stream"] });

    await a("DELETE", "/tags/834/3/spin");
    assert.deepEqual((await client()("GET", "/tags")).body["834:3"], { spin: 1, stream: 1 });
  });

  it("rejects unknown tags and bad chart ids", async () => {
    const a = await signedIn("tag-c");
    assert.equal((await a("PUT", "/tags/834/3/not-a-tag")).status, 400);
    assert.equal((await a("PUT", "/tags/834/9/spin")).status, 400);
    assert.equal((await a("PUT", "/tags/abc/3/spin")).status, 400);
  });
});

describe("account management", () => {
  it("changes the password and signs out other devices only", async () => {
    const a = await signedIn("acct-a");
    const other = client();
    assert.equal((await other("POST", "/auth/login", { username: "acct-a", password: "password123" })).status, 200);

    assert.equal((await a("POST", "/auth/password", { current: "wrong-pass", next: "newpassword1" })).status, 401);
    assert.equal((await a("POST", "/auth/password", { current: "password123", next: "short" })).status, 400);
    assert.equal((await a("POST", "/auth/password", { current: "password123", next: "newpassword1" })).status, 200);

    assert.equal((await a("GET", "/auth/me")).body.user.username, "acct-a", "this device stays signed in");
    assert.equal((await other("GET", "/auth/me")).body.user, null, "other devices are signed out");
    assert.equal((await client()("POST", "/auth/login", { username: "acct-a", password: "password123" })).status, 401);
    assert.equal((await client()("POST", "/auth/login", { username: "acct-a", password: "newpassword1" })).status, 200);
  });

  it("deletes the account with everything attached to it", async () => {
    const a = await signedIn("acct-b");
    const friend = await signedIn("acct-c");
    const aId = (await a("GET", "/auth/me")).body.user.id;
    const folder = (await a("POST", "/favorites", { name: "x" })).body;
    await a("PUT", `/favorites/${folder.id}/songs/834`);
    await a("PUT", "/tags/99001/3/spin");
    await a("PUT", "/snapshot", { source: "lxns", nickname: "n", full: true, rating: 1, records: [[834, 3, 100, 0, "", ""]], fetchedAt: "t" });
    await a("POST", "/friends/requests", { username: "acct-c" });
    await friend("POST", `/friends/requests/${aId}/accept`);

    assert.equal((await a("POST", "/auth/delete", { password: "nope-nope" })).status, 401);
    assert.equal((await a("POST", "/auth/delete", { password: "password123" })).status, 200);

    assert.equal((await a("GET", "/auth/me")).body.user, null);
    assert.equal((await client()("POST", "/auth/login", { username: "acct-b", password: "password123" })).status, 401);
    assert.deepEqual((await friend("GET", "/friends")).body.friends, []);
    assert.equal((await client()("GET", "/tags")).body["99001:3"], undefined);
    for (const table of ["fav_folders", "fav_songs", "score_snapshots", "chart_tag_votes", "friendships", "sessions"]) {
      const where = table === "fav_songs" ? `folder_id = '${folder.id}'` : table === "friendships" ? `user_id = ${aId} OR friend_id = ${aId}` : `user_id = ${aId}`;
      assert.equal((await testDb.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`))!.n, 0, table);
    }
  });

  it("rate-limits wrong current passwords", async () => {
    const a = await signedIn("acct-d");
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await a("POST", "/auth/password", { current: "wrong-pass", next: "newpassword1" })).status;
    assert.equal(last, 429);
  });
});

describe("announcements and feedback", () => {
  const ADMIN_ENV = { ...ENV, ADMIN_USERNAMES: "Boss, other" };
  async function as(name: string) {
    const api = client(ADMIN_ENV);
    const [code] = await createInvites(1);
    assert.equal((await api("POST", "/auth/register", { username: name, password: "password123", invite: code })).status, 200);
    return api;
  }

  it("lets admins post and delete announcements that everyone can read", async () => {
    const admin = await as("boss");
    const user = await as("plain-user");
    assert.equal((await admin("GET", "/auth/me")).body.isAdmin, true, "admin names are case-insensitive");
    assert.equal((await user("GET", "/auth/me")).body.isAdmin, false);

    assert.equal((await user("POST", "/admin/announcements", { title: "x", body: "y" })).status, 403);
    assert.equal((await admin("POST", "/admin/announcements", { title: "", body: "y" })).status, 400);
    const posted = (await admin("POST", "/admin/announcements", { title: "维护", body: "今晚维护" })).body;
    assert.equal(posted.title, "维护");
    assert.equal((await client()("GET", "/announcements")).body[0].body, "今晚维护");

    await admin("DELETE", `/admin/announcements/${posted.id}`);
    assert.deepEqual((await client()("GET", "/announcements")).body, []);
  });

  it("accepts feedback from anyone and lets admins reply", async () => {
    const admin = await as("other");
    const user = await as("fb-user");
    const anon = client(ADMIN_ENV);

    assert.equal((await user("POST", "/feedback", { body: "  " })).status, 400);
    assert.equal((await user("POST", "/feedback", { body: "B50 页打不开", page: "/b50" })).status, 201);
    assert.equal((await anon("POST", "/feedback", { body: "注册不了", contact: "qq 123" })).status, 201);
    assert.equal((await anon("GET", "/feedback/mine")).status, 401);
    assert.equal((await user("GET", "/admin/feedback")).status, 403);

    const inbox = (await admin("GET", "/admin/feedback")).body as { id: number; username: string | null; body: string }[];
    const mine = inbox.find((f) => f.body === "B50 页打不开")!;
    assert.equal(mine.username, "fb-user");
    assert.equal(inbox.find((f) => f.body === "注册不了")!.username, null);

    await admin("PATCH", `/admin/feedback/${mine.id}`, { status: "done", reply: "已修复" });
    const [seen] = (await user("GET", "/feedback/mine")).body;
    assert.deepEqual([seen.status, seen.reply], ["done", "已修复"]);
    assert.equal(((await admin("GET", "/admin/feedback")).body as { id: number }[]).some((f) => f.id === mine.id), false, "done items leave the open list");
    assert.equal(((await admin("GET", "/admin/feedback?status=all")).body as { id: number }[]).some((f) => f.id === mine.id), true);
  });

  it("rate-limits feedback per client", async () => {
    const anon = client();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await anon("POST", "/feedback", { body: `spam ${i}` })).status;
    assert.equal(last, 429);
  });
});
