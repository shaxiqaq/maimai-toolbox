import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NoteCounts } from "./catalog";
import { achievementForRating, computeAchievement, judgementLoss, tolerance, validateJudgements } from "./calculator";
import { chartRating } from "./rating";

// W = 500×1 + 100×2 + 50×3 + 0 + 30×5 = 1000, so one TAP is worth exactly 0.1%.
const notes: NoteCounts = { tap: 500, hold: 100, slide: 50, touch: 0, break: 30, total: 680 };

describe("judgementLoss", () => {
  it("scales by note weight", () => {
    assert.ok(Math.abs(judgementLoss(notes, "tap", "great") - 0.02) < 1e-12);
    assert.ok(Math.abs(judgementLoss(notes, "slide", "miss") - 0.3) < 1e-12);
  });

  it("adds the BREAK bonus share", () => {
    // base unit 0.5%, bonus share 1/30 %
    assert.ok(Math.abs(judgementLoss(notes, "break", "perfectHigh") - 0.25 / 30) < 1e-12);
    assert.ok(Math.abs(judgementLoss(notes, "break", "greatLow") - (0.25 + 0.6 / 30)) < 1e-12);
    assert.ok(Math.abs(judgementLoss(notes, "break", "miss") - (0.5 + 1 / 30)) < 1e-12);
  });
});

describe("computeAchievement", () => {
  it("is 101 for an all-critical play", () => {
    assert.equal(computeAchievement(notes, { tap: {}, hold: {}, slide: {}, touch: {}, break: {} }).achievement, 101);
  });

  it("subtracts losses and truncates to 4 decimals", () => {
    const r = computeAchievement(notes, { tap: { great: 10 }, hold: {}, slide: {}, touch: {}, break: { perfectLow: 3 } }, 14.0);
    // 101 − 10×0.02 − 3×(0.5/30) = 100.75
    assert.equal(r.achievement, 100.75);
    assert.equal(r.rank, "sssp");
    assert.equal(r.rating, chartRating(14.0, 100.5));
  });

  it("never goes below 0", () => {
    assert.equal(computeAchievement(notes, { tap: { miss: 500 }, hold: { miss: 100 }, slide: { miss: 50 }, touch: {}, break: { miss: 30 } }).achievement, 0);
  });

  it("ignores blank or negative form values", () => {
    const j = { tap: { great: "" as unknown as number, good: -3 }, hold: {}, slide: {}, touch: {}, break: {} };
    assert.equal(computeAchievement(notes, j).achievement, 101);
    assert.deepEqual(validateJudgements(notes, j), []);
  });

  it("flags impossible counts", () => {
    assert.equal(validateJudgements(notes, { tap: { great: 400, good: 200 }, hold: {}, slide: {}, touch: {}, break: {} }).length, 1);
  });
});

describe("tolerance", () => {
  it("counts how many of each judgement still reach the target", () => {
    const rows = tolerance(notes, 100.5);
    const get = (kind: string, judge: string) => rows.find((r) => r.kind === kind && r.judge === judge)!.allowed;
    assert.equal(get("tap", "great"), 25); // 0.5 / 0.02
    assert.equal(get("tap", "miss"), 5); // 0.5 / 0.1
    assert.equal(get("break", "perfectHigh"), 30, "capped at the number of BREAKs (60 would fit)");
    assert.equal(rows.some((r) => r.kind === "touch"), false, "kinds the chart lacks are skipped");
  });
});

describe("achievementForRating", () => {
  it("finds the lowest achievement for a rating", () => {
    const a = achievementForRating(13.0, 280)!;
    assert.equal(chartRating(13.0, a), 280);
    assert.ok(chartRating(13.0, a - 0.0001) < 280);
    assert.equal(a, 100); // 13 × 21.6 = 280.8; just under 100 uses 21.4 or lower
  });

  it("returns null when even SSS+ is not enough", () => {
    assert.equal(achievementForRating(12.0, 300), null);
  });
});
