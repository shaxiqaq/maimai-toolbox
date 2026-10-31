<script setup lang="ts">
import { DIFFICULTY_NAMES, meetsGoal, normalize, RANK_LABELS, type Goal, type PlayRecord, type RankId } from "@mt/shared";
import { computed, onMounted, reactive, ref, watch } from "vue";
import NeedsScores from "@/components/NeedsScores.vue";
import RecordCard from "@/components/RecordCard.vue";
import { useCatalogStore } from "@/stores/catalog";
import { usePlayerStore } from "@/stores/player";

const PAGE = 60;
const player = usePlayerStore();
const catalog = useCatalogStore();

type SortKey = "rating" | "achievement" | "ds";

const f = reactive({
  text: "",
  level: "",
  difficulty: "" as "" | `${number}`,
  minRank: "" as "" | RankId,
  combo: "" as "" | "fc" | "ap",
  sort: "rating" as SortKey,
});
const shown = ref(PAGE);
watch(f, () => (shown.value = PAGE));

const RANK_FILTERS: RankId[] = ["sssp", "sss", "ssp", "ss", "s"];

const all = computed<PlayRecord[]>(() => player.scores?.records ?? []);

const levels = computed(() =>
  [...new Set(all.value.map((r) => r.level))].sort((a, b) => parseFloat(a) - parseFloat(b) || a.length - b.length),
);

const filtered = computed(() => {
  const q = normalize(f.text);
  const goals: Goal[] = [];
  if (f.minRank) goals.push({ kind: "rank", rank: f.minRank });
  if (f.combo) goals.push({ kind: "combo", combo: f.combo });
  const list = all.value.filter((r) => {
    if (r.type === "UTAGE") return false;
    if (f.level && r.level !== f.level) return false;
    if (f.difficulty && r.difficulty !== Number(f.difficulty)) return false;
    if (q) {
      const song = catalog.getSong(r.songId);
      const hay = [r.title, ...(song?.aliases ?? [])].map(normalize);
      if (!hay.some((h) => h.includes(q))) return false;
    }
    return goals.every((g) => meetsGoal(r, g));
  });
  const key = f.sort;
  return list.sort((a, b) => b[key] - a[key] || b.rating - a.rating);
});

onMounted(() => {
  void catalog.load();
  void player.restore();
});
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>成绩</h1>
      <p>全部成绩列表，可按难度、评级、FC/FS 筛选</p>
    </header>
    <NeedsScores v-if="!player.scores" feature="成绩列表" />

    <template v-else>
      <header class="head">
        <h1>{{ player.scores.nickname }} 的成绩</h1>
        <span class="muted">共 {{ all.length }} 条，筛选后 {{ filtered.length }} 条</span>
      </header>

      <div class="filters">
        <input v-model.trim="f.text" class="field" type="search" placeholder="曲名或别名" />
        <select v-model="f.level" class="field">
          <option value="">全部等级</option>
          <option v-for="l in levels" :key="l" :value="l">{{ l }}</option>
        </select>
        <select v-model="f.difficulty" class="field">
          <option value="">全部难度</option>
          <option v-for="(n, i) in DIFFICULTY_NAMES" :key="n" :value="String(i)">{{ n }}</option>
        </select>
        <select v-model="f.minRank" class="field">
          <option value="">任意评级</option>
          <option v-for="r in RANK_FILTERS" :key="r" :value="r">{{ RANK_LABELS[r] }} 及以上</option>
        </select>
        <select v-model="f.combo" class="field">
          <option value="">任意连击</option>
          <option value="fc">FC 及以上</option>
          <option value="ap">AP 及以上</option>
        </select>
        <select v-model="f.sort" class="field">
          <option value="rating">按单曲 Rating</option>
          <option value="achievement">按达成率</option>
          <option value="ds">按定数</option>
        </select>
      </div>

      <ul class="grid">
        <li v-for="(r, i) in filtered.slice(0, shown)" :key="`${r.songId}-${r.difficulty}`">
          <RecordCard :record="r" :index="i" />
        </li>
      </ul>
      <p v-if="!filtered.length" class="state muted">没有符合条件的成绩</p>
      <button v-if="shown < filtered.length" class="more" type="button" @click="shown += PAGE">
        再显示 {{ Math.min(PAGE, filtered.length - shown) }} 条
      </button>
    </template>
  </main>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 10px;
}

.head h1 {
  font-size: 20px;
  margin: 0;
}

.head span {
  font-size: 13px;
}

.filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.filters input {
  grid-column: 1 / -1;
}

@media (min-width: 720px) {
  .filters {
    grid-template-columns: 2fr repeat(5, minmax(0, 1fr));
  }

  .filters input {
    grid-column: auto;
  }
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.state {
  text-align: center;
  padding: 24px 0;
}

.more {
  display: block;
  margin: 16px auto 0;
  padding: 8px 20px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
}
</style>
