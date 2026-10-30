/** Player lookups against Diving-Fish's public query endpoint (no token; respects the player's privacy setting). */
import {
  compareRecords,
  withRating,
  type ComboFlag,
  type DifficultyIndex,
  type PlayerB50,
  type PlayRecord,
  type SyncFlag,
} from "@mt/shared";
import { config } from "./config";

const QUERY_URL = "https://www.diving-fish.com/api/maimaidxprober/query/player";
const CACHE_TTL_MS = 60_000;

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

interface DfPlayer {
  username: string;
  nickname: string;
  plate: string;
  rating: number;
  charts: { sd: DfRecord[]; dx: DfRecord[] };
}

export type PlayerQuery = { username: string } | { qq: string };

export class PlayerLookupError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 502,
    message: string,
  ) {
    super(message);
  }
}

const COMBO: readonly ComboFlag[] = ["", "fc", "fcp", "ap", "app"];
const SYNC: readonly SyncFlag[] = ["", "sync", "fs", "fsp", "fsd", "fsdp"];

function toRecord(r: DfRecord): PlayRecord {
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
    combo: COMBO.includes(r.fc as ComboFlag) ? (r.fc as ComboFlag) : "",
    sync: SYNC.includes(r.fs as SyncFlag) ? (r.fs as SyncFlag) : "",
  });
}

const cache = new Map<string, { at: number; value: PlayerB50 }>();

export async function fetchB50(query: PlayerQuery): Promise<PlayerB50> {
  const key = "qq" in query ? `qq:${query.qq}` : `u:${query.username.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const request = () =>
    fetch(QUERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": config.userAgent },
      body: JSON.stringify({ ...query, b50: true }),
      signal: AbortSignal.timeout(20_000),
    });

  let res: Response;
  try {
    // Diving-Fish occasionally drops connections; one retry covers that without hammering it.
    res = await request().catch(request);
  } catch (err) {
    throw new PlayerLookupError(502, `水鱼查分器暂时无法访问，请稍后再试（${(err as Error).message}）`);
  }

  if (res.status === 400) throw new PlayerLookupError(404, "找不到这个玩家，请确认用户名或 QQ 号");
  if (res.status === 403) throw new PlayerLookupError(403, "该玩家在水鱼设置了隐私，或尚未同意用户协议");
  if (!res.ok) throw new PlayerLookupError(502, `水鱼查分器返回 HTTP ${res.status}`);

  const data = (await res.json()) as DfPlayer;
  const value: PlayerB50 = {
    source: "diving-fish",
    username: data.username,
    nickname: data.nickname,
    plate: data.plate ?? "",
    reportedRating: data.rating,
    b35: data.charts.sd.map(toRecord).sort(compareRecords),
    b15: data.charts.dx.map(toRecord).sort(compareRecords),
    fetchedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Accepts `?username=` or `?qq=`; returns null when neither is valid. */
export function parsePlayerQuery(params: { username?: string; qq?: string }): PlayerQuery | null {
  const qq = params.qq?.trim();
  if (qq) return /^\d{5,12}$/.test(qq) ? { qq } : null;
  const username = params.username?.trim();
  if (username && username.length <= 64) return { username };
  return null;
}
