import { resolve } from "node:path";

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  dataDir: resolve(env.DATA_DIR ?? resolve(import.meta.dirname, "../../data")),
  /** Re-sync sources older than this. */
  syncIntervalMs: Number(env.SYNC_INTERVAL_HOURS ?? 6) * 3600_000,
  /** Required for POST /api/admin/sync. Leave unset to disable the endpoint. */
  adminToken: env.ADMIN_TOKEN ?? "",
  /** Mark the session cookie Secure. Turn on whenever the site is served over HTTPS. */
  secureCookies: env.COOKIE_SECURE === "1",
  /** Extra origins allowed to make state-changing requests (comma-separated), e.g. a separate frontend host. */
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  userAgent: "maimai-toolbox (personal, non-commercial)",
};
