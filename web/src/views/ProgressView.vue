<script setup lang="ts">
import {
  allCharts,
  DIFFICULTY_NAMES,
  DISTRIBUTION_BUCKETS,
  levelDistribution,
  progressFor,
  RANK_LABELS,
  recordKey,
  type DistributionBucket,
  type Goal,
} from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import LevelPill from "@/components/LevelPill.vue";
import NeedsScores from "@/components/NeedsScores.vue";
import SongJacket from "@/components/SongJacket.vue";
import { useCatalogStore } from "@/stores/catalog";
import { usePlayerStore } from "@/stores/player";

const player = usePlayerStore();
const catalog = useCatalogStore();

const charts = computed(() => (catalog.catalog ? allCharts(catalog.catalog.songs) : []));

// ---- Level distribution ----
const LEVEL_ORDER = (a: string, b: string) => parseFloat(a) - parseFloat(b) || a.length - b.length;
const levels = computed(() => [...new Set(charts.value.map((c) => c.chart.level))].sort(LEVEL_ORDER));
const level = ref("");
watch(
  () => player.scores,
  (scores) => {
    if (level.value || !scores?.records.length) return;
    // Default to the highest level the player has meaningful play on.
    const counts = new Map<string, number>();
    for (const r of scores.records) counts.set(r.level, (counts.get(r.level) ?? 0) + 1);
    level.value = [...counts].filter(([, n]) => n >= 5).map(([l]) => l).sort(LEVEL_ORDER).pop() ?? "";
  },
  { immediate: true },
);
const dist = computed(() =>
  levelDistribution(
    charts.value.filter((c) => c.chart.level === level.value),
    player.records,
  ),
);
const BUCKET_LABELS: Record<DistributionBucket, string> = {
  sssp: RANK_LABELS.sssp,
  sss: RANK_LABELS.sss,
  ssp: RANK_LABELS.ssp,
  ss: RANK_LABELS.ss,
  sp: RANK_LABELS.sp,
  s: RANK_LABELS.s,
  below: "S 以下",
  none: "未游玩",
};

// ---- Version completion ----
const GOALS: { id: string; label: string; goal: Goal }[] = [
  { id: "clear", label: "完成（80%）", goal: { kind: "clear" } },
  { id: "s", label: "S", goal: { kind: "rank", rank: "s" } },
  { id: "sss", label: "SSS", goal: { kind: "rank", rank: "sss" } },
  { id: "sssp", label: "SSS+", goal: { kind: "rank", rank: "sssp" } },
  { id: "fc", label: "FC", goal: { kind: "combo", combo: "fc" } },
  { id: "ap", label: "AP", goal: { kind: "combo", combo: "ap" } },
  { id: "fs", label: "FS", goal: { kind: "sync", sync: "fs" } },
  { id: "fsd", label: "FDX", goal: { kind: "sync", sync: "fsd" } },
];
const goalId = ref("sss");
const includeReMaster = ref(false);
const openVersion = ref<string | null>(null);

const goal = computed(() => GOALS.find((g) => g.id === goalId.value)!.goal);

const byVersion = computed(() => {
  const scoped = charts.value.filter((c) => includeReMaster.value || c.chart.difficulty !== 4);
  return [...(catalog.catalog?.versions ?? [])].reverse().map((version) => {
    const inVersion = scoped.filter((c) => c.song.version === version);
    const perDifficulty = DIFFICULTY_NAMES.map((_, d) => d)
      .filter((d) => includeReMaster.value || d !== 4)
      .map((d) => ({ d, ...progressFor(inVersion.filter((c) => c.chart.difficulty === d), player.records, goal.value) }));
    return { version, ...progressFor(inVersion, player.records, goal.value), perDifficulty };
  });
});

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 1000) / 10 : 0);

onMounted(() => {
  void catalog.load();
  void player.restore();
});
</script>

