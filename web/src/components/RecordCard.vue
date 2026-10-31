<script setup lang="ts">
import { COMBO_LABELS, dxStars, RANK_LABELS, SYNC_LABELS, type PlayRecord } from "@mt/shared";
import { computed } from "vue";
import { useCatalogStore } from "@/stores/catalog";
import LevelPill from "./LevelPill.vue";
import SongJacket from "./SongJacket.vue";

const props = defineProps<{ record: PlayRecord; index: number }>();
const catalog = useCatalogStore();

const song = computed(() => catalog.getSong(props.record.songId));
const stars = computed(() => {
  const notes = song.value?.charts[props.record.type === "UTAGE" ? 0 : props.record.difficulty]?.notes.total;
  return notes ? dxStars(props.record.dxScore, notes) : 0;
});
const jacketSong = computed(() => song.value ?? { id: props.record.songId, lxnsId: null });
const diffColor = computed(() => (props.record.type === "UTAGE" ? "var(--diff-utage)" : `var(--diff-${props.record.difficulty})`));
/** SSS and above glow rainbow, S to SS+ are gold, like the in-game rank badges. */
const rankStyle = computed(() => {
  const r = props.record.rank;
  return r === "sss" || r === "sssp" ? "rainbow" : r.startsWith("s") ? "gold" : "";
});
</script>

<template>
  <RouterLink :to="`/songs/${record.songId}`" class="card rec" :style="{ '--diff': diffColor }">
    <div class="cover">
      <SongJacket :song="jacketSong" :alt="record.title" :size="68" />
      <span class="idx">{{ index + 1 }}</span>
    </div>
    <div class="body">
      <div class="title">{{ record.title }}</div>
      <div class="line">
        <LevelPill :difficulty="record.difficulty" :level="record.level" :utage="record.type === 'UTAGE'" />
        <span class="ds">{{ record.ds.toFixed(1) }}</span>
        <span class="badge" :class="record.type.toLowerCase()">{{ record.type === "UTAGE" ? "宴" : record.type }}</span>
      </div>
      <div class="line score">
        <b>{{ record.achievement.toFixed(4) }}<small>%</small></b>
        <span class="rank-text" :class="rankStyle">{{ RANK_LABELS[record.rank] }}</span>
      </div>
      <div v-if="record.combo || record.sync || stars" class="line flags">
        <span v-if="record.combo" class="flag combo" :class="record.combo">{{ COMBO_LABELS[record.combo] }}</span>
        <span v-if="record.sync" class="flag sync">{{ SYNC_LABELS[record.sync] }}</span>
        <span v-if="stars" class="stars" :title="`DX 分 ${record.dxScore}`">{{ "✦".repeat(stars) }}</span>
      </div>
    </div>
    <div class="ra">
      <span>RATING</span>
      <b>{{ record.rating }}</b>
    </div>
  </RouterLink>
</template>

<style scoped>
.rec {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 10px 12px 10px 10px;
  align-items: center;
  overflow: hidden;
}

.rec::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--diff);
}

.cover {
  position: relative;
  flex: none;
  padding: 2px;
  border-radius: 12px;
  background: var(--diff);
}

.cover :deep(.jacket) {
  border-radius: 10px;
}

.idx {
  position: absolute;
  left: -2px;
  bottom: -2px;
  min-width: 22px;
  padding: 0 5px;
  border-radius: 0 8px 0 10px;
  background: var(--diff);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  text-align: center;
  font-family: var(--font-num);
}

.body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.title {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.ds {
  font-weight: 700;
  font-family: var(--font-num);
}

.score b {
  font-size: 16px;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}

.score small {
  font-size: 11px;
  margin-left: 1px;
  color: var(--text-muted);
}

.score .rank-text {
  font-size: 15px;
}

.flag {
  padding: 0 6px;
  border-radius: 5px;
  font-weight: 800;
  font-size: 10.5px;
  line-height: 17px;
}

.flag.combo {
  background: color-mix(in srgb, var(--ok) 16%, transparent);
  color: var(--ok);
}

.flag.combo.ap,
.flag.combo.app {
  background: linear-gradient(135deg, #fbbf24, #f97316);
  color: #fff;
}

.flag.sync {
  background: color-mix(in srgb, #3b82f6 16%, transparent);
  color: #3b82f6;
}

.stars {
  color: var(--rank-gold);
  font-size: 11px;
}

.ra {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.ra b {
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--text);
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}
</style>
