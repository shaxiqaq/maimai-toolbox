<script setup lang="ts">
import {
  COLLECTION_KINDS,
  COLLECTION_LABELS,
  collectibleProgress,
  collectionImageUrl,
  DIFFICULTY_NAMES,
  normalize,
  requirementLabel,
  type Collectible,
  type CollectibleProgress,
  type CollectionKind,
} from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LevelPill from "@/components/LevelPill.vue";
import { useCatalogStore } from "@/stores/catalog";
import { useCollectionsStore } from "@/stores/collections";
import { usePlayerStore } from "@/stores/player";

const PAGE = 60;
const route = useRoute();
const router = useRouter();
const store = useCollectionsStore();
const catalog = useCatalogStore();
const player = usePlayerStore();

const kind = ref<CollectionKind>(COLLECTION_KINDS.includes(route.query.kind as CollectionKind) ? (route.query.kind as CollectionKind) : "plate");
const query = ref("");
const onlyEarnable = ref(true);
const genre = ref("");
const shown = ref(PAGE);
const open = ref<number | null>(null);

const items = computed(() => store.lists[kind.value] ?? []);
const genres = computed(() => [...new Set(items.value.map((i) => i.genre).filter((g): g is string => !!g))]);
const hasScores = computed(() => !!player.scores);

interface Row {
  item: Collectible;
  progress: CollectibleProgress | null;
}

const rows = computed<Row[]>(() => {
  const q = normalize(query.value);
  const list = items.value
    .filter((i) => (!onlyEarnable.value || i.required?.length) && (!genre.value || i.genre === genre.value))
    .filter((i) => !q || normalize(`${i.name}${i.description ?? ""}`).includes(q))
    .map((item) => ({ item, progress: hasScores.value ? collectibleProgress(item, player.records) : null }));
  // With scores: closest to done first (finished ones last), so there is always something to chase.
  if (hasScores.value) {
    const ratio = (r: Row) => (r.progress ? (r.progress.complete ? -1 : r.progress.done / r.progress.total) : -2);
    list.sort((a, b) => ratio(b) - ratio(a));
  }
  return list;
});

const summary = computed(() => {
  const withProgress = rows.value.filter((r) => r.progress);
  return { complete: withProgress.filter((r) => r.progress!.complete).length, total: withProgress.length };
});

const COLOR_STYLE: Record<string, string> = {
  Normal: "#9aa49e",
  Bronze: "#c7834a",
  Silver: "#9fb0bd",
  Gold: "#d9a400",
  Rainbow: "linear-gradient(90deg,#ff6ad5,#ffd23f,#38c6ff)",
};

function songTitle(id: number, fallback: string) {
  return catalog.getSong(id)?.title ?? fallback;
}

watch(kind, (k) => {
  shown.value = PAGE;
  open.value = null;
  genre.value = "";
  onlyEarnable.value = k === "plate";
  void router.replace({ query: { ...route.query, kind: k } });
  void store.load(k);
});
watch([query, onlyEarnable, genre], () => (shown.value = PAGE));

