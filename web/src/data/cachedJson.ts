/**
 * Fetch JSON with a Cache Storage copy: fresh copies are used directly, stale ones are returned at once
 * while a new copy is fetched in the background. Falls back to plain fetch when Cache Storage is unavailable.
 */
const CACHE_NAME = "mt-data-v1";
const STORED_AT = "x-stored-at";

async function store(key: string, body: unknown): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, new Response(JSON.stringify(body), { headers: { [STORED_AT]: String(Date.now()) } }));
  } catch {
    // Not cached this time.
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function cachedJson<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(key);
    if (hit) {
      const value = (await hit.json()) as T;
      const age = Date.now() - Number(hit.headers.get(STORED_AT) ?? 0);
      if (age > maxAgeMs) void load().then((fresh) => store(key, fresh), () => undefined);
      return value;
    }
  } catch {
    // Fall through to a network load.
  }
  const value = await load();
  await store(key, value);
  return value;
}

/** Convenience wrapper for a single URL. */
export function cachedFetchJson<T>(url: string, maxAgeMs: number): Promise<T> {
  return cachedJson(url, maxAgeMs, () => fetchJson<T>(url));
}
