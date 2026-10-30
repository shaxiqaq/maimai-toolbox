import { createApp, type Bindings } from "./app";
import { purgeExpired } from "./auth";
import { d1 } from "./db";

const app = createApp((env) => d1(env.DB));

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purgeExpired(d1(env.DB)));
  },
} satisfies ExportedHandler<Bindings>;
