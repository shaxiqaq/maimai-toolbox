<script setup lang="ts">
import {
  CHART_TAGS,
  chartPreviewUrl,
  chartTags,
  constantChanges,
  DIFFICULTY_NAMES,
  fetchConstantsAt,
  jacketUrl,
  popularityRanks,
  songPlayCount,
  TAG_GROUPS,
  TAG_LABELS,
  type ConstantChange,
  type TagId,
} from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import FavoriteButton from "@/components/FavoriteButton.vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { cachedJson } from "@/data/cachedJson";
import { useAuthStore } from "@/stores/auth";
import { useCatalogStore } from "@/stores/catalog";
import { useTagsStore } from "@/stores/tags";

const props = defineProps<{ id: string }>();
const store = useCatalogStore();
onMounted(() => void store.load());

const auth = useAuthStore();
const tags = useTagsStore();
onMounted(() => void tags.load());

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

// ---- Tags ----
const editing = ref<number | null>(null);
const tagError = ref<string | null>(null);
const TAGS_BY_GROUP = TAG_GROUPS.map((g) => ({ group: g, tags: CHART_TAGS.filter((t) => t.group === g) }));
const myTags = (difficulty: number) => tags.mine[Number(props.id)]?.[difficulty] ?? [];
/** Computed tags nobody has voted for yet (voted ones already show with their count). */
function autoOnly(difficulty: number) {
  const id = Number(props.id);
  const voted = new Set(chartTags(tags.counts, id, difficulty).map((v) => v.tag));
  return tags.autoFor(id, difficulty).filter((t) => !voted.has(t));
}

watch(
  () => [props.id, auth.user?.id] as const,
  ([id, uid]) => {
    editing.value = null;
    if (uid) void tags.loadMine(Number(id)).catch(() => undefined);
  },
  { immediate: true },
);

async function toggleTag(difficulty: number, tag: TagId) {
  tagError.value = null;
  try {
    await tags.toggle(Number(props.id), difficulty, tag);
  } catch (err) {
    tagError.value = (err as Error).message;
  }
}

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
      <section class="card head" :style="{ '--cover': `url(${jacketUrl(song)})` }">
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
          <article
            v-for="c in song.charts"
            :key="c.difficulty"
            class="card chart"
            :style="{ '--diff': isUtage ? 'var(--diff-utage)' : `var(--diff-${c.difficulty})` }"
          >
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
            <div v-if="!isUtage" class="tags">
              <span v-for="t in chartTags(tags.counts, song.id, c.difficulty)" :key="t.tag" class="tag" :class="{ mine: myTags(c.difficulty).includes(t.tag) }">
                {{ TAG_LABELS[t.tag] }} <b>{{ t.votes }}</b>
              </span>
              <span
                v-for="t in autoOnly(c.difficulty)"
                :key="`auto-${t}`"
                class="tag auto"
                title="按谱面数据自动判断（诈称：拟合定数明显高于定数；高物量：同等级物量前 10%；触摸 / 绝赞段：占比明显偏高）"
              >
                {{ TAG_LABELS[t] }} <b>自动</b>
              </span>
              <button v-if="auth.user" type="button" class="tag-edit" @click="editing = editing === c.difficulty ? null : c.difficulty">
                {{ editing === c.difficulty ? "完成" : "＋ 标签" }}
              </button>
              <RouterLink
                v-else-if="auth.ready && !chartTags(tags.counts, song.id, c.difficulty).length && !tags.autoFor(song.id, c.difficulty).length"
                :to="{ path: '/login', query: { next: `/songs/${song.id}` } }"
                class="tag-edit muted"
              >
                登录后打标签
              </RouterLink>
            </div>
            <div v-if="editing === c.difficulty" class="tag-picker">
              <div v-for="g in TAGS_BY_GROUP" :key="g.group" class="tag-group">
                <span class="muted">{{ g.group }}</span>
                <button
                  v-for="t in g.tags"
                  :key="t.id"
                  type="button"
                  class="tag pick"
                  :class="{ mine: myTags(c.difficulty).includes(t.id) }"
                  :aria-pressed="myTags(c.difficulty).includes(t.id)"
                  @click="toggleTag(c.difficulty, t.id)"
                >
                  {{ t.label }}
                </button>
              </div>
              <p v-if="tagError" class="tag-err">{{ tagError }}</p>
              <p class="muted small">点选你觉得这张谱面具有的特点，再点一次取消。所有人的投票会汇总显示，并用于能力雷达图。</p>
            </div>
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
  position: relative;
  overflow: hidden;
  display: flex;
  gap: 18px;
  padding: 18px;
}

/* Blurred jacket behind the header. */
.head::before {
  content: "";
  position: absolute;
  inset: -40px;
  background: var(--cover) center / cover;
  filter: blur(36px) saturate(1.4);
  opacity: 0.32;
  pointer-events: none;
}

.head > * {
  position: relative;
}

.head :deep(.jacket) {
  border-radius: 16px;
}

.meta {
  min-width: 0;
}

.meta h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
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
  font-size: 16px;
  font-weight: 800;
  margin: 22px 2px 10px;
}

.block h2::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 14px;
  margin-right: 8px;
  border-radius: 2px;
  background: var(--accent);
  vertical-align: -1px;
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
  position: relative;
  overflow: hidden;
  padding: 14px 14px 14px 18px;
}

.chart::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--diff);
}

.chart header strong {
  color: var(--diff);
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

.stats div {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.stats b {
  font-size: 16px;
  font-family: var(--font-num);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.tag {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid transparent;
  font-size: 12px;
}

.tag b {
  font-weight: 600;
  color: var(--text-muted);
}

.tag.auto {
  background: none;
  border: 1px dashed var(--border);
}

.tag.mine {
  border-color: var(--accent);
  color: var(--accent);
}

.tag-edit {
  padding: 1px 8px;
  border: 1px dashed var(--border);
  border-radius: 999px;
  background: none;
  font-size: 12px;
  cursor: pointer;
}

.tag-picker {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  display: grid;
  gap: 6px;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.tag-group > span {
  width: 3em;
}

.tag.pick {
  cursor: pointer;
}

.tag.pick.mine {
  background: var(--accent-grad);
  color: var(--accent-contrast);
}

.tag-err {
  margin: 0;
  color: var(--warn);
  font-size: 12px;
}

.tag-picker p {
  margin: 0;
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
