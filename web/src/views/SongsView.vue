<script setup lang="ts">
import type { SongType } from "@mt/shared";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { CHART_TAGS, EMPTY_FILTER, isTagId, searchSongs, songPlayCount, type SongFilter } from "@mt/shared";
import { useCatalogStore } from "@/stores/catalog";
import { useTagsStore } from "@/stores/tags";

const PAGE_SIZE = 60;

const store = useCatalogStore();
const tags = useTagsStore();
const route = useRoute();
const router = useRouter();

function filterFromQuery(): SongFilter {
  const q = route.query;
  const pick = (key: keyof SongFilter) => (typeof q[key] === "string" ? (q[key] as string) : "");
  return {
    query: pick("query"),
    type: pick("type") as SongType | "",
    genre: pick("genre"),
    version: pick("version"),
    level: pick("level"),
  };
}

const filter = reactive<SongFilter>(filterFromQuery());
/** "" keeps search relevance / newest first; "hot" orders by uploaded play count. */
const sort = ref(route.query.sort === "hot" ? "hot" : "");
/** Community tag; a song matches when one of its charts (at the chosen level, if any) carries it. */
const tag = ref(isTagId(route.query.tag) ? route.query.tag : "");
const shown = ref(PAGE_SIZE);

// Keep the filter in the URL so results survive back-navigation and can be shared.
watch(
  [filter, sort, tag],
  ([f, s, t]) => {
    shown.value = PAGE_SIZE;
    const query = Object.fromEntries(Object.entries({ ...f, sort: s, tag: t }).filter(([, v]) => v !== ""));
    void router.replace({ query });
  },
  { deep: true },
);

const results = computed(() => {
  if (!store.catalog) return [];
  const t = tag.value;
  const found = searchSongs(store.catalog.songs, filter).filter(
    (s) => !isTagId(t) || s.charts.some((c) => (!filter.level || c.level === filter.level) && tags.lookup(s.id, c.difficulty, t)),
  );
  if (sort.value !== "hot") return found;
  const plays = new Map(found.map((s) => [s.id, songPlayCount(s)]));
  return [...found].sort((a, b) => plays.get(b.id)! - plays.get(a.id)!);
});
const visible = computed(() => results.value.slice(0, shown.value));

const levels = computed(() => {
  const set = new Set<string>();
  for (const s of store.catalog?.songs ?? []) for (const c of s.charts) if (s.type !== "UTAGE") set.add(c.level);
  return [...set].sort((a, b) => parseFloat(a) - parseFloat(b) || a.length - b.length);
});

const hasFilter = computed(() => Object.values(filter).some((v) => v !== "") || tag.value !== "");
function reset() {
  Object.assign(filter, EMPTY_FILTER);
  tag.value = "";
}

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
onMounted(() => {
  void store.load();
  void tags.load();
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && shown.value < results.value.length) shown.value += PAGE_SIZE;
  });
  if (sentinel.value) observer.observe(sentinel.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <main class="page">
    <div class="filters">
      <input
        v-model.trim="filter.query"
        class="field search"
        type="search"
        placeholder="曲名 / 曲师 / 别名 / ID，可加 bpm>180 ds:13.5~14 lv:14+"
        title="条件语法：bpm>180、bpm:150~180、ds>=14、ds:13.5~13.9、lv:13+，可与关键词组合"
      />
      <div class="selects">
        <select v-model="filter.type" class="field">
          <option value="">全部类型</option>
          <option value="SD">标准</option>
          <option value="DX">DX</option>
          <option value="UTAGE">宴</option>
        </select>
        <select v-model="filter.level" class="field">
          <option value="">全部等级</option>
          <option v-for="l in levels" :key="l" :value="l">{{ l }}</option>
        </select>
        <select v-model="filter.genre" class="field">
          <option value="">全部分类</option>
          <option v-for="g in store.catalog?.genres ?? []" :key="g" :value="g">{{ g }}</option>
        </select>
        <select v-model="tag" class="field" title="社区投票的谱面标签">
          <option value="">全部标签</option>
          <option v-for="t in CHART_TAGS" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
        <select v-model="sort" class="field" title="热度按水鱼查分器用户上传的游玩记录数计算">
          <option value="">默认排序</option>
          <option value="hot">按热度</option>
        </select>
        <select v-model="filter.version" class="field">
          <option value="">全部版本</option>
          <option v-for="v in [...(store.catalog?.versions ?? [])].reverse()" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
      <div class="summary muted">
        <span v-if="store.catalog">共 {{ results.length }} 首</span>
        <button v-if="hasFilter" type="button" class="link" @click="reset">清除筛选</button>
      </div>
    </div>

    <p v-if="store.error" class="state">加载失败：{{ store.error }}</p>
    <p v-else-if="!store.catalog" class="state muted">
      正在加载曲库…（{{ store.progress }}/4，首次需下载约 4 MB，之后会缓存）
    </p>
    <p v-else-if="!results.length" class="state muted">没有符合条件的曲目</p>

    <ul class="list">
      <li v-for="song in visible" :key="song.id">
        <RouterLink :to="`/songs/${song.id}`" class="card row">
          <SongJacket :song="song" :alt="song.title" />
          <div class="info">
            <div class="title-line">
              <span class="title">{{ song.title }}</span>
              <span class="badge" :class="song.type.toLowerCase()">{{ song.type === "UTAGE" ? "宴" : song.type }}</span>
              <span v-if="song.isNew" class="badge new">新</span>
            </div>
            <div class="artist muted">{{ song.artist }}</div>
            <div class="levels">
              <LevelPill
                v-for="c in song.charts"
                :key="c.difficulty"
                :difficulty="c.difficulty"
                :level="c.level"
                :utage="song.type === 'UTAGE'"
              />
            </div>
          </div>
        </RouterLink>
      </li>
    </ul>
    <div ref="sentinel" class="sentinel" />
  </main>
</template>

<style scoped>
.filters {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.selects {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

@media (min-width: 720px) {
  .selects {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.summary {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.link {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
}

.state {
  text-align: center;
  padding: 32px 0;
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

.row {
  display: flex;
  gap: 12px;
  padding: 10px;
  align-items: center;
}

.row:hover {
  border-color: var(--accent);
}

.info {
  min-width: 0;
  flex: 1;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title {
  font-weight: 600;
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

.levels {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.sentinel {
  height: 1px;
}
</style>
