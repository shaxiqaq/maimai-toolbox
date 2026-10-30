/**
 * Same-origin jacket proxy with a disk cache. Each jacket is fetched from LXNS once, with limited
 * concurrency (LXNS asks clients not to hammer its game assets), then served from disk.
 */
import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

const UPSTREAM = "https://assets2.lxns.net/maimai/jacket";
const MAX_CONCURRENT = 4;

const dir = join(config.dataDir, "jackets");
mkdirSync(dir, { recursive: true });

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const inflight = new Map<number, Promise<Buffer | null>>();

async function download(id: number, file: string): Promise<Buffer | null> {
  const res = await fetch(`${UPSTREAM}/${id}.png`, {
    headers: { "User-Agent": config.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`jacket ${id}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  // Write then rename so a crash never leaves a truncated file that would be served forever.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, file);
  return body;
}

/** PNG bytes for a jacket id, or null when upstream has none. */
export async function getJacket(id: number): Promise<Buffer | null> {
  const file = join(dir, `${id}.png`);
  try {
    return await readFile(file);
  } catch {
    // Not cached yet.
  }
  let pending = inflight.get(id);
  if (!pending) {
    pending = withSlot(() => download(id, file)).finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
}

export function parseJacketId(raw: string): number | null {
  const m = /^(\d{1,6})(?:\.png)?$/.exec(raw);
  return m ? Number(m[1]) : null;
}
