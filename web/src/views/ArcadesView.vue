<script setup lang="ts">
import { arcadeRegions, arcadesNearby, searchArcades, type Arcade, type ArcadeRegion as Region } from "@mt/shared";
import { onMounted, ref, watch } from "vue";
import ArcadeCard from "@/components/ArcadeCard.vue";

const mode = ref<"nearby" | "region">("nearby");

// ---- Nearby ----
const radius = ref(10);
const nearbyList = ref<Arcade[] | null>(null);
const locating = ref(false);
const nearbyError = ref<string | null>(null);
let lastPosition: { lat: number; lng: number } | null = null;

const GEO_ERRORS: Record<number, string> = {
  1: "没有定位权限，请在浏览器设置里允许本站获取位置",
  2: "暂时无法获取位置，请稍后再试",
  3: "定位超时，请再试一次",
};

async function loadNearby() {
  if (!lastPosition) return;
  try {
    nearbyList.value = await arcadesNearby(lastPosition.lat, lastPosition.lng, radius.value);
    nearbyError.value = null;
  } catch (err) {
    nearbyError.value = (err as Error).message;
  }
}

function locate() {
  if (!("geolocation" in navigator)) {
    nearbyError.value = "这个浏览器不支持定位";
    return;
  }
  locating.value = true;
  nearbyError.value = null;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      await loadNearby();
      locating.value = false;
    },
    (err) => {
      nearbyError.value = GEO_ERRORS[err.code] ?? err.message;
      locating.value = false;
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60_000 },
  );
}

watch(radius, () => void loadNearby());

// ---- By region ----
const path = ref<Region[]>([]);
const children = ref<Region[]>([]);
const q = ref("");
const results = ref<Arcade[]>([]);
const page = ref(1);
const hasNext = ref(false);
const total = ref<number | null>(null);
const searching = ref(false);
const regionError = ref<string | null>(null);

async function loadChildren(parent: string) {
  try {
    children.value = await arcadeRegions(parent);
  } catch (err) {
    regionError.value = (err as Error).message;
  }
}

async function runSearch(reset = true) {
  const region = path.value[path.value.length - 1]?.id;
  if (!region && !q.value.trim()) {
    results.value = [];
    total.value = null;
    return;
  }
  searching.value = true;
  if (reset) page.value = 1;
  try {
    const res = await searchArcades({ regionId: region, q: q.value, page: page.value });
    results.value = reset ? res.arcades : [...results.value, ...res.arcades];
    hasNext.value = res.hasNextPage;
    total.value = res.total;
    regionError.value = null;
  } catch (err) {
    regionError.value = (err as Error).message;
  } finally {
    searching.value = false;
  }
}

async function enter(r: Region) {
  path.value = [...path.value, r];
  if (r.hasChildren) await loadChildren(r.id);
  else children.value = [];
  await runSearch();
}

async function goTo(depth: number) {
  path.value = path.value.slice(0, depth);
  await loadChildren(path.value[depth - 1]?.id ?? "CN");
  await runSearch();
}

function more() {
  page.value++;
  void runSearch(false);
}

onMounted(() => void loadChildren("CN"));
</script>

<template>
  <main class="page">
    <div class="tabs">
      <button type="button" :class="{ on: mode === 'nearby' }" @click="mode = 'nearby'">附近的机厅</button>
      <button type="button" :class="{ on: mode === 'region' }" @click="mode = 'region'">按地区查找</button>
    </div>

    <template v-if="mode === 'nearby'">
      <section class="card controls">
        <button type="button" class="primary" :disabled="locating" @click="locate">
          {{ locating ? "定位中…" : nearbyList ? "重新定位" : "获取我的位置" }}
        </button>
        <label>
          范围
          <select v-model.number="radius" class="field small">
            <option :value="3">3 km</option>
            <option :value="10">10 km</option>
            <option :value="25">25 km</option>
            <option :value="50">50 km</option>
          </select>
        </label>
        <p class="hint muted">位置只用于这次查询：在你的浏览器里精确到约 100 米后直接发给机厅数据源，不经过本站。</p>
      </section>
      <p v-if="nearbyError" class="state err">{{ nearbyError }}</p>
      <p v-else-if="nearbyList && !nearbyList.length" class="state muted">这个范围内没有舞萌机厅，试试扩大范围。</p>
      <p v-else-if="nearbyList" class="count muted">{{ nearbyList.length }} 家有舞萌 DX 的机厅，按距离排序</p>
      <div class="list">
        <ArcadeCard v-for="a in nearbyList ?? []" :key="a.id" :arcade="a" />
      </div>
    </template>

    <template v-else>
      <section class="card controls column">
        <nav class="crumbs">
          <button type="button" @click="goTo(0)">全国</button>
          <template v-for="(r, i) in path" :key="r.id">
            <span>/</span>
            <button type="button" @click="goTo(i + 1)">{{ r.label }}</button>
          </template>
        </nav>
        <div v-if="children.length" class="regions">
          <button v-for="r in children" :key="r.id" type="button" class="chip" @click="enter(r)">{{ r.label }}</button>
        </div>
        <form class="search" @submit.prevent="runSearch()">
          <input v-model="q" class="field" type="search" placeholder="店名关键字（可选）" maxlength="40" />
          <button type="submit" class="primary" :disabled="searching">搜索</button>
        </form>
      </section>
      <p v-if="regionError" class="state err">{{ regionError }}</p>
      <p v-else-if="total != null" class="count muted">共 {{ total }} 家，已显示 {{ results.length }} 家有舞萌 DX 的</p>
      <p v-else class="count muted">选择地区或输入店名开始查找。</p>
      <div class="list">
        <ArcadeCard v-for="a in results" :key="a.id" :arcade="a" />
      </div>
      <button v-if="hasNext" type="button" class="more" :disabled="searching" @click="more">
        {{ searching ? "加载中…" : "加载更多" }}
      </button>
    </template>

    <p class="credit muted">
      机厅数据来自 <a href="https://nearcade.cn" target="_blank" rel="noopener noreferrer">nearcade</a>（社区维护）。信息有误请到 nearcade 纠正。
    </p>
  </main>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.tabs button,
.chip {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
}

.tabs button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.controls {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  font-size: 13px;
}

.controls.column {
  display: grid;
}

.controls label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.primary {
  padding: 7px 16px;
  border: none;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  cursor: pointer;
  flex: none;
}

.primary:disabled {
  opacity: 0.6;
}

.field.small {
  width: auto;
  min-height: 30px;
  padding: 2px 8px;
}

.hint {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
}

.crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.crumbs button {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
}

.regions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 160px;
  overflow: auto;
}

.search {
  display: flex;
  gap: 8px;
}

.state {
  text-align: center;
  padding: 20px 0;
}

.err {
  color: var(--warn);
}

.count {
  font-size: 13px;
  margin: 10px 0 6px;
}

.list {
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
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

.credit {
  margin-top: 20px;
  font-size: 12px;
  text-align: center;
}

.credit a {
  color: var(--accent);
}
</style>
