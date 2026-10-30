import { collectionListKey, collectionUrl, type Collectible, type CollectionKind } from "@mt/shared";
import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { cachedFetchJson } from "@/data/cachedJson";

const DAY = 24 * 3600_000;

/** Collectible lists from LXNS, loaded per kind on demand and cached for a day. */
export const useCollectionsStore = defineStore("collections", () => {
  const lists = reactive<Partial<Record<CollectionKind, Collectible[]>>>({});
  const loading = ref<CollectionKind | null>(null);
  const error = ref<string | null>(null);

  async function load(kind: CollectionKind): Promise<void> {
    if (lists[kind]) return;
    loading.value = kind;
    error.value = null;
    try {
      const body = await cachedFetchJson<Record<string, Collectible[]>>(collectionUrl(kind), DAY);
      lists[kind] = body[collectionListKey(kind)] ?? [];
    } catch (err) {
      error.value = `收藏品数据加载失败：${(err as Error).message}`;
    } finally {
      loading.value = null;
    }
  }

  return { lists, loading, error, load };
});
