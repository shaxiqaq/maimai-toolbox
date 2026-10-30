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
</script>

<template>
  <RouterLink :to="`/songs/${record.songId}`" class="card rec" :class="`rank-${record.rank}`">
    <span class="idx">#{{ index + 1 }}</span>
    <SongJacket :song="jacketSong" :alt="record.title" :size="64" />
    <div class="body">
      <div class="title">{{ record.title }}</div>
      <div class="line">
        <LevelPill :difficulty="record.difficulty" :level="record.level" :utage="record.type === 'UTAGE'" />
        <span class="ds">{{ record.ds.toFixed(1) }}</span>
        <span class="badge" :class="record.type.toLowerCase()">{{ record.type === "UTAGE" ? "宴" : record.type }}</span>
      </div>
      <div class="line score">
        <b>{{ record.achievement.toFixed(4) }}%</b>
        <span class="rank">{{ RANK_LABELS[record.rank] }}</span>
      </div>
      <div class="line flags">
        <span v-if="record.combo" class="flag combo">{{ COMBO_LABELS[record.combo] }}</span>
        <span v-if="record.sync" class="flag sync">{{ SYNC_LABELS[record.sync] }}</span>
        <span v-if="stars" class="stars" :title="`DX 分 ${record.dxScore}`">{{ "★".repeat(stars) }}</span>
      </div>
    </div>
    <div class="ra">
      <span class="muted">Rating</span>
      <b>{{ record.rating }}</b>
    </div>
  </RouterLink>
</template>

<style scoped>
.rec {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 10px;
  align-items: center;
}

.rec:hover {
  border-color: var(--accent);
}

.idx {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 10px;
  color: var(--text-muted);
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
}

.ds {
  font-weight: 600;
}

.score b {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.rank {
  font-weight: 700;
  color: var(--text-muted);
}

.rank-sssp .rank,
.rank-sss .rank {
  color: var(--warn);
}

.rank-ssp .rank,
.rank-ss .rank {
  color: var(--accent);
}

.flag {
  padding: 0 5px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 11px;
}

.flag.combo {
  background: color-mix(in srgb, var(--diff-1) 22%, transparent);
  color: var(--diff-1);
}

.flag.sync {
  background: color-mix(in srgb, var(--diff-3) 18%, transparent);
  color: var(--diff-3);
}

.stars {
  color: var(--diff-1);
  letter-spacing: -1px;
}

.ra {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 11px;
}

.ra b {
  font-size: 20px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
</style>
