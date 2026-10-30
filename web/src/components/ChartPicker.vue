<script setup lang="ts">
import { DIFFICULTY_NAMES, EMPTY_FILTER, searchSongs, type ChartRef, type Song } from "@mt/shared";
import { computed, onMounted, ref } from "vue";
import { useCatalogStore } from "@/stores/catalog";
import LevelPill from "./LevelPill.vue";
import SongJacket from "./SongJacket.vue";

const model = defineModel<ChartRef | null>({ required: true });

const catalog = useCatalogStore();
const query = ref("");
const song = ref<Song | null>(model.value?.song ?? null);

const results = computed(() =>
  catalog.catalog && query.value.trim()
    ? searchSongs(catalog.catalog.songs, { ...EMPTY_FILTER, query: query.value }).filter((s) => s.type !== "UTAGE").slice(0, 8)
    : [],
);

function pickSong(s: Song) {
  song.value = s;
  query.value = "";
  // Default to Master, or the hardest chart if there is none.
  model.value = { song: s, chart: s.charts[3] ?? s.charts[s.charts.length - 1]! };
}

function clear() {
  song.value = null;
  model.value = null;
}

onMounted(() => void catalog.load());
</script>

<template>
  <div class="picker">
    <div v-if="song" class="picked">
      <SongJacket :song="song" :alt="song.title" :size="44" />
      <div class="info">
        <div class="title">{{ song.title }}</div>
        <div class="diffs">
          <button
            v-for="c in song.charts"
            :key="c.difficulty"
            type="button"
            class="diff"
            :class="{ on: model?.chart === c }"
            :title="DIFFICULTY_NAMES[c.difficulty]"
            @click="model = { song, chart: c }"
          >
            <LevelPill :difficulty="c.difficulty" :level="c.level" />
          </button>
        </div>
      </div>
      <button type="button" class="change" @click="clear">换一首</button>
    </div>

    <div v-else class="search">
      <input v-model="query" class="field" type="search" placeholder="搜索曲目（曲名 / 别名 / ID）" />
      <ul v-if="results.length" class="results card">
        <li v-for="s in results" :key="s.id">
          <button type="button" @click="pickSong(s)">
            <SongJacket :song="s" :alt="s.title" :size="32" />
            <span class="title">{{ s.title }}</span>
            <span class="badge" :class="s.type.toLowerCase()">{{ s.type }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.picked {
  display: flex;
  align-items: center;
  gap: 10px;
}

.info {
  flex: 1;
  min-width: 0;
}

.title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diffs {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.diff {
  border: 2px solid transparent;
  border-radius: 8px;
  background: none;
  padding: 1px;
  cursor: pointer;
  opacity: 0.55;
}

.diff.on {
  border-color: var(--accent);
  opacity: 1;
}

.change {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}

.search {
  position: relative;
}

.results {
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  list-style: none;
  margin: 0;
  padding: 4px;
}

.results button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.results button:hover {
  background: var(--surface-2);
}

.results .title {
  flex: 1;
  font-weight: 500;
}
</style>
