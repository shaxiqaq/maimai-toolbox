import { summarizeB50, toSnapshot, type PlayRecord, type ScoreSnapshot } from "@mt/shared";
import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api";
import { usePlayerStore } from "./player";

export interface SnapshotInfo {
  nickname: string;
  source: string;
  full: boolean;
  rating: number;
  recordCount: number;
  updatedAt: number;
}

export interface Friend {
  id: number;
  username: string;
  since: number;
  snapshot: SnapshotInfo | null;
}

export interface PendingRequest {
  id: number;
  username: string;
  createdAt: number;
}

export interface FriendsOverview {
  friends: Friend[];
  incoming: PendingRequest[];
  outgoing: PendingRequest[];
  snapshot: SnapshotInfo | null;
}

export interface StoredSnapshot {
  updatedAt: number;
  snapshot: ScoreSnapshot;
}

const AUTO_SHARE_KEY = "shareScores";

function readAutoShare(): boolean {
  try {
    return localStorage.getItem(AUTO_SHARE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Friends and score sharing. Friends can only compare against what each side chose to upload: the
 * snapshot is built here from the scores this browser already fetched, never from a stored token.
 */
export const useFriendsStore = defineStore("friends", () => {
  const player = usePlayerStore();
  const overview = ref<FriendsOverview | null>(null);
  const error = ref<string | null>(null);
  const uploading = ref(false);
  /** Upload a fresh snapshot after every score lookup on this device. */
  const autoShare = ref(readAutoShare());

  async function load(): Promise<void> {
    try {
      overview.value = await api<FriendsOverview>("GET", "/friends");
      error.value = null;
    } catch (err) {
      error.value = (err as Error).message;
    }
  }

  function reset(): void {
    overview.value = null;
    error.value = null;
  }

  async function request(username: string): Promise<"requested" | "accepted"> {
    const { status } = await api<{ status: "requested" | "accepted" }>("POST", "/friends/requests", { username });
    await load();
    return status;
  }

  async function accept(id: number): Promise<void> {
    await api("POST", `/friends/requests/${id}/accept`);
    await load();
  }

  async function drop(id: number): Promise<void> {
    await api("DELETE", `/friends/requests/${id}`);
    await load();
  }

  async function remove(id: number): Promise<void> {
    await api("DELETE", `/friends/${id}`);
    await load();
  }

  /** What would be shared right now: every score with an LXNS lookup, otherwise the B50. */
  function currentSnapshot(): ScoreSnapshot | null {
    const b50 = player.b50;
    if (!b50) return null;
    const full = !!player.scores;
    const records: PlayRecord[] = player.scores?.records ?? [...b50.b35, ...b50.b15];
    if (!records.length) return null;
    return toSnapshot(records, {
      source: b50.source,
      nickname: b50.nickname || b50.username,
      full,
      rating: summarizeB50(b50.b35, b50.b15).total,
      fetchedAt: b50.fetchedAt,
    });
  }

  async function upload(): Promise<void> {
    const snapshot = currentSnapshot();
    if (!snapshot) throw new Error("先在 B50 页查询一次成绩");
    uploading.value = true;
    try {
      const info = await api<SnapshotInfo>("PUT", "/snapshot", snapshot);
      if (overview.value) overview.value = { ...overview.value, snapshot: info };
    } finally {
      uploading.value = false;
    }
  }

  /** Called after each lookup. Never replaces a full score list with a B50-only one. */
  async function autoUpload(): Promise<void> {
    const snapshot = currentSnapshot();
    if (!autoShare.value || !snapshot) return;
    if (!overview.value) await load();
    if (!snapshot.full && overview.value?.snapshot?.full) return;
    await upload().catch(() => undefined);
  }

  async function deleteSnapshot(): Promise<void> {
    await api("DELETE", "/snapshot");
    if (overview.value) overview.value = { ...overview.value, snapshot: null };
  }

  function setAutoShare(on: boolean): void {
    autoShare.value = on;
    try {
      if (on) localStorage.setItem(AUTO_SHARE_KEY, "1");
      else localStorage.removeItem(AUTO_SHARE_KEY);
    } catch {
      // Not remembered on this device.
    }
  }

  const fetchSnapshot = (userId: number) => api<StoredSnapshot>("GET", `/friends/${userId}/snapshot`);
  const fetchOwnSnapshot = () => api<StoredSnapshot>("GET", "/snapshot");

  return {
    overview,
    error,
    uploading,
    autoShare,
    load,
    reset,
    request,
    accept,
    drop,
    remove,
    currentSnapshot,
    upload,
    autoUpload,
    deleteSnapshot,
    setAutoShare,
    fetchSnapshot,
    fetchOwnSnapshot,
  };
});
