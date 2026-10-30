<script setup lang="ts">
import {
  chartPreviewUrl,
  constantChanges,
  DIFFICULTY_NAMES,
  fetchConstantsAt,
  popularityRanks,
  songPlayCount,
  type ConstantChange,
} from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import FavoriteButton from "@/components/FavoriteButton.vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { cachedJson } from "@/data/cachedJson";
import { useCatalogStore } from "@/stores/catalog";

const props = defineProps<{ id: string }>();
const store = useCatalogStore();
onMounted(() => void store.load());

const song = computed(() => store.getSong(Number(props.id)));
const isUtage = computed(() => song.value?.type === "UTAGE");

const ranks = computed(() => (store.catalog ? popularityRanks(store.catalog.songs) : new Map<number, number>()));
const popularity = computed(() =>
  song.value && !isUtage.value ? { rank: ranks.value.get(song.value.id), plays: songPlayCount(song.value) } : null,
);

// ---- Constant history: one LXNS request per DX-era version, so it is loaded on demand and cached. ----
const HISTORY_MAX_AGE = 7 * 86400_000;
const FIRST_DX_VERSION = 20000;
const history = ref<ConstantChange[] | null>(null);
const historyState = ref<"idle" | "loading" | "error">("idle");
const historyDone = ref(0);
const historyTotal = computed(() => store.catalog?.gameVersions.filter((v) => v.version >= FIRST_DX_VERSION).length ?? 0);
const canLoadHistory = computed(() => !!song.value?.lxnsId && !isUtage.value && historyTotal.value > 0);

async function loadHistory() {
  const s = song.value;
  if (!s?.lxnsId || !store.catalog) return;
  const versions = store.catalog.gameVersions.filter((v) => v.version >= FIRST_DX_VERSION);
  const chartType = s.type === "DX" ? "dx" : "standard";
  historyState.value = "loading";
  historyDone.value = 0;
  try {
    const snapshots = await cachedJson(`/__history/${s.lxnsId}-${chartType}-${versions.length}`, HISTORY_MAX_AGE, async () => {
      const out = [];
      for (const version of versions) {
        // Sequential with a short gap keeps us well under LXNS's rate limit.
        out.push({ version, constants: await fetchConstantsAt(s.lxnsId!, chartType, version.version) });
        historyDone.value++;
        await new Promise((r) => setTimeout(r, 250));
      }
      return out;
    });
    if (song.value?.id !== s.id) return;
    history.value = constantChanges(snapshots);
    historyState.value = "idle";
  } catch {
    if (song.value?.id === s.id) historyState.value = "error";
  }
}

watch(
  () => props.id,
  () => {
    history.value = null;
    historyState.value = "idle";
  },
);

function fmt(n: number, digits: number): string {
  return n.toFixed(digits);
}
</script>

