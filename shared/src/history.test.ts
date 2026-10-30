import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { constantChanges, fetchConstantsAt } from "./history";

afterEach(() => mock.restoreAll());

const v = (version: number) => ({ version, title: `v${version}` });

describe("constantChanges", () => {
  it("keeps the first appearance and only versions where a constant moved", () => {
    const rows = constantChanges([
      { version: v(22000), constants: [5, 7, 10, 12.4] },
      { version: v(20000), constants: null }, // song not out yet
      { version: v(23000), constants: [5, 7, 10, 12.4] }, // unchanged
      { version: v(24000), constants: [5, 7, 10.2, 12.6, 13.9] }, // Expert + Master moved, Re:Master added
      { version: v(25000), constants: [5, 7, 10.2, 12.6, 13.9] },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.version.version, r.changed]),
      [
        [22000, [0, 1, 2, 3]],
        [24000, [2, 3, 4]],
      ],
    );
  });
});

describe("fetchConstantsAt", () => {
  it("returns constants by difficulty for the chart type, or null on 404", async () => {
    mock.method(globalThis, "fetch", async (url: string) =>
      url.includes("version=20000")
        ? new Response("{}", { status: 404 })
        : Response.json({
            difficulties: {
              standard: [],
              dx: [
                { difficulty: 3, level_value: 13.7 },
                { difficulty: 0, level_value: 7 },
              ],
            },
          }),
    );
    assert.equal(await fetchConstantsAt(1663, "dx", 20000), null);
    const c = await fetchConstantsAt(1663, "dx", 24000);
    assert.equal(c![0], 7);
    assert.equal(c![3], 13.7);
    assert.equal(await fetchConstantsAt(1663, "standard", 24000), null, "no charts of that type");
  });
});
