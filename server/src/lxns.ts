/**
 * LXNS personal API (X-User-Token). The token is the player's own credential: it is only forwarded
 * upstream, never logged or persisted, and the response cache is keyed by its hash.
 */
import { createHash } from "node:crypto";
import {
  withRating,
  type Catalog,
  type ComboFlag,
  type DifficultyIndex,
  type PlayerScores,
  type PlayRecord,
  type SyncFlag,
} from "@mt/shared";
import { config } from "./config";
import { PlayerLookupError } from "./players";

const API = "https://maimai.lxns.net/api/v0/user/maimai";
const CACHE_TTL_MS = 60_000;

interface LxEnvelope<T> {
  success: boolean;
  code: number;
  message?: string;
  data: T;
}

interface LxPlayer {
  name: string;
  rating: number;
  friend_code: number;
  name_plate?: { name: string } | null;
}

export interface LxScore {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  achievements: number;
  fc: ComboFlag | null;
  fs: SyncFlag | null;
  dx_score: number;
  type: "standard" | "dx" | "utage";
}

const COMBO = new Set<string>(["fc", "fcp", "ap", "app"]);
const SYNC = new Set<string>(["sync", "fs", "fsp", "fsd", "fsdp"]);

/** LXNS uses the base id for both chart types; our catalog uses Diving-Fish ids (DX = base + 10000). */
export function catalogIdOf(score: Pick<LxScore, "id" | "type">): number {
  return score.type === "dx" ? score.id + 10000 : score.id;
}

/** Convert LXNS scores to records, filling the chart constant from the catalog. Unknown charts are counted, not guessed. */
export function toRecords(scores: LxScore[], catalog: Catalog): { records: PlayRecord[]; unmatched: number } {
  const byId = new Map(catalog.songs.map((s) => [s.id, s]));
  const records: PlayRecord[] = [];
  let unmatched = 0;
  for (const s of scores) {
    const songId = catalogIdOf(s);
    const song = byId.get(songId);
    const chart = song?.charts[s.type === "utage" ? 0 : s.level_index];
    if (!song || !chart) {
      unmatched++;
      continue;
    }
    records.push(
      withRating({
        songId,
        title: song.title,
        type: song.type,
        difficulty: s.level_index as DifficultyIndex,
        level: chart.level,
        ds: chart.ds,
        achievement: s.achievements,
        dxScore: s.dx_score,
        combo: s.fc && COMBO.has(s.fc) ? s.fc : "",
        sync: s.fs && SYNC.has(s.fs) ? s.fs : "",
      }),
    );
  }
  return { records, unmatched };
}

async function call<T>(path: string, token: string): Promise<T> {
  const request = () =>
    fetch(`${API}${path}`, {
      headers: { "X-User-Token": token, "User-Agent": config.userAgent },
      signal: AbortSignal.timeout(20_000),
    });
  let res: Response;
  try {
    res = await request().catch(request);
  } catch (err) {
    throw new PlayerLookupError(502, `落雪查分器暂时无法访问，请稍后再试（${(err as Error).message}）`);
  }
  if (res.status === 401 || res.status === 403) throw new PlayerLookupError(403, "落雪个人密钥无效或已重置，请重新生成");
  if (res.status === 404) throw new PlayerLookupError(404, "这个落雪账号还没有绑定舞萌玩家数据");
  if (res.status === 429) throw new PlayerLookupError(502, "落雪请求过于频繁，请稍后再试");
  if (!res.ok) throw new PlayerLookupError(502, `落雪查分器返回 HTTP ${res.status}`);
  const body = (await res.json()) as LxEnvelope<T>;
  if (!body.success) throw new PlayerLookupError(502, `落雪查分器：${body.message ?? body.code}`);
  return body.data;
}

const cache = new Map<string, { at: number; value: PlayerScores }>();

export function isPlausibleToken(token: string | undefined): token is string {
  return !!token && token.length >= 16 && token.length <= 256 && /^[\x21-\x7e]+$/.test(token);
}

/** All of the player's best scores; the client derives B50, progress and suggestions from them. */
export async function fetchLxnsScores(token: string, catalog: Catalog): Promise<PlayerScores> {
  const key = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  // Sequential on purpose: LXNS rate-limits per IP and every user shares this server's IP.
  const player = await call<LxPlayer>("/player", token);
  const scores = await call<LxScore[]>("/player/scores", token);
  const { records, unmatched } = toRecords(scores, catalog);

  const value: PlayerScores = {
    source: "lxns",
    username: String(player.friend_code),
    nickname: player.name,
    plate: player.name_plate?.name ?? "",
    reportedRating: player.rating,
    records,
    unmatched,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
