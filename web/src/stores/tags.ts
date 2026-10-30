import { recordKey, type TagCounts, type TagId } from "@mt/shared";
import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { api } from "@/api";

/** Community tag totals (public) and the signed-in user's own votes, updated optimistically. */
export const useTagsStore = defineStore("tags", () => {
  const counts = shallowRef<TagCounts>({});
  const loaded = ref(false);
  const error = ref<string | null>(null);
  /** My votes per song: { songId: { difficulty: tags } }. */
  const mine = ref<Record<number, Record<number, TagId[]>>>({});
  let inflight: Promise<void> | null = null;

  function load(force = false): Promise<void> {
    if (loaded.value && !force) return Promise.resolve();
    inflight ??= api<TagCounts>("GET", "/tags")
      .then((c) => {
        counts.value = c;
        loaded.value = true;
        error.value = null;
      })
      .catch((err: Error) => {
        error.value = err.message;
      })
      .finally(() => (inflight = null));
    return inflight;
  }

  async function loadMine(songId: number): Promise<void> {
    mine.value = { ...mine.value, [songId]: await api<Record<number, TagId[]>>("GET", `/tags/mine/${songId}`) };
  }

  function bump(songId: number, difficulty: number, tag: TagId, by: number) {
    const key = recordKey(songId, difficulty);
    const entry = { ...(counts.value[key] ?? {}) };
    entry[tag] = Math.max(0, (entry[tag] ?? 0) + by);
    counts.value = { ...counts.value, [key]: entry };
    const song = { ...(mine.value[songId] ?? {}) };
    const list = song[difficulty] ?? [];
    song[difficulty] = by > 0 ? [...list, tag] : list.filter((t) => t !== tag);
    mine.value = { ...mine.value, [songId]: song };
  }

  /** Add or take back my vote; rolls back if the server refuses. */
  async function toggle(songId: number, difficulty: number, tag: TagId): Promise<void> {
    const on = !(mine.value[songId]?.[difficulty] ?? []).includes(tag);
    bump(songId, difficulty, tag, on ? 1 : -1);
    try {
      await api(on ? "PUT" : "DELETE", `/tags/${songId}/${difficulty}/${tag}`);
    } catch (err) {
      bump(songId, difficulty, tag, on ? -1 : 1);
      throw err;
    }
  }

  return { counts, loaded, error, mine, load, loadMine, toggle };
});
