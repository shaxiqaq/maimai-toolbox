import type { PlayRecord } from "./player";
import { meetsGoal } from "./progress";

export interface Highlight {
  label: string;
  record: PlayRecord;
  /** Short detail for captions, e.g. "100.4987%". */
  detail: string;
}

const pct = (a: number) => `${a.toFixed(4)}%`;

/** Best record by `score`, ties broken by higher constant. */
function best(records: PlayRecord[], score: (r: PlayRecord) => number): PlayRecord | undefined {
  let top: PlayRecord | undefined;
  for (const r of records) {
    if (!top || score(r) > score(top) || (score(r) === score(top) && r.ds > top.ds)) top = r;
  }
  return top;
}

/**
 * Personal highlights for a Bingo board, in a fixed order. Utage charts are ignored; a rule with no
 * matching record is skipped, so the list can be shorter than nine.
 */
export function scoreHighlights(all: PlayRecord[]): Highlight[] {
  const records = all.filter((r) => r.type !== "UTAGE");
  const rules: { label: string; pick: () => PlayRecord | undefined; detail: (r: PlayRecord) => string }[] = [
    { label: "单曲 Rating 最高", pick: () => best(records, (r) => r.rating), detail: (r) => `Rating ${r.rating}` },
    { label: "达成率最高", pick: () => best(records, (r) => r.achievement), detail: (r) => pct(r.achievement) },
    {
      label: "定数最高的 FC",
      pick: () => best(records.filter((r) => meetsGoal(r, { kind: "combo", combo: "fc" })), (r) => r.ds),
      detail: (r) => `定数 ${r.ds.toFixed(1)}`,
    },
    {
      label: "定数最高的 AP",
      pick: () => best(records.filter((r) => meetsGoal(r, { kind: "combo", combo: "ap" })), (r) => r.ds),
      detail: (r) => `定数 ${r.ds.toFixed(1)}`,
    },
    { label: "定数最高的 SSS", pick: () => best(records.filter((r) => r.achievement >= 100), (r) => r.ds), detail: (r) => pct(r.achievement) },
    { label: "定数最高的 SSS+", pick: () => best(records.filter((r) => r.achievement >= 100.5), (r) => r.ds), detail: (r) => pct(r.achievement) },
    {
      label: "差一点 SSS",
      pick: () => best(records.filter((r) => r.achievement < 100), (r) => r.achievement),
      detail: (r) => pct(r.achievement),
    },
    {
      label: "差一点 SSS+",
      pick: () => best(records.filter((r) => r.achievement >= 100 && r.achievement < 100.5), (r) => r.achievement),
      detail: (r) => pct(r.achievement),
    },
    {
      label: "压线 SSS+",
      pick: () => best(records.filter((r) => r.achievement >= 100.5), (r) => -r.achievement),
      detail: (r) => pct(r.achievement),
    },
  ];
  return rules.flatMap((rule) => {
    const record = rule.pick();
    return record ? [{ label: rule.label, record, detail: rule.detail(record) }] : [];
  });
}
