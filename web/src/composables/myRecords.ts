import { snapshotRecords, type PlayRecord, type ScoreSnapshot } from "@mt/shared";
import { computed, shallowRef } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCatalogStore } from "@/stores/catalog";
import { useFriendsStore } from "@/stores/friends";
import { usePlayerStore } from "@/stores/player";

/**
 * My scores for pages that compare or analyse them. Best available source: the full list loaded in this
 * browser, then my last full upload, then the B50 loaded here, then any upload.
 */
export function useMyRecords() {
  const auth = useAuthStore();
  const catalog = useCatalogStore();
  const player = usePlayerStore();
  const friends = useFriendsStore();
  const ownStored = shallowRef<ScoreSnapshot | null>(null);

  const useStored = computed(() => !player.scores && !!ownStored.value && (ownStored.value.full || !player.b50));
  const records = computed<PlayRecord[]>(() => {
    if (player.scores) return player.scores.records;
    if (useStored.value && catalog.catalog) return snapshotRecords(ownStored.value!, catalog.catalog);
    return player.b50 ? [...player.b50.b35, ...player.b50.b15] : [];
  });
  const full = computed(() => !!player.scores || (useStored.value && ownStored.value!.full));
  const nickname = computed(() => (useStored.value ? ownStored.value?.nickname : player.b50?.nickname) || auth.user?.username || "我");

  async function load(): Promise<void> {
    await Promise.all([catalog.load(), player.restore()]);
    if (!player.scores && auth.user) ownStored.value = (await friends.fetchOwnSnapshot().catch(() => null))?.snapshot ?? null;
  }

  return { records, full, useStored, nickname, load };
}
