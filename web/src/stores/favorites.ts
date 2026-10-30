import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api";

export interface FavoriteFolder {
  id: string;
  name: string;
  songIds: number[];
  updatedAt: number;
}

/**
 * Favorites live on the server. Edits update the local copy optimistically and roll back if the
 * request fails, so the UI stays snappy without ever diverging from what is stored.
 */
export const useFavoritesStore = defineStore("favorites", () => {
  const folders = ref<FavoriteFolder[]>([]);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    try {
      folders.value = await api<FavoriteFolder[]>("GET", "/favorites");
      loaded.value = true;
      error.value = null;
    } catch (err) {
      error.value = (err as Error).message;
    }
  }

  async function mutate(apply: () => void, request: () => Promise<unknown>): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(folders.value)) as FavoriteFolder[];
    apply();
    try {
      await request();
      error.value = null;
    } catch (err) {
      folders.value = snapshot;
      error.value = (err as Error).message;
      throw err;
    }
  }

  async function createFolder(name: string): Promise<FavoriteFolder> {
    const folder = await api<FavoriteFolder>("POST", "/favorites", { name });
    folders.value.push(folder);
    return folder;
  }

  const find = (id: string) => folders.value.find((f) => f.id === id);

  function renameFolder(id: string, name: string) {
    return mutate(
      () => {
        const f = find(id);
        if (f) f.name = name.trim();
      },
      () => api("PATCH", `/favorites/${id}`, { name }),
    );
  }

  function deleteFolder(id: string) {
    return mutate(
      () => (folders.value = folders.value.filter((f) => f.id !== id)),
      () => api("DELETE", `/favorites/${id}`),
    );
  }

  function toggleSong(folderId: string, songId: number) {
    const f = find(folderId);
    const has = !!f?.songIds.includes(songId);
    return mutate(
      () => {
        if (!f) return;
        f.songIds = has ? f.songIds.filter((s) => s !== songId) : [songId, ...f.songIds];
      },
      () => api(has ? "DELETE" : "PUT", `/favorites/${folderId}/songs/${songId}`),
    );
  }

  function reset() {
    folders.value = [];
    loaded.value = false;
  }

  return { folders, loaded, error, load, createFolder, renameFolder, deleteFolder, toggleSong, reset };
});
