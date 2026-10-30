import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { ArcadeError, nearby, parseCoords, regions, toArcade } from "./arcades";

afterEach(() => mock.restoreAll());

type NcShop = Parameters<typeof toArcade>[0];

const shop = (over: Record<string, unknown> = {}): NcShop => ({
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

describe("nearby", () => {
  it("rounds coordinates before forwarding and sorts by distance", async () => {
    let requested = "";
    mock.method(globalThis, "fetch", async (url: string) => {
      requested = url;
      return Response.json({ shops: [shop({ id: 2, distance: 5 }), shop({ id: 3, distance: 0.5 }), shop({ id: 4, games: [] })] });
    });
    const list = await nearby(31.2304123, 121.4737456);
    const params = new URL(requested).searchParams;
    assert.equal(params.get("latitude"), "31.23");
    assert.equal(params.get("longitude"), "121.474");
    assert.equal(params.get("convertFrom"), "gps");
    assert.deepEqual(list.map((a) => a.id), [3, 2]);
  });
});

describe("validation", () => {
  it("rejects bad coordinates and region ids", async () => {
    assert.equal(parseCoords("abc", "1"), null);
    assert.equal(parseCoords("91", "1"), null);
    assert.deepEqual(parseCoords("31.2", "121.4"), { lat: 31.2, lng: 121.4 });
    await assert.rejects(regions("../x"), (e) => e instanceof ArcadeError && e.status === 400);
  });
});
