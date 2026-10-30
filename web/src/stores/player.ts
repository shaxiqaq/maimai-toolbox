import type { PlayerB50 } from "@mt/shared";
import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

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
  const b50 = shallowRef<PlayerB50 | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastLookup = ref<LastLookup | null>(readLastLookup());
  /** Remembered LXNS personal token, if the user opted in on this device. */
  const savedToken = ref(storageGet(TOKEN_KEY) ?? "");

  async function request(kind: LookupKind, value: string): Promise<PlayerB50> {
    const res =
      kind === "lxns"
        ? await fetch("/api/lxns/b50", { method: "POST", headers: { "X-User-Token": value } })
        : await fetch(`/api/player/b50?${new URLSearchParams({ [kind]: value })}`);
    const body = (await res.json().catch(() => null)) as (PlayerB50 & { error?: string }) | null;
    if (!res.ok || !body) throw new Error(body?.error ?? `HTTP ${res.status}`);
    return body;
  }

  /** For LXNS, `value` is the personal token; `remember` keeps it in this browser only. */
  async function lookup(kind: LookupKind, value: string, remember = false): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      b50.value = await request(kind, value);
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

  return { b50, loading, error, lastLookup, savedToken, lookup, forgetToken };
});
