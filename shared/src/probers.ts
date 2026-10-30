/**
 * Score lookups against Diving-Fish (public B50 query) and LXNS (personal token). Both allow
 * cross-origin requests, so the browser calls them directly; the LXNS token never reaches our server.
 */
import type { Catalog, DifficultyIndex } from "./catalog";
import { compareRecords, withRating, type PlayerB50, type PlayRecord } from "./player";
import type { ComboFlag, SyncFlag } from "./rating";
import type { PlayerScores } from "./scores";

export class ProberError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 429 | 502,
    message: string,
  ) {
    super(message);
  }
}

const COMBO = new Set<string>(["fc", "fcp", "ap", "app"]);
const SYNC = new Set<string>(["sync", "fs", "fsp", "fsd", "fsdp"]);
const combo = (v: unknown): ComboFlag => (typeof v === "string" && COMBO.has(v) ? (v as ComboFlag) : "");
const sync = (v: unknown): SyncFlag => (typeof v === "string" && SYNC.has(v) ? (v as SyncFlag) : "");

/** fetch with one retry on a dropped connection (both probers occasionally reset connections). */
async function fetchRetry(url: string, init: RequestInit, source: string): Promise<Response> {
  const go = () => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  try {
    return await go().catch(go);
  } catch (err) {
    throw new ProberError(502, `${source}暂时无法访问，请稍后再试（${(err as Error).message}）`);
  }
}

// ---- Diving-Fish ----

export const DF_QUERY_URL = "https://www.diving-fish.com/api/maimaidxprober/query/player";

export type PlayerQuery = { username: string } | { qq: string };

interface DfRecord {
  song_id: number;
  title: string;
  type: "SD" | "DX";
  level_index: number;
  level: string;
  ds: number;
  achievements: number;
  dxScore: number;
  fc: string;
  fs: string;
}

export interface DfPlayer {
  username: string;
  nickname: string;
  plate: string;
  rating: number;
  charts: { sd: DfRecord[]; dx: DfRecord[] };
}

/** Accepts a username or a QQ number; returns null when neither is valid. */
export function parsePlayerQuery(params: { username?: string; qq?: string }): PlayerQuery | null {
  const qq = params.qq?.trim();
  if (qq) return /^\d{5,12}$/.test(qq) ? { qq } : null;
  const username = params.username?.trim();
  if (username && username.length <= 64) return { username };
  return null;
}

function dfRecord(r: DfRecord): PlayRecord {
  const songId = Number(r.song_id);
  return withRating({
    songId,
    title: r.title,
    type: songId >= 100000 ? "UTAGE" : r.type,
    difficulty: r.level_index as DifficultyIndex,
    level: r.level,
    ds: r.ds,
    achievement: r.achievements,
    dxScore: r.dxScore,
    combo: combo(r.fc),
    sync: sync(r.fs),
  });
}

/** Normalize a Diving-Fish B50 response; ratings are recomputed with our own formula. */
export function normalizeDivingFish(data: DfPlayer): PlayerB50 {
  return {
    source: "diving-fish",
    username: data.username,
    nickname: data.nickname,
    plate: data.plate ?? "",
    reportedRating: data.rating,
    b35: data.charts.sd.map(dfRecord).sort(compareRecords),
    b15: data.charts.dx.map(dfRecord).sort(compareRecords),
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchDivingFishB50(query: PlayerQuery): Promise<PlayerB50> {
  const res = await fetchRetry(
    DF_QUERY_URL,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...query, b50: true }) },
    "水鱼查分器",
  );
  if (res.status === 400) throw new ProberError(404, "找不到这个玩家，请确认用户名或 QQ 号");
  if (res.status === 403) throw new ProberError(403, "该玩家在水鱼设置了隐私，或尚未同意用户协议");
  if (!res.ok) throw new ProberError(502, `水鱼查分器返回 HTTP ${res.status}`);
  return normalizeDivingFish((await res.json()) as DfPlayer);
}

// ---- LXNS ----

const LXNS_USER_API = "https://maimai.lxns.net/api/v0/user/maimai";

interface LxEnvelope<T> {
  success: boolean;
  code: number;
  message?: string;
  data: T;
}

export interface LxPlayer {
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
  fc: string | null;
  fs: string | null;
  dx_score: number;
  type: "standard" | "dx" | "utage";
}

export function isPlausibleToken(token: string | undefined): token is string {
  return !!token && token.length >= 16 && token.length <= 256 && /^[\x21-\x7e]+$/.test(token);
}

/** LXNS uses the base id for both chart types; our catalog uses Diving-Fish ids (DX = base + 10000). */
export function catalogIdOf(score: Pick<LxScore, "id" | "type">): number {
  return score.type === "dx" ? score.id + 10000 : score.id;
}

/** Convert LXNS scores to records, filling the chart constant from the catalog. Unknown charts are counted, not guessed. */
export function lxnsRecords(scores: LxScore[], catalog: Catalog): { records: PlayRecord[]; unmatched: number } {
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
        combo: combo(s.fc),
        sync: sync(s.fs),
      }),
    );
  }
  return { records, unmatched };
}

async function lxnsCall<T>(path: string, token: string): Promise<T> {
  const res = await fetchRetry(`${LXNS_USER_API}${path}`, { headers: { "X-User-Token": token } }, "落雪查分器");
  if (res.status === 401 || res.status === 403) throw new ProberError(403, "落雪个人密钥无效或已重置，请重新生成");
  if (res.status === 404) throw new ProberError(404, "这个落雪账号还没有绑定舞萌玩家数据");
  if (res.status === 429) throw new ProberError(429, "落雪请求过于频繁，请稍后再试");
  if (!res.ok) throw new ProberError(502, `落雪查分器返回 HTTP ${res.status}`);
  const body = (await res.json()) as LxEnvelope<T>;
  if (!body.success) throw new ProberError(502, `落雪查分器：${body.message ?? body.code}`);
  return body.data;
}

/** All of the player's best scores, straight from LXNS with their personal token. */
export async function fetchLxnsScores(token: string, catalog: Catalog): Promise<PlayerScores> {
  if (!isPlausibleToken(token)) throw new ProberError(400, "请填写落雪个人密钥");
  const player = await lxnsCall<LxPlayer>("/player", token);
  const scores = await lxnsCall<LxScore[]>("/player/scores", token);
  const { records, unmatched } = lxnsRecords(scores, catalog);
  return {
    source: "lxns",
    username: String(player.friend_code),
    nickname: player.name,
    plate: player.name_plate?.name ?? "",
    reportedRating: player.rating,
    records,
    unmatched,
    fetchedAt: new Date().toISOString(),
  };
}
