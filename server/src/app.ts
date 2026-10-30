import { getConnInfo } from "@hono/node-server/conninfo";
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
  checkRateLimit,
  createSession,
  deleteSession,
  login,
  recordFailure,
  register,
  SESSION_TTL_MS,
  userForSession,
  type User,
} from "./auth";
import { getCatalog, rebuildCatalog } from "./catalog";
import { config } from "./config";
import { addSong, createFolder, deleteFolder, FavoritesError, listFolders, removeSong, renameFolder } from "./favorites";
import { getJacket, parseJacketId } from "./jackets";
import { fetchLxnsScores, isPlausibleToken } from "./lxns";
import { fetchB50, parsePlayerQuery, PlayerLookupError } from "./players";
import { syncSources } from "./sources";

const SESSION_COOKIE = "sid";

type Env = { Variables: { user: User | null } };

export const app = new Hono<Env>().basePath("/api");

// ---- Cross-cutting ----

app.use(
  csrf({
    origin: (origin, c) => origin === new URL(c.req.url).origin || config.allowedOrigins.includes(origin),
  }),
);
app.use(bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "请求体过大" }, 413) }));
app.use(async (c, next) => {
  c.set("user", userForSession(getCookie(c, SESSION_COOKIE)));
  await next();
});

app.onError((err, c) => {
  if (
    err instanceof AuthError ||
    err instanceof FavoritesError ||
    err instanceof ArchiveError ||
    err instanceof PlayerLookupError
  ) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof HTTPException) return err.getResponse();
  console.error("[api]", c.req.method, c.req.path, err);
  return c.json({ error: "服务器内部错误" }, 500);
});

function requireUser(c: Context<Env>): User {
  const user = c.get("user");
  if (!user) throw new AuthError(401, "请先登录");
  return user;
}

async function jsonBody(c: Context<Env>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new HTTPException(400, { res: Response.json({ error: "请求体不是有效的 JSON" }, { status: 400 }) });
  }
}

function clientKey(c: Context<Env>): string {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

// ---- Public data ----

app.get("/health", (c) => c.json({ ok: true, catalog: getCatalog()?.catalog.builtAt ?? null }));

app.get("/jacket/:file", async (c) => {
  const id = parseJacketId(c.req.param("file"));
  if (id == null) return c.json({ error: "bad jacket id" }, 400);
  try {
    const png = await getJacket(id);
    if (!png) return c.body(null, 404);
    c.header("Content-Type", "image/png");
    c.header("Cache-Control", "public, max-age=2592000, immutable");
    return c.body(new Uint8Array(png));
  } catch {
    return c.body(null, 502);
  }
});

app.get("/catalog", (c) => {
  const cached = getCatalog();
  if (!cached) return c.json({ error: "catalog not ready, sync in progress" }, 503);
  c.header("ETag", cached.etag);
  c.header("Cache-Control", "no-cache");
  if (c.req.header("If-None-Match") === cached.etag) return c.body(null, 304);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.body(cached.body);
});

app.get("/player/b50", async (c) => {
  const query = parsePlayerQuery({ username: c.req.query("username"), qq: c.req.query("qq") });
  if (!query) return c.json({ error: "请提供水鱼用户名或 QQ 号" }, 400);
  return c.json(await fetchB50(query));
});

// POST so the personal token travels in a header, never in a URL that could end up in logs or history.
app.post("/lxns/scores", async (c) => {
  const token = c.req.header("X-User-Token")?.trim();
  if (!isPlausibleToken(token)) return c.json({ error: "请填写落雪个人密钥" }, 400);
  const cached = getCatalog();
  if (!cached) return c.json({ error: "曲库正在同步，请稍后再试" }, 503);
  return c.json(await fetchLxnsScores(token, cached.catalog));
});

app.get("/shared/:shareId", (c) => {
  const shared = getShared(c.req.param("shareId"));
  return shared ? c.json(shared) : c.json({ error: "分享链接无效或已被取消" }, 404);
});

// ---- Auth ----

function startSession(c: Context<Env>, user: User) {
  setCookie(c, SESSION_COOKIE, createSession(user.id), {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.secureCookies,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({ user });
}

app.get("/auth/me", (c) => c.json({ user: c.get("user") }));

app.post("/auth/register", async (c) => {
  const body = await jsonBody(c);
  const key = `register:${clientKey(c)}`;
  checkRateLimit(key);
  try {
    return startSession(c, await register(body.username, body.password, body.invite));
  } catch (err) {
    recordFailure(key);
    throw err;
  }
});

app.post("/auth/login", async (c) => {
  const body = await jsonBody(c);
  const keys = [`login-ip:${clientKey(c)}`, `login-user:${String(body.username ?? "").toLowerCase()}`];
  keys.forEach(checkRateLimit);
  try {
    return startSession(c, await login(body.username, body.password));
  } catch (err) {
    keys.forEach(recordFailure);
    throw err;
  }
});

app.post("/auth/logout", (c) => {
  deleteSession(getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---- Favorites ----

app.get("/favorites", (c) => c.json(listFolders(requireUser(c).id)));

app.post("/favorites", async (c) => c.json(createFolder(requireUser(c).id, (await jsonBody(c)).name), 201));

app.patch("/favorites/:folderId", async (c) => {
  renameFolder(requireUser(c).id, c.req.param("folderId"), (await jsonBody(c)).name);
  return c.json({ ok: true });
});

app.delete("/favorites/:folderId", (c) => {
  deleteFolder(requireUser(c).id, c.req.param("folderId"));
  return c.json({ ok: true });
});

app.put("/favorites/:folderId/songs/:songId", (c) => {
  addSong(requireUser(c).id, c.req.param("folderId"), Number(c.req.param("songId")));
  return c.json({ ok: true });
});

app.delete("/favorites/:folderId/songs/:songId", (c) => {
  removeSong(requireUser(c).id, c.req.param("folderId"), Number(c.req.param("songId")));
  return c.json({ ok: true });
});

// ---- Cloud B50 archives ----

app.get("/archives", (c) => c.json(listArchives(requireUser(c).id)));

app.post("/archives", async (c) => {
  const body = await jsonBody(c);
  return c.json(saveArchive(requireUser(c).id, body.title, body.b50), 201);
});

app.get("/archives/:id", (c) => c.json(getArchive(requireUser(c).id, c.req.param("id"))));

app.patch("/archives/:id", async (c) => {
  renameArchive(requireUser(c).id, c.req.param("id"), (await jsonBody(c)).title);
  return c.json({ ok: true });
});

app.delete("/archives/:id", (c) => {
  deleteArchive(requireUser(c).id, c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/archives/:id/share", (c) => c.json({ shareId: shareArchive(requireUser(c).id, c.req.param("id")) }));

app.delete("/archives/:id/share", (c) => {
  unshareArchive(requireUser(c).id, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- Admin ----

app.post("/admin/sync", async (c) => {
  if (!config.adminToken || c.req.header("Authorization") !== `Bearer ${config.adminToken}`) {
    return c.json({ error: "forbidden" }, 403);
  }
  const result = await syncSources(true);
  rebuildCatalog();
  return c.json({ result, builtAt: getCatalog()?.catalog.builtAt ?? null });
});
