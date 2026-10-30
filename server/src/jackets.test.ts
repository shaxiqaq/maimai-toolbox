import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, mock } from "node:test";

// Point the cache at a throwaway directory before the module reads its config.
const dataDir = mkdtempSync(join(tmpdir(), "mt-jackets-"));
process.env.DATA_DIR = dataDir;
const { getJacket, parseJacketId } = await import("./jackets");

afterEach(() => mock.restoreAll());

describe("getJacket", () => {
  it("downloads once, then serves from disk; concurrent requests share one download", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls++;
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    });
    const [a, b] = await Promise.all([getJacket(42), getJacket(42)]);
    assert.deepEqual([...a!], [137, 80, 78, 71]);
    assert.deepEqual([...b!], [...a!]);
    assert.equal(calls, 1);
    assert.ok(existsSync(join(dataDir, "jackets", "42.png")));

    await getJacket(42);
    assert.equal(calls, 1, "second request is served from disk");
  });

  it("returns null for a missing jacket and does not cache it", async () => {
    mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
    assert.equal(await getJacket(999999), null);
    assert.equal(existsSync(join(dataDir, "jackets", "999999.png")), false);
  });
});

describe("parseJacketId", () => {
  it("accepts numeric ids with or without .png and rejects anything else", () => {
    assert.equal(parseJacketId("834.png"), 834);
    assert.equal(parseJacketId("834"), 834);
    assert.equal(parseJacketId("../etc/passwd"), null);
    assert.equal(parseJacketId("1.png.exe"), null);
  });
});
