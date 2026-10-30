import { buildCatalog, SOURCES, type Catalog, type RawSources, type SourceName, type Song } from "@mt/shared";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

/**
 * The catalog is merged in the browser from the four public sources and kept in Cache Storage.
 * A fresh copy is used as is; a stale one is shown immediately while a new one is built behind it.
 */
const CACHE_NAME = "mt-catalog-v2"; // v2: catalog gained gameVersions
const OLD_CACHES = ["mt-catalog-v1"];
const CACHE_KEY = "/__catalog.json";
const FRESH_MS = 6 * 3600_000;

async function readCached(): Promise<{ catalog: Catalog; age: number } | null> {
  try {
    for (const name of OLD_CACHES) void caches.delete(name);
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(CACHE_KEY);
    if (!res) return null;
    const catalog = (await res.json()) as Catalog;
    return { catalog, age: Date.now() - Date.parse(catalog.builtAt) };
  } catch {
    return null; // Cache Storage unavailable (insecure context, private mode)
  }
}

async function writeCached(catalog: Catalog): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(CACHE_KEY, new Response(JSON.stringify(catalog), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // Not cached this time; the next visit rebuilds.
  }
}

async function fetchSources(onProgress: (done: number) => void): Promise<RawSources> {
  let done = 0;
  const entries = await Promise.all(
    (Object.keys(SOURCES) as SourceName[]).map(async (name) => {
      const res = await fetch(SOURCES[name], { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
      const body = await res.json();
      onProgress(++done);
      return [name, body] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as RawSources;
}

export const useCatalogStore = defineStore("catalog", () => {
  const catalog = shallowRef<Catalog | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);
  /** Sources downloaded so far during a build (0–4), for progress text. */
  const progress = ref(0);
  let inflight: Promise<void> | null = null;

  const songsById = computed(() => new Map((catalog.value?.songs ?? []).map((s) => [s.id, s])));

  async function rebuild(): Promise<void> {
    progress.value = 0;
    const raw = await fetchSources((n) => (progress.value = n));
    const built = buildCatalog(raw);
    catalog.value = built;
    await writeCached(built);
  }

  async function run(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const cached = await readCached();
      if (cached) {
        catalog.value = cached.catalog;
        if (cached.age > FRESH_MS) void rebuild().catch(() => undefined); // refresh quietly; keep the stale copy on failure
        return;
      }
      await rebuild();
    } catch (err) {
      error.value = `曲库数据下载失败：${(err as Error).message}`;
    } finally {
      loading.value = false;
    }
  }

  /** Load once per visit; concurrent callers share the same work. */
  function load(): Promise<void> {
    if (catalog.value) return Promise.resolve();
    inflight ??= run().finally(() => (inflight = null));
    return inflight;
  }

  function getSong(id: number): Song | undefined {
    return songsById.value.get(id);
  }

  return { catalog, error, loading, progress, load, getSong };
});
