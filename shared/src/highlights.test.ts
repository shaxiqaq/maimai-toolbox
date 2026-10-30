import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreHighlights } from "./highlights";
import { withRating, type PlayRecord } from "./player";

const rec = (songId: number, ds: number, achievement: number, extra: Partial<PlayRecord> = {}) =>
  withRating({
    songId,
    title: `s${songId}`,
    type: "DX",
    difficulty: 3,
    level: "",
    ds,
    achievement,
    dxScore: 0,
    combo: "",
    sync: "",
    ...extra,
  }) as PlayRecord;

describe("scoreHighlights", () => {
  const records = [
    rec(1, 14.5, 99.98),
    rec(2, 13.8, 100.4987),
    rec(3, 13.0, 100.5012, { combo: "ap" }),
    rec(4, 12.5, 100.9, { combo: "fc" }),
    rec(5, 15.0, 101, { type: "UTAGE" }),
  ];
  const byLabel = new Map(scoreHighlights(records).map((h) => [h.label, h.record.songId]));

  it("picks one record per rule and ignores utage", () => {
    assert.equal(byLabel.get("达成率最高"), 4);
    assert.equal(byLabel.get("定数最高的 FC"), 3, "AP also counts as FC");
    assert.equal(byLabel.get("定数最高的 AP"), 3);
    assert.equal(byLabel.get("定数最高的 SSS"), 2);
    assert.equal(byLabel.get("差一点 SSS"), 1);
    assert.equal(byLabel.get("差一点 SSS+"), 2);
    assert.equal(byLabel.get("压线 SSS+"), 3);
    assert.ok(![...byLabel.values()].includes(5));
  });

  it("skips rules with no match", () => {
    const h = scoreHighlights([rec(1, 12, 95)]);
    assert.ok(h.every((x) => !x.label.includes("SSS+") && !x.label.includes("AP")));
  });
});
