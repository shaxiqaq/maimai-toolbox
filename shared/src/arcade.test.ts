import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { arcadeRegions, arcadesNearby, toArcade, type NcShop } from "./arcade";
import { ProberError } from "./probers";

afterEach(() => mock.restoreAll());

const shop = (over: Record<string, unknown> = {}): NcShop =>
  ({
    id: 1,
    name: "测试机厅",
    distance: 1.234,
    isOpen: true,
    location: { coordinates: [121.47, 31.23] },
    address: {
      detailed: "人民大道 1 号",
      region: [
        { id: "CN", name: "China" },
        { id: "CN-31", name: "上海市" },
        { id: "CN-310101", name: "黄浦区" },
      ],
    },
    openingHours: [[{ hour: 10, minute: 0 }, { hour: 24, minute: 0 }]],
    games: [
      { titleId: 1, version: "CN1.56", quantity: 2, cost: "2币", comment: "" },
      { titleId: 15, version: "x", quantity: 1 },
    ],
    currentReportedAttendance: 3,
    ...over,
  }) as unknown as NcShop;

describe("toArcade", () => {
  it("keeps only maimai DX machines and flattens the address", () => {
    const a = toArcade(shop())!;
    assert.equal(a.address, "上海市 黄浦区 人民大道 1 号");
    assert.deepEqual(a.machines, [{ version: "CN1.56", quantity: 2, cost: "2币", comment: "" }]);
    assert.deepEqual(a.openingHours, [["10:00", "24:00"]]);
    assert.equal(a.attendance, 3);
  });

  it("drops shops without maimai DX", () => {
    assert.equal(toArcade(shop({ games: [{ titleId: 15 }] })), null);
  });
});

describe("arcadesNearby", () => {
  it("rounds coordinates before they leave the device and sorts by distance", async () => {
    let requested = "";
    mock.method(globalThis, "fetch", async (url: string) => {
      requested = url;
      return Response.json({ shops: [shop({ id: 2, distance: 5 }), shop({ id: 3, distance: 0.5 }), shop({ id: 4, games: [] })] });
    });
    const list = await arcadesNearby(31.2304123, 121.4737456);
    const params = new URL(requested).searchParams;
    assert.equal(params.get("latitude"), "31.23");
    assert.equal(params.get("longitude"), "121.474");
    assert.equal(params.get("convertFrom"), "gps");
    assert.deepEqual(list.map((a) => a.id), [3, 2]);
  });

  it("rejects bad region ids", async () => {
    await assert.rejects(arcadeRegions("../x"), (e) => e instanceof ProberError && e.status === 400);
  });
});
