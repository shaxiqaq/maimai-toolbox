<script setup lang="ts">
import { allCharts, DIFFICULTY_NAMES, recordKey, type ChartRef, type SongType } from "@mt/shared";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { useCatalogStore } from "@/stores/catalog";
import { usePlayerStore } from "@/stores/player";

const SPIN_MS = 1200;
const TICK_MS = 80;
const HISTORY = 5;

const catalog = useCatalogStore();
const player = usePlayerStore();

const f = reactive({
  dsMin: 12.0,
  dsMax: 13.5,
  difficulties: [3, 4] as number[],
  type: "" as SongType | "",
  genre: "",
  version: "",
  count: 1,
  skipSsspPlus: false,
});

const pool = computed<ChartRef[]>(() => {
  if (!catalog.catalog) return [];
  return allCharts(catalog.catalog.songs).filter(({ song, chart }) => {
    if (chart.ds < f.dsMin || chart.ds > f.dsMax) return false;
    if (!f.difficulties.includes(chart.difficulty)) return false;
    if (f.type && song.type !== f.type) return false;
    if (f.genre && song.genre !== f.genre) return false;
    if (f.version && song.version !== f.version) return false;
    if (f.skipSsspPlus && (player.records.get(recordKey(song.id, chart.difficulty))?.achievement ?? 0) >= 100.5) return false;
    return true;
  });
});

function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % n;
}

/** Draw `k` distinct charts. */
function draw(k: number): ChartRef[] {
  const left = [...pool.value];
  const out: ChartRef[] = [];
  while (out.length < k && left.length) out.push(left.splice(randomIndex(left.length), 1)[0]!);
  return out;
}

const current = ref<ChartRef[]>([]);
const history = ref<ChartRef[][]>([]);
const spinning = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

function spin() {
  if (spinning.value || !pool.value.length) return;
  spinning.value = true;
  const started = performance.now();
  timer = setInterval(() => {
    current.value = draw(f.count);
    if (performance.now() - started >= SPIN_MS) {
      clearInterval(timer);
      spinning.value = false;
      history.value = [current.value, ...history.value].slice(0, HISTORY);
    }
  }, TICK_MS);
}

onMounted(() => {
  void catalog.load();
  void player.restore();
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <main class="page">
    <section class="card controls">
      <div class="row">
        <label>定数
          <input v-model.number="f.dsMin" class="field num" type="number" step="0.1" min="1" max="15" />
          –
          <input v-model.number="f.dsMax" class="field num" type="number" step="0.1" min="1" max="15" />
        </label>
        <label>数量
          <select v-model.number="f.count" class="field small">
            <option v-for="n in 4" :key="n" :value="n">{{ n }} 首</option>
          </select>
        </label>
      </div>
      <div class="row diffs">
        <label v-for="(name, i) in DIFFICULTY_NAMES" :key="name">
          <input v-model="f.difficulties" type="checkbox" :value="i" /> {{ name }}
        </label>
      </div>
      <div class="row">
        <select v-model="f.type" class="field small">
          <option value="">全部类型</option>
          <option value="SD">标准</option>
          <option value="DX">DX</option>
        </select>
        <select v-model="f.genre" class="field small">
          <option value="">全部分类</option>
          <option v-for="g in catalog.catalog?.genres.filter((g) => g !== '宴会場') ?? []" :key="g" :value="g">{{ g }}</option>
        </select>
        <select v-model="f.version" class="field small">
          <option value="">全部版本</option>
          <option v-for="v in [...(catalog.catalog?.versions ?? [])].reverse()" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
      <label v-if="player.scores" class="row check">
        <input v-model="f.skipSsspPlus" type="checkbox" /> 跳过已经 SSS+ 的谱面
      </label>
      <div class="row go">
        <span class="muted">候选 {{ pool.length }} 张谱面</span>
        <button type="button" class="primary" :disabled="spinning || !pool.length" @click="spin">
          {{ spinning ? "抽取中…" : "抽歌" }}
        </button>
      </div>
    </section>

    <ul v-if="current.length" class="picks" :class="{ spinning }">
      <li v-for="c in current" :key="`${c.song.id}-${c.chart.difficulty}`">
        <RouterLink :to="`/songs/${c.song.id}`" class="card pick">
          <SongJacket :song="c.song" :alt="c.song.title" :size="88" />
          <div class="pick-body">
            <div class="title">{{ c.song.title }}</div>
            <div class="muted artist">{{ c.song.artist }}</div>
            <div class="line">
              <LevelPill :difficulty="c.chart.difficulty" :level="c.chart.level" />
              <b>{{ c.chart.ds.toFixed(1) }}</b>
              <span class="badge" :class="c.song.type.toLowerCase()">{{ c.song.type }}</span>
            </div>
          </div>
        </RouterLink>
      </li>
    </ul>
    <p v-else class="state muted">设置好条件后点「抽歌」。</p>

    <section v-if="history.length > 1" class="history">
      <h2>最近抽到</h2>
      <ol>
        <li v-for="(group, i) in history.slice(1)" :key="i" class="muted">
          {{ group.map((c) => `${c.song.title}（${c.chart.level}）`).join("、") }}
        </li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
.controls {
  padding: 12px;
  display: grid;
  gap: 10px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
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
  max-width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
}

.go {
  justify-content: space-between;
}

.primary {
  padding: 8px 28px;
  border: none;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.picks {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .picks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.picks.spinning .pick {
  opacity: 0.7;
}

.pick {
  display: flex;
  gap: 12px;
  padding: 10px;
  align-items: center;
}

.pick-body {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.title {
  font-weight: 700;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artist {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.state {
  text-align: center;
  padding: 28px 0;
}

.history h2 {
  font-size: 14px;
  margin: 20px 0 6px;
}

.history ol {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
}
</style>
