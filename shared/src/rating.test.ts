import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chartRating, dxStars, minAchievementFor, rankOf } from "./rating";

describe("chartRating", () => {
  it("caps achievement at 100.5 and uses 22.4 for SSS+", () => {
    assert.equal(chartRating(14.0, 100.5), 315); // 14.0 × 22.512 = 315.168
    assert.equal(chartRating(14.0, 101), 315);
  });

  it("uses integer math so exact boundaries are not truncated", () => {
    assert.equal(chartRating(13.0, 100.0), 280); // 13 × 21.6 = 280.8
    assert.equal(chartRating(12.7, 99.5), 266); // 12.7 × 21.1 × 0.995 = 266.62
    assert.equal(chartRating(15.0, 100.5), 337); // 15 × 22.512 = 337.68
  });

  it("applies the two just-below-boundary factors", () => {
    assert.equal(chartRating(14.0, 100.4999), 312); // 14 × 22.2 × 1.004999 = 312.35
    assert.equal(chartRating(14.0, 99.9999), 299); // 14 × 21.4 × 0.999999 = 299.59
    assert.equal(chartRating(14.0, 100.4998), 303); // back to 21.6: 14 × 21.6 × 1.004998 = 303.91
  });

  it("drops through the lower ranks", () => {
    assert.equal(chartRating(10.0, 97.0), 194); // 10 × 20.0 × 0.97
    assert.equal(chartRating(10.0, 96.9999), 162); // 10 × 16.8 × 0.969999 = 162.96
    assert.equal(chartRating(10.0, 49.9), 0);
  });
});

describe("rankOf", () => {
  it("maps boundaries", () => {
    assert.equal(rankOf(100.5), "sssp");
    assert.equal(rankOf(100.4999), "sss");
    assert.equal(rankOf(100), "sss");
    assert.equal(rankOf(99.9999), "ssp");
    assert.equal(rankOf(97), "s");
    assert.equal(rankOf(96.9999), "aaa");
    assert.equal(rankOf(0), "d");
  });

  it("is immune to float noise", () => {
    assert.equal(rankOf(100.49999999999), "sssp");
    assert.equal(rankOf(0.1 + 0.2 + 99.7), "sss");
  });
});

describe("minAchievementFor", () => {
  it("returns the lowest achievement of a rank", () => {
    assert.equal(minAchievementFor("sss"), 100);
    assert.equal(minAchievementFor("ssp"), 99.5);
    assert.equal(minAchievementFor("sssp"), 100.5);
  });
});

describe("dxStars", () => {
  it("uses 97/95/93/90/85% of the max DX score", () => {
    assert.equal(dxStars(2910, 1000), 5); // 2910 / 3000 = 97%
    assert.equal(dxStars(2909, 1000), 4);
    assert.equal(dxStars(2550, 1000), 1); // 85%
    assert.equal(dxStars(2549, 1000), 0);
    assert.equal(dxStars(100, 0), 0);
  });
});