<template>
  <main class="page">
    <RouterLink to="/songs" class="back muted">← 曲库</RouterLink>

    <p v-if="store.error" class="state">加载失败：{{ store.error }}</p>
    <p v-else-if="!store.catalog" class="state muted">正在加载…</p>
    <p v-else-if="!song" class="state muted">找不到 ID 为 {{ id }} 的曲目</p>

    <template v-else>
      <section class="card head">
        <SongJacket :song="song" :alt="song.title" :size="120" />
        <div class="meta">
          <h1>{{ song.title }}</h1>
          <p class="muted">{{ song.artist }}</p>
          <div class="badges">
            <span class="badge" :class="song.type.toLowerCase()">{{ isUtage ? "宴" : song.type }}</span>
            <span v-if="song.isNew" class="badge new">新曲（计入 B15）</span>
          </div>
          <div class="actions">
            <FavoriteButton :song-id="song.id" />
            <a
              :href="chartPreviewUrl(song)"
              target="_blank"
              rel="noopener noreferrer"
              class="preview"
              title="在 DXRating 选择难度后可看 YouTube / Bilibili 谱面确认视频"
            >
              ▶ 谱面确认 ↗
            </a>
          </div>
          <dl>
            <dt>ID</dt><dd>{{ song.id }}</dd>
            <dt>BPM</dt><dd>{{ song.bpm }}</dd>
            <dt>分类</dt><dd>{{ song.genre }}</dd>
            <dt>版本</dt><dd>{{ song.version }}</dd>
            <dt v-if="song.releaseDate">日期</dt><dd v-if="song.releaseDate">{{ song.releaseDate }}</dd>
            <template v-if="popularity?.rank">
              <dt>热度</dt>
              <dd title="按水鱼查分器用户上传的游玩记录数排名">第 {{ popularity.rank }} 名 · {{ popularity.plays }} 条记录</dd>
            </template>
          </dl>
        </div>
      </section>

      <section v-if="song.aliases.length" class="block">
        <h2>别名</h2>
        <div class="aliases">
          <span v-for="a in song.aliases" :key="a" class="chip">{{ a }}</span>
        </div>
      </section>

      <section class="block">
        <h2>谱面</h2>
        <div class="charts">
          <article v-for="c in song.charts" :key="c.difficulty" class="card chart">
            <header>
              <LevelPill :difficulty="c.difficulty" :level="c.level" :utage="isUtage" />
              <strong>{{ isUtage ? "宴" : DIFFICULTY_NAMES[c.difficulty] }}</strong>
              <span class="ds">定数 {{ fmt(c.ds, 1) }}</span>
            </header>
            <div class="stats">
              <div>
                <span class="muted">拟合定数</span>
                <b>{{ c.stats ? fmt(c.stats.fitDiff, 2) : "—" }}</b>
              </div>
              <div>
                <span class="muted">平均达成</span>
                <b>{{ c.stats ? `${fmt(c.stats.avgAchievement, 2)}%` : "—" }}</b>
              </div>
              <div>
                <span class="muted">样本</span>
                <b>{{ c.stats ? c.stats.count : "—" }}</b>
              </div>
            </div>
            <div class="notes muted">
              物量 {{ c.notes.total }} · TAP {{ c.notes.tap }} · HOLD {{ c.notes.hold }} · SLIDE {{ c.notes.slide }}
              <template v-if="song.type !== 'SD'"> · TOUCH {{ c.notes.touch }}</template>
              · BREAK {{ c.notes.break }}
            </div>
            <div v-if="c.charter && c.charter !== '-'" class="charter muted">谱师：{{ c.charter }}</div>
          </article>
        </div>
      </section>

      <section v-if="canLoadHistory" class="block">
        <h2>定数变化</h2>
        <button v-if="!history && historyState !== 'loading'" type="button" class="load" @click="loadHistory">
          {{ historyState === "error" ? "加载失败，重试" : "查看各版本定数" }}
        </button>
        <p v-else-if="historyState === 'loading'" class="muted small">正在读取落雪各版本数据… {{ historyDone }}/{{ historyTotal }}</p>
        <template v-if="history">
          <p v-if="history.length <= 1" class="muted small">自 DX 以来定数没有变化。</p>
          <div class="table-wrap">
            <table class="history">
              <thead>
                <tr>
                  <th>版本</th>
                  <th v-for="(name, d) in DIFFICULTY_NAMES" :key="d">{{ name.slice(0, 3) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(h, i) in [...history].reverse()" :key="h.version.version">
                  <td class="ver">{{ h.version.title }}</td>
                  <td
                    v-for="(_, d) in DIFFICULTY_NAMES"
                    :key="d"
                    :class="{ moved: i !== history.length - 1 && h.changed.includes(d) }"
                  >
                    {{ h.constants[d] !== undefined ? fmt(h.constants[d]!, 1) : "" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="muted small">高亮为该版本变动的定数。数据来自落雪查分器。</p>
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 12px;
  font-size: 14px;
}

.state {
  text-align: center;
  padding: 32px 0;
}

.head {
  display: flex;
  gap: 16px;
  padding: 16px;
}

.meta {
  min-width: 0;
}

.meta h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.meta p {
  margin: 2px 0 6px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.preview {
  display: inline-block;
  padding: 4px 12px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 8px 0 0;
  font-size: 13px;
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.block h2 {
  font-size: 15px;
  margin: 20px 0 8px;
}

.aliases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 13px;
}

.charts {
  display: grid;
  gap: 8px;
}

.chart {
  padding: 12px;
}

.chart header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ds {
  margin-left: auto;
  font-weight: 600;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 10px 0 6px;
}

.stats div {
  display: flex;
  flex-direction: column;
  font-size: 12px;
}

.stats b {
  font-size: 15px;
}

.load {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
}

.small {
  font-size: 12px;
}

.table-wrap {
  overflow-x: auto;
}

.history {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.history th,
.history td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  text-align: right;
  white-space: nowrap;
}

.history .ver,
.history th:first-child {
  text-align: left;
  white-space: normal;
}

.history .moved {
  color: var(--accent);
  font-weight: 700;
}

.notes,
.charter {
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
