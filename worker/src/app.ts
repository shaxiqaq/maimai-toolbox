import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import {
  ArchiveError,
  deleteArchive,
  getArchive,
  getShared,
  listArchives,
  renameArchive,
  saveArchive,
  shareArchive,
  unshareArchive,
} from "./archives";
import {
  AuthError,
  changePassword,
  checkRateLimit,
  createSession,
  deleteAccount,
  deleteSession,
  login,
  recordAttempt,
  register,
  SESSION_TTL_MS,
  userForSession,
  type User,
} from "./auth";
import type { Db } from "./db";
import {
  acceptRequest,
  deleteSnapshot,
  dropRequest,
  FriendsError,
  overview,
  readSnapshot,
  removeFriend,
  requestFriend,
  saveSnapshot,
} from "./friends";
import {
  allFeedback,
  createAnnouncement,
  deleteAnnouncement,
  FeedbackError,
  listAnnouncements,
  myFeedback,
  sendFeedback,
  updateFeedback,
} from "./feedback";
import { addVote, myVotes, parseChart, parseTag, removeVote, tagCounts, TagError } from "./tags";
import { addSong, createFolder, deleteFolder, FavoritesError, listFolders, removeSong, renameFolder } from "./favorites";

export interface Bindings {
  DB: D1Database;
  /** "1" marks the session cookie Secure (default). */
  COOKIE_SECURE?: string;
  /** Extra origins allowed to make state-changing requests (comma-separated). */
  ALLOWED_ORIGINS?: string;
  /** "1" lets anyone register; otherwise sign-up needs an invite code. */
  OPEN_REGISTRATION?: string;
  /** Comma-separated usernames that can post announcements and read feedback. */
  ADMIN_USERNAMES?: string;
}

type Env = { Bindings: Bindings; Variables: { db: Db; user: User | null } };
type C = Context<Env>;

const SESSION_COOKIE = "sid";

