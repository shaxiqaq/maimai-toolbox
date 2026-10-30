/** Chart constant history, built from LXNS's per-version song data. */

export interface GameVersion {
  /** LXNS version number, e.g. 24000. */
  version: number;
  title: string;
}

/** Constants for one chart type at one version, indexed by difficulty (Basic..Re:Master). */
export type ConstantsAt = number[];

export interface ConstantChange {
  version: GameVersion;
  /** Constants after this version, per difficulty. */
  constants: ConstantsAt;
  /** Difficulties whose constant differs from the previous entry (all of them for the first entry). */
  changed: number[];
}

/** Fetch one song's constants as they were in a version; null when the song did not exist yet. */
export async function fetchConstantsAt(lxnsId: number, chartType: "standard" | "dx", version: number): Promise<ConstantsAt | null> {
  const res = await fetch(`https://maimai.lxns.net/api/v0/maimai/song/${lxnsId}?version=${version}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const song = (await res.json()) as { difficulties?: Record<string, { difficulty: number; level_value: number }[]> };
  const charts = song.difficulties?.[chartType] ?? [];
  if (!charts.length) return null;
  const out: number[] = [];
  for (const c of charts) out[c.difficulty] = c.level_value;
  return out;
}

/** Keep the first version a chart type appears in and every version where a constant moved. */
export function constantChanges(snapshots: { version: GameVersion; constants: ConstantsAt | null }[]): ConstantChange[] {
  const out: ConstantChange[] = [];
  let prev: ConstantsAt | null = null;
  for (const { version, constants } of [...snapshots].sort((a, b) => a.version.version - b.version.version)) {
    if (!constants) continue;
    const changed = constants.flatMap((v, d) => (v !== undefined && (!prev || prev[d] !== v) ? [d] : []));
    if (changed.length) out.push({ version, constants, changed });
    prev = constants;
  }
  return out;
}