onMounted(() => {
  onlyEarnable.value = kind.value === "plate";
  void store.load(kind.value);
  void catalog.load();
  void player.restore();
});
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>牌子与收藏品</h1>
      <p>将 / 極 / 神 / 舞舞进度，以及称号、头像、背景</p>
    </header>
    <div class="tabs">
      <button v-for="k in COLLECTION_KINDS" :key="k" type="button" :class="{ on: kind === k }" @click="kind = k">
        {{ COLLECTION_LABELS[k] }}
      </button>
    </div>

    <section class="card controls">
      <input v-model.trim="query" class="field" type="search" placeholder="名称或获取方式" />
      <select v-model="genre" class="field small">
        <option value="">全部分类</option>
        <option v-for="g in genres" :key="g" :value="g">{{ g }}</option>
      </select>
      <label class="check"><input v-model="onlyEarnable" type="checkbox" /> 只看靠打歌获得的</label>
      <p class="hint muted">
        <template v-if="hasScores">
          已根据 {{ player.scores!.nickname }} 的全部成绩计算进度：完成 {{ summary.complete }} / {{ summary.total }}，按接近完成排序。
        </template>
        <template v-else>
          用落雪密钥在 <RouterLink to="/b50">B50 页</RouterLink>查询后，会显示每一项的达成进度。
        </template>
        数据来自落雪查分器。
      </p>
    </section>

    <p v-if="store.error" class="state err">{{ store.error }}</p>
    <p v-else-if="store.loading === kind" class="state muted">加载中…</p>
    <p v-else-if="!rows.length" class="state muted">没有符合条件的收藏品</p>

    <ul class="list">
      <li v-for="r in rows.slice(0, shown)" :key="r.item.id" class="card item" :class="{ done: r.progress?.complete }">
        <button type="button" class="head" :aria-expanded="open === r.item.id" @click="open = open === r.item.id ? null : r.item.id">
          <img
            v-if="collectionImageUrl(kind, r.item.id)"
            :src="collectionImageUrl(kind, r.item.id)!"
            :alt="r.item.name"
            :class="['thumb', kind]"
            loading="lazy"
            crossorigin="anonymous"
          />
          <span v-else class="trophy" :style="{ background: COLOR_STYLE[r.item.color ?? 'Normal'] ?? COLOR_STYLE.Normal }">
            {{ r.item.name }}
          </span>
          <div class="info">
            <div class="name">{{ r.item.name }}</div>
            <div class="desc muted">{{ r.item.description || r.item.genre }}</div>
            <div v-if="r.progress" class="progress">
              <span class="bar"><i :style="{ width: `${(r.progress.done / r.progress.total) * 100}%` }" /></span>
              <span class="num">{{ r.progress.complete ? "已达成" : `${r.progress.done}/${r.progress.total}` }}</span>
            </div>
            <div v-else-if="r.item.required?.length" class="muted small">条件：{{ r.item.required.length }} 组谱面要求</div>
          </div>
        </button>
        <div v-if="open === r.item.id && r.item.required?.length" class="detail">
          <p class="muted small">
            条件：{{ r.item.required.map((b) => `${b.songs.length} 首 × ${b.difficulties.map((d) => DIFFICULTY_NAMES[d]).join("/")} ${requirementLabel(b)}`).join("；") }}
          </p>
          <template v-if="r.progress">
            <p v-if="!r.progress.missing.length" class="muted small">全部达成 🎉</p>
            <ul v-else class="missing">
              <li v-for="m in r.progress.missing.slice(0, 80)" :key="`${m.songId}-${m.difficulty}`">
                <RouterLink :to="`/songs/${m.songId}`" class="miss">
                  <LevelPill :difficulty="m.difficulty" :level="DIFFICULTY_NAMES[m.difficulty]!.slice(0, 3)" />
                  <span class="t">{{ songTitle(m.songId, m.title) }}</span>
                  <span class="cur muted">{{ m.current ? `${m.current.achievement.toFixed(4)}%` : "未游玩" }}</span>
                </RouterLink>
              </li>
            </ul>
            <p v-if="r.progress.missing.length > 80" class="muted small">还有 {{ r.progress.missing.length - 80 }} 张未列出</p>
          </template>
        </div>
      </li>
    </ul>
    <button v-if="shown < rows.length" type="button" class="more" @click="shown += PAGE">再显示 {{ Math.min(PAGE, rows.length - shown) }} 项</button>
  </main>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.tabs button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
}

.tabs button.on {
  background: var(--accent-grad);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.controls {
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.field.small {
  width: auto;
  max-width: 160px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  grid-column: 1 / -1;
}

.hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
}

.hint a {
  color: var(--accent);
}

.state {
  text-align: center;
  padding: 24px 0;
}

.err {
  color: var(--warn);
}

.list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

.item.done {
  opacity: 0.75;
}

.head {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  align-items: center;
}

.thumb {
  flex: none;
  object-fit: contain;
  background: var(--surface-2);
  border-radius: 6px;
}

.thumb.plate {
  width: 150px;
  height: 24px;
}

.thumb.icon {
  width: 52px;
  height: 52px;
}

.thumb.frame {
  width: 90px;
  height: 52px;
  object-fit: cover;
}

.trophy {
  flex: none;
  max-width: 140px;
  padding: 3px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.4);
}

.info {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.desc,
.small {
  font-size: 12px;
}

.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  background: var(--accent-grad);
}

.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.detail {
  padding: 0 10px 10px;
  border-top: 1px solid var(--border);
}

.missing {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  max-height: 320px;
  overflow: auto;
}

.miss {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
  font-size: 13px;
}

.t {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cur {
  font-variant-numeric: tabular-nums;
}

.more {
  display: block;
  margin: 14px auto 0;
  padding: 8px 20px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
}
</style>
