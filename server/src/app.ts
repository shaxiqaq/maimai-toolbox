import { Hono } from "hono";
import { getCatalog, rebuildCatalog } from "./catalog";
import { config } from "./config";
import { syncSources } from "./sources";

export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, catalog: getCatalog()?.catalog.builtAt ?? null }));

app.get("/catalog", (c) => {
  const cached = getCatalog();
  if (!cached) return c.json({ error: "catalog not ready, sync in progress" }, 503);
  c.header("ETag", cached.etag);
  c.header("Cache-Control", "no-cache");
  if (c.req.header("If-None-Match") === cached.etag) return c.body(null, 304);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.body(cached.body);
});

app.post("/admin/sync", async (c) => {
  if (!config.adminToken || c.req.header("Authorization") !== `Bearer ${config.adminToken}`) {
    return c.json({ error: "forbidden" }, 403);
  }
  const result = await syncSources(true);
  rebuildCatalog();
  return c.json({ result, builtAt: getCatalog()?.catalog.builtAt ?? null });
});
