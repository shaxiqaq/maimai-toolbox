import type { Catalog, Song } from "@mt/shared";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

export const useCatalogStore = defineStore("catalog", () => {
  const catalog = shallowRef<Catalog | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);

  const songsById = computed(() => new Map((catalog.value?.songs ?? []).map((s) => [s.id, s])));

  /** Load once per visit; the browser revalidates via ETag, so repeat loads are cheap. */
  async function load(): Promise<void> {
    if (catalog.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch("/api/catalog");
      if (!res.ok) throw new Error(res.status === 503 ? "曲库正在同步，请稍后刷新" : `HTTP ${res.status}`);
      catalog.value = (await res.json()) as Catalog;
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function getSong(id: number): Song | undefined {
    return songsById.value.get(id);
  }

  return { catalog, error, loading, load, getSong };
});
