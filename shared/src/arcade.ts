/**
 * Arcades from nearcade (https://nearcade.cn, community-maintained, open source), maimai DX shops only.
 * The browser calls nearcade directly; locations are rounded to ~100 m before they leave the device.
 */
import { ProberError } from "./probers";

const NEARCADE_API = "https://nearcade.cn/api";
const MAIMAI_DX = 1;

export interface ArcadeMachine {
  version: string;
  quantity: number;
  cost: string;
  comment: string;
}

export interface Arcade {
  id: number;
  name: string;
  /** Region names below country level plus the detailed address. */
  address: string;
  /** Kilometres from the query point, when known. */
  distance: number | null;
  /** [longitude, latitude] as nearcade stores them (GCJ-02 inside mainland China). */
  coordinates: [number, number] | null;
  isOpen: boolean | null;
  /** One entry for "every day", otherwise Monday..Sunday; null = closed that day. */
  openingHours: ([string, string] | null)[];
  machines: ArcadeMachine[];
  /** Players currently reported at the shop, if anyone reported. */
  attendance: number | null;
  comment: string;
  updatedAt: string | null;
}

export interface ArcadeRegion {
  id: string;
  label: string;
  hasChildren: boolean;
}

// ---- Normalisation ----

interface NcTime {
  hour: number;
  minute: number;
}

export interface NcShop {
  id: number;
  name: string;
  comment?: string;
  distance?: number;
  isOpen?: boolean;
  location?: { coordinates?: [number, number] };
  address?: { detailed?: string; region?: { id: string; name: string }[] };
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

const onlyMaimai = (shops: NcShop[]) => shops.map(toArcade).filter((a): a is Arcade => a !== null);

// ---- Queries ----

async function nearcade<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const query = qs.toString();
  let res: Response;
  try {
    res = await fetch(`${NEARCADE_API}${path}${query ? `?${query}` : ""}`, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new ProberError(502, `机厅数据暂时无法获取（${(err as Error).message}）`);
  }
  if (res.status === 404) throw new ProberError(404, "没有找到这家机厅");
  if (!res.ok) throw new ProberError(502, `机厅数据源返回 HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Round to 3 decimals (~100 m): enough for "nearby", and identical requests hit the HTTP cache. */
export const coarse = (n: number) => Math.round(n * 1000) / 1000;

const REGION_ID = /^[A-Z]{2}(-\d+)?$/;

/** Shops with maimai DX within `radiusKm` of a WGS-84 point, nearest first. */
export async function arcadesNearby(lat: number, lng: number, radiusKm = 10): Promise<Arcade[]> {
  const res = await nearcade<{ shops?: NcShop[] }>("/discover", {
    latitude: coarse(lat),
    longitude: coarse(lng),
    radius: Math.min(Math.max(radiusKm, 1), 50),
    limit: 100,
    convertFrom: "gps",
    gameTitleIds: MAIMAI_DX,
    includeTimeInfo: "true",
  });
  return onlyMaimai(res.shops ?? []).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

export async function arcadeRegions(parentId = "CN"): Promise<ArcadeRegion[]> {
  if (!REGION_ID.test(parentId)) throw new ProberError(400, "地区编号不正确");
  const res = await nearcade<ArcadeRegion[] | { regions: ArcadeRegion[] }>("/regions", { locale: "zh", parentId });
  const list = Array.isArray(res) ? res : res.regions;
  return list.map((r) => ({ id: r.id, label: r.label, hasChildren: !!r.hasChildren }));
}

export async function searchArcades(opts: {
  regionId?: string;
  q?: string;
  page?: number;
}): Promise<{ arcades: Arcade[]; hasNextPage: boolean; total: number | null }> {
  if (opts.regionId && !REGION_ID.test(opts.regionId)) throw new ProberError(400, "地区编号不正确");
  const res = await nearcade<{ shops?: NcShop[]; hasNextPage?: boolean; totalCount?: number }>("/shops", {
    page: Math.max(1, Math.floor(opts.page ?? 1)),
    limit: 20,
    regionId: opts.regionId,
    q: opts.q?.trim().slice(0, 40),
    gameTitleIds: MAIMAI_DX,
    includeTimeInfo: "true",
  });
  return { arcades: onlyMaimai(res.shops ?? []), hasNextPage: !!res.hasNextPage, total: res.totalCount ?? null };
}
