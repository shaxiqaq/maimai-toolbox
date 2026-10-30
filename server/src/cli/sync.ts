/** Force-refresh all upstream sources and print a catalog summary. Usage: pnpm sync */
import { getCatalog, rebuildCatalog } from "../catalog";
import { syncSources } from "../sources";

const result = await syncSources(true);
console.log(result);
if (!rebuildCatalog()) {
  console.error("Catalog not built: some sources have never been fetched.");
  process.exit(1);
}
const { catalog } = getCatalog()!;
const unmatched = catalog.songs.filter((s) => s.type !== "UTAGE" && s.lxnsId == null);
console.log(
  `songs=${catalog.songs.length} new=${catalog.songs.filter((s) => s.isNew).length}`,
  `withAliases=${catalog.songs.filter((s) => s.aliases.length).length}`,
  `withStats=${catalog.songs.filter((s) => s.charts.some((c) => c.stats)).length}`,
  `unmatchedLxns=${unmatched.length}`,
);
console.log("versions:", catalog.versions.join(" → "));