<template>
  <main class="page">
    <NeedsScores v-if="!player.scores" feature="完成度" />

    <template v-else>
      <section class="card block">
        <header class="block-head">
          <h2>等级分布</h2>
          <select v-model="level" class="field small">
            <option v-for="l in levels" :key="l" :value="l">Lv {{ l }}</option>
          </select>
        </header>
        <p class="muted sub">
          共 {{ dist.total }} 张谱面 · FC {{ dist.fc }} · AP {{ dist.ap }}
        </p>
        <ul class="bars">
          <li v-for="b in DISTRIBUTION_BUCKETS" :key="b">
            <span class="label">{{ BUCKET_LABELS[b] }}</span>
            <span class="bar"><i :class="`b-${b}`" :style="{ width: `${pct(dist.ranks[b], dist.total)}%` }" /></span>
            <span class="num">{{ dist.ranks[b] }}</span>
          </li>
        </ul>
      </section>

      <section class="card block">
        <header class="block-head">
          <h2>版本完成度</h2>
          <select v-model="goalId" class="field small">
            <option v-for="g in GOALS" :key="g.id" :value="g.id">目标：{{ g.label }}</option>
          </select>
        </header>
        <label class="check"><input v-model="includeReMaster" type="checkbox" /> 包含 Re:Master</label>

        <ul class="versions">
          <li v-for="v in byVersion" :key="v.version">
            <button type="button" class="vrow" @click="openVersion = openVersion === v.version ? null : v.version">
              <span class="vname">{{ v.version }}</span>
              <span class="bar"><i class="b-goal" :style="{ width: `${pct(v.done, v.total)}%` }" /></span>
              <span class="num">{{ v.done }}/{{ v.total }}</span>
            </button>
            <div v-if="openVersion === v.version" class="detail">
              <div class="per-diff">
                <span v-for="p in v.perDifficulty" :key="p.d">
                  <LevelPill :difficulty="p.d" :level="DIFFICULTY_NAMES[p.d]!.slice(0, 3)" />
                  {{ p.done }}/{{ p.total }}
                </span>
              </div>
              <p v-if="!v.remaining.length" class="muted">这个版本已全部达成。</p>
              <ul v-else class="remaining">
                <li v-for="c in v.remaining.slice(0, 120)" :key="`${c.song.id}-${c.chart.difficulty}`">
                  <RouterLink :to="`/songs/${c.song.id}`" class="rem">
                    <SongJacket :song="c.song" :alt="c.song.title" :size="36" />
                    <span class="rem-title">{{ c.song.title }}</span>
                    <LevelPill :difficulty="c.chart.difficulty" :level="c.chart.level" />
                    <span class="rem-cur muted">
                      {{
                        player.records.get(recordKey(c.song.id, c.chart.difficulty))?.achievement.toFixed(4) ?? "未游玩"
                      }}
                    </span>
                  </RouterLink>
                </li>
              </ul>
              <p v-if="v.remaining.length > 120" class="muted more">还有 {{ v.remaining.length - 120 }} 张未列出</p>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.block {
  padding: 14px;
  margin-bottom: 12px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.block-head h2 {
  margin: 0;
  font-size: 16px;
}

.field.small {
  width: auto;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
}

.sub {
  margin: 4px 0 10px;
  font-size: 13px;
}

.bars,
.versions,
.remaining {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bars li,
.vrow {
  display: grid;
  grid-template-columns: 64px 1fr 56px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 3px 0;
}

.bar {
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.b-sssp,
.b-sss {
  background: var(--warn) !important;
}

.b-below {
  background: var(--text-muted) !important;
}

.b-none {
  background: var(--border) !important;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0;
  font-size: 13px;
}

.vrow {
  width: 100%;
  grid-template-columns: minmax(0, 1.4fr) 1fr 72px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}

.vname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  padding: 4px 0 12px;
}

.per-diff {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
  margin-bottom: 8px;
}

.rem {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto 84px;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.rem-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rem-cur {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.more {
  font-size: 12px;
  margin: 6px 0 0;
}
</style>
