import { serve } from "@hono/node-server";
import { app } from "./app";
import { rebuildCatalog } from "./catalog";
import { config } from "./config";
import { syncSources } from "./sources";

async function syncAndRebuild(): Promise<void> {
  const result = await syncSources();
  const built = rebuildCatalog();
  console.log("[sync]", result, built ? "catalog rebuilt" : "catalog unavailable (missing sources)");
}

// Serve whatever is cached right away, then refresh in the background.
rebuildCatalog();
void syncAndRebuild();
setInterval(() => void syncAndRebuild(), config.syncIntervalMs).unref();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] http://localhost:${info.port}/api`);
});
