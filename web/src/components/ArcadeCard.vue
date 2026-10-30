<script setup lang="ts">
import type { Arcade } from "@mt/shared";
import { computed, ref } from "vue";

const props = defineProps<{ arcade: Arcade }>();
const open = ref(false);

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const count = computed(() => props.arcade.machines.reduce((n, m) => n + m.quantity, 0));
const versions = computed(() => [...new Set(props.arcade.machines.map((m) => m.version).filter(Boolean))].join(" / "));
const costs = computed(() => [...new Set(props.arcade.machines.map((m) => m.cost).filter(Boolean))].join(" / "));
const distanceText = computed(() => {
  const d = props.arcade.distance;
  if (d == null) return "";
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
});
const hours = computed(() =>
  props.arcade.openingHours.length === 1
    ? [{ day: "每天", time: props.arcade.openingHours[0] }]
    : props.arcade.openingHours.map((time, i) => ({ day: WEEKDAYS[i] ?? "", time })),
);
/** nearcade stores GCJ-02 coordinates in mainland China, which is what Amap expects. */
const navUrl = computed(() => {
  const c = props.arcade.coordinates;
  if (!c) return null;
  const qs = new URLSearchParams({
    position: `${c[0]},${c[1]}`,
    name: props.arcade.name,
    coordinate: "gaode",
    callnative: "1",
  });
  return `https://uri.amap.com/marker?${qs}`;
});
</script>

<template>
  <article class="card arcade">
    <button type="button" class="head" :aria-expanded="open" @click="open = !open">
      <div class="title-row">
        <strong class="name">{{ arcade.name }}</strong>
        <span v-if="arcade.isOpen === true" class="badge open">营业中</span>
        <span v-else-if="arcade.isOpen === false" class="badge">已打烊</span>
      </div>
      <div class="meta muted">
        <span v-if="distanceText">{{ distanceText }}</span>
        <span>舞萌DX {{ count }} 台</span>
        <span v-if="arcade.attendance != null">当前 {{ arcade.attendance }} 人</span>
        <span v-if="costs">{{ costs }}</span>
      </div>
      <div class="addr muted">{{ arcade.address }}</div>
    </button>

    <div v-if="open" class="body">
      <dl>
        <dt>版本</dt>
        <dd>{{ versions || "—" }}</dd>
        <dt>营业时间</dt>
        <dd>
          <span v-for="h in hours" :key="h.day" class="hour">{{ h.day }} {{ h.time ? `${h.time[0]}–${h.time[1]}` : "休息" }}</span>
          <span v-if="!hours.length">未知</span>
        </dd>
      </dl>
      <p v-for="(m, i) in arcade.machines.filter((x) => x.comment)" :key="i" class="note">
        <b>机台{{ arcade.machines.length > 1 ? i + 1 : "" }}：</b>{{ m.comment }}
      </p>
      <p v-if="arcade.comment" class="note muted">{{ arcade.comment }}</p>
      <div class="links">
        <a v-if="navUrl" :href="navUrl" target="_blank" rel="noopener noreferrer">高德地图导航 ↗</a>
        <a :href="`https://nearcade.cn/shops/${arcade.id}`" target="_blank" rel="noopener noreferrer">在 nearcade 查看 / 纠错 ↗</a>
      </div>
    </div>
  </article>
</template>

<style scoped>
.arcade {
  overflow: hidden;
}

.head {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 12px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge.open {
  background: var(--accent-soft);
  color: var(--accent);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  font-size: 13px;
}

.addr {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body {
  padding: 0 12px 12px;
  font-size: 13px;
  border-top: 1px solid var(--border);
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 10px 0;
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
}

.note {
  margin: 6px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 12em;
  overflow: auto;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 8px;
}

.links a {
  color: var(--accent);
  font-weight: 600;
}
</style>
