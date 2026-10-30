import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog, type DfMusic, type RawSources } from "./sources";

const music = (id: string, type: "SD" | "DX", from: string, notes: number[], isNew = false): DfMusic => ({
  id,
  title: `t${id}`,
  type,
  ds: [12.5],
  level: ["12+"],
  charts: [{ notes, charter: "c" }],
  basic_info: { title: `t${id}`, artist: "a", genre: "g", bpm: 150, release_date: "", from, is_new: isNew },
});

const raw: RawSources = {
  dfMusic: [
    music("8", "SD", "maimai", [10, 2, 3, 1]),
    music("10008", "DX", "でらっくす PRiSM", [10, 2, 3, 4, 5], true),
    music("100018", "DX", "BUDDiES", [1, 1, 1, 0, 1]),
  ],
  dfStats: { charts: { "8": [{ cnt: 10, fit_diff: 12.7, avg: 99.1 }] } },
  lxSongs: {
    songs: [
      {
        id: 8,
        title: "t8",
        version: 10000,
        release_date: "2019-01-01",
        difficulties: { standard: [{ version: 10000 }], dx: [{ version: 25000 }] },
      },
    ],
  },
  lxAliases: { aliases: [{ song_id: 8, aliases: ["别名"] }] },
};

describe("buildCatalog", () => {
  const c = buildCatalog(raw);
  const byId = new Map(c.songs.map((s) => [s.id, s]));

  it("links DX ids to the LXNS base id and shares aliases between chart types", () => {
    assert.equal(byId.get(10008)!.lxnsId, 8);
    assert.deepEqual(byId.get(10008)!.aliases, ["别名"]);
    assert.equal(byId.get(100018)!.type, "UTAGE");
    assert.equal(byId.get(100018)!.lxnsId, null);
  });

  it("reads SD and DX note arrays and attaches chart stats", () => {
    assert.deepEqual(byId.get(8)!.charts[0]!.notes, { tap: 10, hold: 2, slide: 3, touch: 0, break: 1, total: 16 });
    assert.deepEqual(byId.get(10008)!.charts[0]!.notes, { tap: 10, hold: 2, slide: 3, touch: 4, break: 5, total: 24 });
    assert.equal(byId.get(8)!.charts[0]!.stats!.fitDiff, 12.7);
    assert.equal(byId.get(10008)!.charts[0]!.stats, null);
  });

  it("orders versions by the chart type's own LXNS version", () => {
    // The DX chart of an old song belongs to the newer version, so "maimai" sorts first.
    assert.deepEqual(c.versions.slice(0, 2), ["maimai", "でらっくす PRiSM"]);
  });
});
