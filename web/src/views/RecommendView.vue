<script setup lang="ts">
import {
  allCharts,
  RANK_LABELS,
  recommend,
  sortSuggestions,
  suggestedDsFloor,
  summarizeB50,
  type SuggestionSort,
} from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { useCatalogStore } from "@/stores/catalog";
import { usePlayerStore } from "@/stores/player";

const LIMIT = 50;
const player = usePlayerStore();
const catalog = useCatalogStore();

const dsMin = ref(0);
const dsMax = ref(0);
const sort = ref<SuggestionSort>("easiest");
const list = ref<"all" | "b35" | "b15">("all");

const summary = computed(() => (player.b50 ? summarizeB50(player.b50.b35, player.b50.b15) : null));

// Default range: from the lowest constant whose SSS+ beats the lower of the two floors, up 1.5 levels.
watch(
  summary,
  (s) => {
    if (!s || dsMin.value) return;
    const floor = Math.min(s.b35Floor || Infinity, s.b15Floor || Infinity);
    dsMin.value = Number.isFinite(floor) ? suggestedDsFloor(floor) : 12;
    dsMax.value = Math.min(15, Math.round((dsMin.value + 1.5) * 10) / 10);
  },
  { immediate: true },
);

const suggestions = computed(() => {
  if (!player.b50 || !catalog.catalog) return [];
  const raw = recommend({
    charts: allCharts(catalog.catalog.songs),
    records: player.records,
    b35: player.b50.b35,
    b15: player.b50.b15,
    dsMin: dsMin.value,
    dsMax: dsMax.value,
  });
  return sortSuggestions(
    raw.filter((s) => list.value === "all" || s.list === list.value),
    sort.value,
  );
});

onMounted(() => {
  void catalog.load();
  void player.restore();
});
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>上分推荐</h1>
      <p>按你的 B50 底分，找出最容易推分的谱面</p>
    </header>
    <section v-if="!player.b50" class="card needs">
      <p v-if="player.loading" class="muted">正在加载成绩…</p>
      <template v-else>
        <p>先在 B50 页查询一次成绩，这里会据此推荐上分谱面。</p>
        <RouterLink to="/b50" class="go">去 B50 页 →</RouterLink>
      </template>
    </section>

    <template v-else>
      <section class="card controls">
        <p v-if="!player.scores" class="note muted">
          当前是水鱼 B50 数据，只知道 B50 内的成绩，其他谱面按未游玩估算。用落雪密钥查询可以得到更准确的推荐。
        </p>
        <div class="row">
          <label>定数
            <input v-model.number="dsMin" class="field num" type="number" step="0.1" min="1" max="15" />
            –
            <input v-model.number="dsMax" class="field num" type="number" step="0.1" min="1" max="15" />
          </label>
          <select v-model="list" class="field small">
            <option value="all">B35 + B15</option>
            <option value="b35">只看旧版本（B35）</option>
            <option value="b15">只看新版本（B15）</option>
          </select>
          <select v-model="sort" class="field small">
            <option value="easiest">按最容易达成</option>
            <option value="gain">按加分最多</option>
          </select>
        </div>
        <p v-if="summary" class="muted sub">
          B35 底分 {{ summary.b35Floor || "—" }} · B15 底分 {{ summary.b15Floor || "—" }} ·
          找到 {{ suggestions.length }} 张能加分的谱面{{ suggestions.length > LIMIT ? `，显示前 ${LIMIT} 张` : "" }}
        </p>
      </section>

      <ul class="list">
        <li v-for="s in suggestions.slice(0, LIMIT)" :key="`${s.song.id}-${s.chart.difficulty}`">
          <RouterLink :to="`/songs/${s.song.id}`" class="card item">
            <SongJacket :song="s.song" :alt="s.song.title" :size="52" />
            <div class="body">
              <div class="title">{{ s.song.title }}</div>
              <div class="line">
                <LevelPill :difficulty="s.chart.difficulty" :level="s.chart.level" />
                <b>{{ s.chart.ds.toFixed(1) }}</b>
                <span class="badge">{{ s.list === "b15" ? "B15" : "B35" }}</span>
                <span v-if="s.easiness != null" class="muted" :title="`拟合定数 ${s.chart.stats!.fitDiff.toFixed(2)}`">
                  {{ s.easiness > 0.05 ? "偏简单" : s.easiness < -0.05 ? "偏难" : "适中" }}
                </span>
              </div>
              <div class="line muted">
                现在 {{ s.current ? `${s.current.achievement.toFixed(4)}%` : "未游玩" }} → 目标
                <b class="target">{{ RANK_LABELS[s.targetRank] }}（{{ s.targetAchievement }}%）</b>
              </div>
            </div>
            <div class="gain">
              <span class="muted">+Rating</span>
              <b>{{ s.gain }}</b>
            </div>
          </RouterLink>
        </li>
      </ul>
      <p v-if="!suggestions.length" class="state muted">这个定数范围内没有能加分的谱面，试试调高上限。</p>
    </template>
  </main>
</template>

<style scoped>
.needs {
  padding: 16px;
  text-align: center;
}

.go {
  color: var(--accent);
  font-weight: 600;
}

.controls {
  padding: 12px;
  margin-bottom: 12px;
  display: grid;
  gap: 8px;
}

.note,
.sub {
  margin: 0;
  font-size: 12px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.row label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.field.num {
  width: 72px;
  min-height: 32px;
  padding: 4px 8px;
}

.field.small {
  width: auto;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
}

.item:hover {
  border-color: var(--accent);
}

.body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}

.target {
  color: var(--accent);
}

.gain {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 11px;
}

.gain b {
  font-size: 20px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.state {
  text-align: center;
  padding: 24px 0;
}
</style>
