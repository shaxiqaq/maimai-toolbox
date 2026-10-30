import { Hono } from "hono";
import { getCatalog, rebuildCatalog } from "./catalog";
import { config } from "./config";
import { getJacket, parseJacketId } from "./jackets";
import { fetchLxnsScores, isPlausibleToken } from "./lxns";
import { fetchB50, parsePlayerQuery, PlayerLookupError } from "./players";
import { syncSources } from "./sources";

export const app = new Hono().basePath("/api");

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
  try {
    return c.json(await fetchB50(query));
  } catch (err) {
    if (err instanceof PlayerLookupError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

// POST so the personal token travels in a header, never in a URL that could end up in logs or history.
app.post("/lxns/scores", async (c) => {
  const token = c.req.header("X-User-Token")?.trim();
  if (!isPlausibleToken(token)) return c.json({ error: "请填写落雪个人密钥" }, 400);
  const cached = getCatalog();
  if (!cached) return c.json({ error: "曲库正在同步，请稍后再试" }, 503);
  try {
    return c.json(await fetchLxnsScores(token, cached.catalog));
  } catch (err) {
    if (err instanceof PlayerLookupError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

app.post("/admin/sync", async (c) => {
  if (!config.adminToken || c.req.header("Authorization") !== `Bearer ${config.adminToken}`) {
    return c.json({ error: "forbidden" }, 403);
  }
  const result = await syncSources(true);
  rebuildCatalog();
  return c.json({ result, builtAt: getCatalog()?.catalog.builtAt ?? null });
});
