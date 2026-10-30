/**
 * Arcade lookups via nearcade (https://nearcade.cn, community-maintained, open source).
 * Only shops with maimai DX are returned. Coordinates are rounded to ~100 m before leaving this server,
 * responses are cached briefly, and user locations are never logged or stored.
 */
import type { Arcade, ArcadeRegion as Region } from "@mt/shared";
import { config } from "./config";

const API = "https://nearcade.cn/api";
const MAIMAI_DX = 1;
const CACHE_TTL_MS = 10 * 60_000;
const REGION_TTL_MS = 24 * 3600_000;

export class ArcadeError extends Error {
  constructor(
    readonly status: 400 | 404 | 502,
    message: string,
  ) {
    super(message);
  }
}

// ---- Upstream ----

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();

async function get<T>(path: string, params: Record<string, string | number | undefined>, ttl = CACHE_TTL_MS): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  );
  const url = `${API}${path}${qs.size ? `?${qs}` : ""}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": config.userAgent }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new ArcadeError(502, `机厅数据暂时无法获取（${(err as Error).message}）`);
  }
  if (res.status === 404) throw new ArcadeError(404, "没有找到这家机厅");
  if (!res.ok) throw new ArcadeError(502, `机厅数据源返回 HTTP ${res.status}`);
  const value = (await res.json()) as T;
  cache.set(url, { at: Date.now(), ttl, value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!); // keep memory bounded
  return value;
}

// ---- Normalisation ----

interface NcTime {
  hour: number;
  minute: number;
}

interface NcShop {
  id: number;
  name: string;
  comment?: string;
  distance?: number;
  isOpen?: boolean;
  location?: { coordinates?: [number, number] };
  address?: { detailed?: string; region?: { id: string; name: string }[]; general?: string[] };
  openingHours?: ([NcTime, NcTime] | null)[];
  games?: { titleId: number; version?: string; quantity?: number; cost?: string; comment?: string }[];
  currentReportedAttendance?: number | { count?: number } | null;
  updatedAt?: string;
}

const hhmm = (t: NcTime) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;

function attendanceOf(v: NcShop["currentReportedAttendance"]): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.count === "number") return v.count;
  return null;
}

export function toArcade(s: NcShop): Arcade | null {
  const machines = (s.games ?? [])
    .filter((g) => g.titleId === MAIMAI_DX)
    .map((g) => ({ version: g.version ?? "", quantity: g.quantity ?? 1, cost: g.cost ?? "", comment: g.comment ?? "" }));
  if (!machines.length) return null;
  const regions = (s.address?.region ?? []).slice(1).map((r) => r.name);
  return {
    id: s.id,
    name: s.name,
    address: [...regions, s.address?.detailed ?? ""].filter(Boolean).join(" "),
    distance: typeof s.distance === "number" ? s.distance : null,
    coordinates: s.location?.coordinates ?? null,
    isOpen: typeof s.isOpen === "boolean" ? s.isOpen : null,
    openingHours: (s.openingHours ?? []).map((d) => (d ? [hhmm(d[0]), hhmm(d[1])] : null)),
    machines,
    attendance: attendanceOf(s.currentReportedAttendance),
    comment: s.comment ?? "",
    updatedAt: s.updatedAt ?? null,
  };
}

const arcades = (shops: NcShop[]) => shops.map(toArcade).filter((a): a is Arcade => a !== null);

// ---- Queries ----

/** Round to 3 decimals (~100 m): enough for "nearby", and identical requests share a cache entry. */
const coarse = (n: number) => Math.round(n * 1000) / 1000;

export function parseCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? { lat: la, lng: lo } : null;
}

/** Shops with maimai DX within `radiusKm` of a WGS-84 point, nearest first. */
export async function nearby(lat: number, lng: number, radiusKm = 10): Promise<Arcade[]> {
  const res = await get<{ shops: NcShop[] }>("/discover", {
    latitude: coarse(lat),
    longitude: coarse(lng),
    radius: Math.min(Math.max(radiusKm, 1), 50),
    limit: 100,
    convertFrom: "gps",
    gameTitleIds: MAIMAI_DX,
    includeTimeInfo: "true",
  });
  return arcades(res.shops ?? []).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

export async function regions(parentId: string): Promise<Region[]> {
  if (!/^[A-Z]{2}(-\d+)?$/.test(parentId)) throw new ArcadeError(400, "地区编号不正确");
  const res = await get<Region[] | { regions: Region[] }>("/regions", { locale: "zh", parentId }, REGION_TTL_MS);
  const list = Array.isArray(res) ? res : res.regions;
  return list.map((r) => ({ id: r.id, label: r.label, hasChildren: !!r.hasChildren }));
}

export async function search(opts: { regionId?: string; q?: string; page?: number }): Promise<{ arcades: Arcade[]; hasNextPage: boolean; total: number | null }> {
  if (opts.regionId && !/^[A-Z]{2}(-\d+)?$/.test(opts.regionId)) throw new ArcadeError(400, "地区编号不正确");
  const res = await get<{ shops: NcShop[]; hasNextPage?: boolean; totalCount?: number }>("/shops", {
    page: Math.max(1, Math.floor(opts.page ?? 1)),
    limit: 20,
    regionId: opts.regionId,
    q: opts.q?.trim().slice(0, 40),
    gameTitleIds: MAIMAI_DX,
    includeTimeInfo: "true",
  });
  return { arcades: arcades(res.shops ?? []), hasNextPage: !!res.hasNextPage, total: res.totalCount ?? null };
}

export async function detail(id: number): Promise<Arcade> {
  if (!Number.isInteger(id) || id <= 0) throw new ArcadeError(400, "机厅编号不正确");
  const res = await get<{ shop: NcShop } | NcShop>(`/shops/${id}`, {});
  const arcade = toArcade("shop" in res ? res.shop : res);
  if (!arcade) throw new ArcadeError(404, "这家店没有舞萌 DX");
  return arcade;
}