/** Build the API. `dbFor` turns the environment into a database (D1 in production, node:sqlite in tests). */
export function createApp(dbFor: (env: Bindings) => Db) {
  const app = new Hono<Env>().basePath("/api");

  // ---- Cross-cutting ----

  app.use(
    csrf({
      origin: (origin, c) =>
        origin === new URL(c.req.url).origin ||
        (c.env?.ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((s: string) => s.trim())
          .includes(origin),
    }),
  );
  app.use(bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "请求体过大" }, 413) }));
  app.use(async (c, next) => {
    const db = dbFor(c.env);
    c.set("db", db);
    c.set("user", await userForSession(db, getCookie(c, SESSION_COOKIE)));
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AuthError || err instanceof FavoritesError || err instanceof ArchiveError || err instanceof FriendsError || err instanceof TagError || err instanceof FeedbackError) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof HTTPException) return err.getResponse();
    console.error("[api]", c.req.method, c.req.path, err);
    return c.json({ error: "服务器内部错误" }, 500);
  });

  const db = (c: C) => c.get("db");

  function requireUser(c: C): User {
    const user = c.get("user");
    if (!user) throw new AuthError(401, "请先登录");
    return user;
  }

  async function jsonBody(c: C): Promise<Record<string, unknown>> {
    try {
      const body = await c.req.json();
      return body && typeof body === "object" ? body : {};
    } catch {
      throw new HTTPException(400, { res: Response.json({ error: "请求体不是有效的 JSON" }, { status: 400 }) });
    }
  }

  /** Cloudflare puts the client address in this header; tests and local runs fall back to a constant. */
  const clientKey = (c: C) => c.req.header("cf-connecting-ip") ?? "local";

  // ---- Public ----

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/shared/:shareId", async (c) => {
    const shared = await getShared(db(c), c.req.param("shareId"));
    return shared ? c.json(shared) : c.json({ error: "分享链接无效或已被取消" }, 404);
  });

  // ---- Auth ----

  async function startSession(c: C, user: User) {
    setCookie(c, SESSION_COOKIE, await createSession(db(c), user.id), {
      httpOnly: true,
      sameSite: "Lax",
      secure: (c.env?.COOKIE_SECURE ?? "1") === "1",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return c.json({ user });
  }

  const inviteRequired = (c: C) => c.env?.OPEN_REGISTRATION !== "1";
  const isAdmin = (c: C, user: User | null) =>
    !!user &&
    (c.env?.ADMIN_USERNAMES ?? "")
      .split(",")
      .map((s: string) => s.trim().toLowerCase())
      .includes(user.username.toLowerCase());

  function requireAdmin(c: C): User {
    const user = requireUser(c);
    if (!isAdmin(c, user)) throw new FeedbackError(403, "需要管理员权限");
    return user;
  }

  app.get("/auth/me", (c) =>
    c.json({ user: c.get("user"), inviteRequired: inviteRequired(c), isAdmin: isAdmin(c, c.get("user")) }),
  );

  app.post("/auth/register", async (c) => {
    const body = await jsonBody(c);
    const key = `register:${clientKey(c)}`;
    await checkRateLimit(db(c), key);
    // Every attempt counts, successful ones too, so open sign-up cannot be used to mass-create accounts.
    await recordAttempt(db(c), key);
    return startSession(c, await register(db(c), body.username, body.password, body.invite, { inviteRequired: inviteRequired(c) }));
  });

  app.post("/auth/login", async (c) => {
    const body = await jsonBody(c);
    const keys = [`login-ip:${clientKey(c)}`, `login-user:${String(body.username ?? "").toLowerCase()}`];
    for (const k of keys) await checkRateLimit(db(c), k);
    try {
      return await startSession(c, await login(db(c), body.username, body.password));
    } catch (err) {
      for (const k of keys) await recordAttempt(db(c), k);
      throw err;
    }
  });

  /** Wrong current passwords count like failed logins, so these cannot be used to guess a password. */
  async function withPasswordCheck<T>(c: C, userId: number, run: () => Promise<T>): Promise<T> {
    const key = `password:${userId}`;
    await checkRateLimit(db(c), key);
    try {
      return await run();
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) await recordAttempt(db(c), key);
      throw err;
    }
  }

  app.post("/auth/password", async (c) => {
    const user = requireUser(c);
    const body = await jsonBody(c);
    await withPasswordCheck(c, user.id, () => changePassword(db(c), user.id, body.current, body.next, getCookie(c, SESSION_COOKIE)));
    return c.json({ ok: true });
  });

  app.post("/auth/delete", async (c) => {
    const user = requireUser(c);
    const body = await jsonBody(c);
    await withPasswordCheck(c, user.id, () => deleteAccount(db(c), user.id, body.password));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/auth/logout", async (c) => {
    await deleteSession(db(c), getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // ---- Favorites ----

  app.get("/favorites", async (c) => c.json(await listFolders(db(c), requireUser(c).id)));

  app.post("/favorites", async (c) => c.json(await createFolder(db(c), requireUser(c).id, (await jsonBody(c)).name), 201));

  app.patch("/favorites/:folderId", async (c) => {
    await renameFolder(db(c), requireUser(c).id, c.req.param("folderId"), (await jsonBody(c)).name);
    return c.json({ ok: true });
  });

  app.delete("/favorites/:folderId", async (c) => {
    await deleteFolder(db(c), requireUser(c).id, c.req.param("folderId"));
    return c.json({ ok: true });
  });

  app.put("/favorites/:folderId/songs/:songId", async (c) => {
    await addSong(db(c), requireUser(c).id, c.req.param("folderId"), Number(c.req.param("songId")));
    return c.json({ ok: true });
  });

  app.delete("/favorites/:folderId/songs/:songId", async (c) => {
    await removeSong(db(c), requireUser(c).id, c.req.param("folderId"), Number(c.req.param("songId")));
    return c.json({ ok: true });
  });

  // ---- Announcements and feedback ----

  const idParam = (c: C) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new FeedbackError(400, "ID 无效");
    return id;
  };

  app.get("/announcements", async (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(await listAnnouncements(db(c)));
  });

  app.post("/admin/announcements", async (c) => {
    requireAdmin(c);
    return c.json(await createAnnouncement(db(c), await jsonBody(c)), 201);
  });

  app.delete("/admin/announcements/:id", async (c) => {
    requireAdmin(c);
    await deleteAnnouncement(db(c), idParam(c));
    return c.json({ ok: true });
  });

  app.post("/feedback", async (c) => {
    const body = await jsonBody(c);
    // Open to everyone (including people who cannot sign in), so every submission counts toward a per-IP limit.
    const key = `feedback:${clientKey(c)}`;
    await checkRateLimit(db(c), key);
    await recordAttempt(db(c), key);
    await sendFeedback(db(c), c.get("user")?.id ?? null, body);
    return c.json({ ok: true }, 201);
  });

  app.get("/feedback/mine", async (c) => c.json(await myFeedback(db(c), requireUser(c).id)));

  app.get("/admin/feedback", async (c) => {
    requireAdmin(c);
    return c.json(await allFeedback(db(c), c.req.query("status")));
  });

  app.patch("/admin/feedback/:id", async (c) => {
    requireAdmin(c);
    await updateFeedback(db(c), idParam(c), await jsonBody(c));
    return c.json({ ok: true });
  });

  // ---- Chart tags ----

  app.get("/tags", async (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(await tagCounts(db(c)));
  });

  app.get("/tags/mine/:songId", async (c) => {
    const { songId } = parseChart(c.req.param("songId"), "0");
    return c.json(await myVotes(db(c), requireUser(c).id, songId));
  });

  app.put("/tags/:songId/:difficulty/:tag", async (c) => {
    const user = requireUser(c);
    await addVote(db(c), user.id, parseChart(c.req.param("songId"), c.req.param("difficulty")), parseTag(c.req.param("tag")));
    return c.json({ ok: true });
  });

  app.delete("/tags/:songId/:difficulty/:tag", async (c) => {
    const user = requireUser(c);
    await removeVote(db(c), user.id, parseChart(c.req.param("songId"), c.req.param("difficulty")), parseTag(c.req.param("tag")));
    return c.json({ ok: true });
  });

  // ---- Friends and score snapshots ----

  const userIdParam = (c: C) => {
    const id = Number(c.req.param("userId"));
    if (!Number.isInteger(id) || id <= 0) throw new FriendsError(400, "用户 ID 无效");
    return id;
  };

  app.get("/friends", async (c) => c.json(await overview(db(c), requireUser(c).id)));

  app.post("/friends/requests", async (c) => {
    const user = requireUser(c);
    const body = await jsonBody(c);
    // Every attempt counts, so the endpoint cannot be used to probe which usernames exist.
    const key = `friend-request:${user.id}`;
    await checkRateLimit(db(c), key);
    await recordAttempt(db(c), key);
    return c.json({ status: await requestFriend(db(c), user.id, body.username) });
  });

  app.post("/friends/requests/:userId/accept", async (c) => {
    await acceptRequest(db(c), requireUser(c).id, userIdParam(c));
    return c.json({ ok: true });
  });

  app.delete("/friends/requests/:userId", async (c) => {
    await dropRequest(db(c), requireUser(c).id, userIdParam(c));
    return c.json({ ok: true });
  });

  app.delete("/friends/:userId", async (c) => {
    await removeFriend(db(c), requireUser(c).id, userIdParam(c));
    return c.json({ ok: true });
  });

  /** The snapshot is stored as JSON already; splice it in rather than parsing it on the Worker. */
  app.get("/friends/:userId/snapshot", async (c) => {
    const { data, updatedAt } = await readSnapshot(db(c), requireUser(c).id, userIdParam(c));
    return c.body(`{"updatedAt":${updatedAt},"snapshot":${data}}`, 200, { "Content-Type": "application/json; charset=utf-8" });
  });

  app.put("/snapshot", async (c) => c.json(await saveSnapshot(db(c), requireUser(c).id, await jsonBody(c))));

  app.get("/snapshot", async (c) => {
    const user = requireUser(c);
    const { data, updatedAt } = await readSnapshot(db(c), user.id, user.id);
    return c.body(`{"updatedAt":${updatedAt},"snapshot":${data}}`, 200, { "Content-Type": "application/json; charset=utf-8" });
  });

  app.delete("/snapshot", async (c) => {
    await deleteSnapshot(db(c), requireUser(c).id);
    return c.json({ ok: true });
  });

  // ---- Cloud B50 archives ----

  app.get("/archives", async (c) => c.json(await listArchives(db(c), requireUser(c).id)));

  app.post("/archives", async (c) => {
    const body = await jsonBody(c);
    return c.json(await saveArchive(db(c), requireUser(c).id, body.title, body.b50), 201);
  });

  app.get("/archives/:id", async (c) => c.json(await getArchive(db(c), requireUser(c).id, c.req.param("id"))));

  app.patch("/archives/:id", async (c) => {
    await renameArchive(db(c), requireUser(c).id, c.req.param("id"), (await jsonBody(c)).title);
    return c.json({ ok: true });
  });

  app.delete("/archives/:id", async (c) => {
    await deleteArchive(db(c), requireUser(c).id, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/archives/:id/share", async (c) => c.json({ shareId: await shareArchive(db(c), requireUser(c).id, c.req.param("id")) }));

  app.delete("/archives/:id/share", async (c) => {
    await unshareArchive(db(c), requireUser(c).id, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
