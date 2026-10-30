<script setup lang="ts">
import { DIFFICULTY_NAMES } from "@mt/shared";
import { computed, onMounted } from "vue";
import FavoriteButton from "@/components/FavoriteButton.vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { useCatalogStore } from "@/stores/catalog";

const props = defineProps<{ id: string }>();
const store = useCatalogStore();
onMounted(() => void store.load());

const song = computed(() => store.getSong(Number(props.id)));
const isUtage = computed(() => song.value?.type === "UTAGE");

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
          <FavoriteButton :song-id="song.id" class="fav" />
          <dl>
            <dt>ID</dt><dd>{{ song.id }}</dd>
            <dt>BPM</dt><dd>{{ song.bpm }}</dd>
            <dt>分类</dt><dd>{{ song.genre }}</dd>
            <dt>版本</dt><dd>{{ song.version }}</dd>
            <dt v-if="song.releaseDate">日期</dt><dd v-if="song.releaseDate">{{ song.releaseDate }}</dd>
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

.fav {
  margin-top: 8px;
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

.notes,
.charter {
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
