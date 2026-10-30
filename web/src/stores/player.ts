import {
  b50FromScores,
  fetchDivingFishB50,
  fetchLxnsScores,
  indexRecords,
  parsePlayerQuery,
  type PlayerB50,
  type PlayerScores,
} from "@mt/shared";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { useCatalogStore } from "./catalog";

export type LookupKind = "username" | "qq" | "lxns";

export interface LastLookup {
  kind: LookupKind;
  /** Username or QQ for Diving-Fish; empty for LXNS (the token is stored separately, only if remembered). */
  value: string;
}

const LOOKUP_KEY = "lastLookup";
const TOKEN_KEY = "lxnsToken";

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode); nothing is remembered across visits.
  }
}

function readLastLookup(): LastLookup | null {
  try {
    const parsed = JSON.parse(storageGet(LOOKUP_KEY) ?? "null") as LastLookup | null;
    return parsed && ["username", "qq", "lxns"].includes(parsed.kind) && typeof parsed.value === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export const usePlayerStore = defineStore("player", () => {
  const catalog = useCatalogStore();
  const b50 = shallowRef<PlayerB50 | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastLookup = ref<LastLookup | null>(readLastLookup());
  /** Remembered LXNS personal token, if the user opted in on this device. */
  const savedToken = ref(storageGet(TOKEN_KEY) ?? "");

  /** Full best-score list; only available for LXNS lookups. */
  const scores = shallowRef<PlayerScores | null>(null);
  const records = computed(() => indexRecords(scores.value?.records ?? []));

  /**
   * For LXNS, `value` is the personal token; it goes straight from this browser to LXNS and is kept
   * here only if `remember` is set. Diving-Fish is queried directly as well.
   */
  async function lookup(kind: LookupKind, value: string, remember = false): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      if (kind === "lxns") {
        await catalog.load();
        if (!catalog.catalog) throw new Error(catalog.error ?? "曲库未加载");
        const fetched = await fetchLxnsScores(value, catalog.catalog);
        scores.value = fetched;
        b50.value = b50FromScores(fetched, catalog.catalog);
      } else {
        const query = parsePlayerQuery({ [kind]: value });
        if (!query) throw new Error(kind === "qq" ? "QQ 号格式不正确" : "请填写水鱼用户名");
        b50.value = await fetchDivingFishB50(query);
        scores.value = null;
      }
      lastLookup.value = { kind, value: kind === "lxns" ? "" : value };
      storageSet(LOOKUP_KEY, JSON.stringify(lastLookup.value));
      if (kind === "lxns") {
        savedToken.value = remember ? value : "";
        storageSet(TOKEN_KEY, remember ? value : null);
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function forgetToken(): void {
    savedToken.value = "";
    storageSet(TOKEN_KEY, null);
  }

  /** Re-run the remembered lookup when a page opens without data. */
  async function restore(): Promise<void> {
    if (b50.value || loading.value || !lastLookup.value) return;
    const { kind, value } = lastLookup.value;
    if (kind === "lxns" && savedToken.value) await lookup("lxns", savedToken.value, true);
    else if (kind !== "lxns" && value) await lookup(kind, value);
  }

  return { b50, scores, records, loading, error, lastLookup, savedToken, lookup, forgetToken, restore };
});
