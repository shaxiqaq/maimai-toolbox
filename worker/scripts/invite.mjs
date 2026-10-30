// Create invite codes in D1. Usage: pnpm invite [count] [--local]
// Uses wrangler (and your `wrangler login`) to run the INSERT; codes are printed once, so copy them.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const local = args.includes("--local");
const count = Math.min(Math.max(Number(args.find((a) => /^\d+$/.test(a)) ?? 1), 1), 50);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // matches the Worker's generator
const codes = Array.from({ length: count }, () => [...randomBytes(10)].map((b) => ALPHABET[b % 32]).join(""));
const now = Date.now();
const sql = `INSERT INTO invites (code, created_at) VALUES ${codes.map((c) => `('${c}', ${now})`).join(", ")};`;

// Run wrangler's own entry point with Node (no shell), so the SQL is passed as one argument on every OS.
const wrangler = join(dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");
const res = spawnSync(
  process.execPath,
  [wrangler, "d1", "execute", "maimai-toolbox", local ? "--local" : "--remote", "--command", sql],
  { stdio: ["inherit", "pipe", "inherit"] },
);
if (res.status !== 0) {
  console.error("Failed to insert invite codes.");
  process.exit(res.status ?? 1);
}
console.log(`\n${count} invite code(s) (${local ? "local" : "remote"} database):`);
for (const c of codes) console.log(c);
