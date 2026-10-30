<script setup lang="ts">
import {
  b50Total,
  compareScores,
  COMBO_LABELS,
  DIFFICULTY_NAMES,
  snapshotRecords,
  type ComparedChart,
  type PlayRecord,
  type ScoreSnapshot,
} from "@mt/shared";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { useMyRecords } from "@/composables/myRecords";
import { useAuthStore } from "@/stores/auth";
import { useCatalogStore } from "@/stores/catalog";
import { useFriendsStore } from "@/stores/friends";

const props = defineProps<{ id: string }>();
const PAGE = 100;

const auth = useAuthStore();
const catalog = useCatalogStore();
const friends = useFriendsStore();

const theirs = shallowRef<ScoreSnapshot | null>(null);
const theirsAt = ref(0);
const me = useMyRecords();
const { records: myRecords, full: myFull, useStored, nickname: myNickname } = me;
const error = ref<string | null>(null);
const loading = ref(true);

const friend = computed(() => friends.overview?.friends.find((f) => f.id === Number(props.id)) ?? null);

const theirRecords = computed(() => (theirs.value && catalog.catalog ? snapshotRecords(theirs.value, catalog.catalog) : []));

const isNew = computed(() => {
  const ids = new Set((catalog.catalog?.songs ?? []).filter((s) => s.isNew).map((s) => s.id));
  return (id: number) => ids.has(id);
});

function statsOf(records: PlayRecord[]) {
  const playable = records.filter((r) => r.type !== "UTAGE");
  return {
    rating: b50Total(playable, isNew.value),
    count: playable.length,
    sssp: playable.filter((r) => r.achievement >= 100.5).length,
    ap: playable.filter((r) => r.combo === "ap" || r.combo === "app").length,
  };
}
const mine = computed(() => statsOf(myRecords.value));
const their = computed(() => statsOf(theirRecords.value));
const cmp = computed(() => compareScores(myRecords.value, theirRecords.value));

// ---- Filters ----
type Outcome = "all" | "win" | "lose" | "tie" | "mine" | "theirs";
const OUTCOMES: { id: Outcome; label: string; count: () => number }[] = [
  { id: "all", label: "共同谱面", count: () => cmp.value.wins + cmp.value.losses + cmp.value.ties },
  { id: "win", label: "我赢", count: () => cmp.value.wins },
  { id: "lose", label: "我输", count: () => cmp.value.losses },
  { id: "tie", label: "平", count: () => cmp.value.ties },
  { id: "mine", label: "只有我玩过", count: () => cmp.value.onlyMine },
  { id: "theirs", label: "只有 TA 玩过", count: () => cmp.value.onlyTheirs },
];
const outcome = ref<Outcome>("all");
const level = ref("");
const difficulty = ref("");
const sort = ref<"ds" | "gap">("ds");
const shown = ref(PAGE);

const ref_ = (c: ComparedChart) => (c.mine ?? c.theirs)!;
const levels = computed(() =>
  [...new Set(cmp.value.charts.map((c) => ref_(c).level))].sort((a, b) => parseFloat(a) - parseFloat(b) || a.length - b.length),
);

const rows = computed(() => {
  const match: Record<Outcome, (c: ComparedChart) => boolean> = {
    all: (c) => c.diff !== null,
    win: (c) => c.diff !== null && c.diff > 0,
    lose: (c) => c.diff !== null && c.diff < 0,
    tie: (c) => c.diff === 0,
    mine: (c) => !c.theirs,
    theirs: (c) => !c.mine,
  };
  const list = cmp.value.charts.filter(
    (c) =>
      match[outcome.value](c) &&
      (!level.value || ref_(c).level === level.value) &&
      (difficulty.value === "" || c.difficulty === Number(difficulty.value)),
  );
  const byDs = (a: ComparedChart, b: ComparedChart) => ref_(b).ds - ref_(a).ds;
  return sort.value === "gap" ? list.sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0) || byDs(a, b)) : list.sort(byDs);
});
watch([outcome, level, difficulty, sort], () => (shown.value = PAGE));

const pct = (r: PlayRecord | null) => (r ? `${r.achievement.toFixed(4)}%` : "—");
const flag = (r: PlayRecord | null) => (r ? COMBO_LABELS[r.combo] : "");
const winShare = computed(() => {
  const n = cmp.value.wins + cmp.value.losses + cmp.value.ties;
  return n ? (cmp.value.wins / n) * 100 : 0;
});
const tieShare = computed(() => {
  const n = cmp.value.wins + cmp.value.losses + cmp.value.ties;
  return n ? (cmp.value.ties / n) * 100 : 0;
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    await Promise.all([me.load(), friends.overview ? null : friends.load()]);
    const got = await friends.fetchSnapshot(Number(props.id));
    theirs.value = got.snapshot;
    theirsAt.value = got.updatedAt;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [auth.user?.id, props.id],
  ([uid]) => {
    if (uid) void load();
  },
);
onMounted(() => {
  if (auth.user) void load();
});
</script>

<template>
  <main class="page">
    <RouterLink to="/friends" class="back muted">← 好友</RouterLink>

    <p v-if="auth.ready && !auth.user" class="state">
      <RouterLink :to="{ path: '/login', query: { next: `/friends/${id}` } }">登录</RouterLink>后才能对比好友成绩。
    </p>
    <p v-else-if="error" class="state err">{{ error }}</p>
    <p v-else-if="loading || !catalog.catalog" class="state muted">加载中…</p>

    <template v-else-if="theirs">
      <section class="card versus">
        <div class="side">
          <div class="label muted">我</div>
          <div class="nick">{{ myNickname }}</div>
          <div class="rating">{{ mine.rating }}</div>
          <div class="muted small">{{ mine.count }} 张 · SSS+ {{ mine.sssp }} · AP {{ mine.ap }}</div>
        </div>
        <div class="vs">VS</div>
        <div class="side right">
          <div class="label muted">{{ friend?.username ?? "好友" }}</div>
          <div class="nick">{{ theirs.nickname }}</div>
          <div class="rating">{{ their.rating }}</div>
          <div class="muted small">{{ their.count }} 张 · SSS+ {{ their.sssp }} · AP {{ their.ap }}</div>
        </div>
      </section>

      <section class="card score">
        <div class="tally">
          <span class="w">赢 {{ cmp.wins }}</span>
          <span class="muted">平 {{ cmp.ties }}</span>
          <span class="l">输 {{ cmp.losses }}</span>
        </div>
        <div class="split">
          <i class="w" :style="{ width: `${winShare}%` }" />
          <i class="t" :style="{ width: `${tieShare}%` }" />
        </div>
        <p class="muted small">
          按两人都玩过的谱面比达成率（不含宴谱）。对方成绩更新于 {{ new Date(theirsAt).toLocaleString("zh-CN") }}。
          <template v-if="!myFull || !theirs.full">
            <br />{{ !myFull && !theirs.full ? "双方" : !myFull ? "你" : "对方" }}只有 B50，共同谱面会比较少；用落雪密钥查分后上传可以对比全部成绩。
          </template>
          <template v-if="useStored"><br />你这边用的是你上次上传的成绩。</template>
        </p>
      </section>

      <div class="tabs">
        <button v-for="o in OUTCOMES" :key="o.id" type="button" :class="{ on: outcome === o.id }" @click="outcome = o.id">
          {{ o.label }} {{ o.count() }}
        </button>
      </div>
      <div class="filters">
        <select v-model="level" class="field">
          <option value="">全部等级</option>
          <option v-for="l in levels" :key="l" :value="l">Lv {{ l }}</option>
        </select>
        <select v-model="difficulty" class="field">
          <option value="">全部难度</option>
          <option v-for="(n, d) in DIFFICULTY_NAMES" :key="d" :value="String(d)">{{ n }}</option>
        </select>
        <select v-model="sort" class="field">
          <option value="ds">定数从高到低</option>
          <option value="gap">差距从大到小</option>
        </select>
      </div>

      <p v-if="!rows.length" class="state muted">没有符合条件的谱面</p>
      <ul class="list">
        <li v-for="c in rows.slice(0, shown)" :key="c.key">
          <RouterLink :to="`/songs/${c.songId}`" class="card row">
            <SongJacket :song="{ id: c.songId, lxnsId: catalog.getSong(c.songId)?.lxnsId ?? null }" :alt="ref_(c).title" :size="44" />
            <div class="t">
              <div class="title">{{ ref_(c).title }}</div>
              <LevelPill :difficulty="c.difficulty" :level="ref_(c).level" />
              <span class="muted small"> {{ ref_(c).ds.toFixed(1) }}</span>
            </div>
            <div class="nums">
              <div :class="{ best: c.diff !== null && c.diff > 0 }">{{ pct(c.mine) }} <em>{{ flag(c.mine) }}</em></div>
              <div :class="{ best: c.diff !== null && c.diff < 0 }" class="muted">{{ pct(c.theirs) }} <em>{{ flag(c.theirs) }}</em></div>
            </div>
            <div v-if="c.diff !== null" class="diff" :class="c.diff > 0 ? 'w' : c.diff < 0 ? 'l' : ''">
              {{ c.diff > 0 ? "+" : "" }}{{ c.diff.toFixed(4) }}
            </div>
            <div v-else class="diff muted">—</div>
          </RouterLink>
        </li>
      </ul>
      <button v-if="shown < rows.length" type="button" class="more" @click="shown += PAGE">
        再显示 {{ Math.min(PAGE, rows.length - shown) }} 张
      </button>
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

.state a {
  color: var(--accent);
}

.err {
  color: var(--warn);
}

.small {
  font-size: 12px;
}

.versus {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 14px;
}

.side {
  min-width: 0;
}

.side.right {
  text-align: right;
}

.nick {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.rating {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.vs {
  font-weight: 800;
  color: var(--text-muted);
}

.score {
  margin: 10px 0;
  padding: 12px 14px;
}

.tally {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
}

.w {
  color: var(--accent);
}

.l {
  color: var(--warn);
}

.split {
  display: flex;
  height: 10px;
  margin: 6px 0;
  border-radius: 999px;
  overflow: hidden;
  background: var(--warn);
}

.split i {
  display: block;
  height: 100%;
}

.split .w {
  background: var(--accent);
}

.split .t {
  background: var(--border);
}

.score p {
  margin: 6px 0 0;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
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
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto 72px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 14px;
}

.nums {
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.nums em {
  font-style: normal;
  font-size: 11px;
  color: var(--accent);
}

.nums .best {
  font-weight: 700;
}

.diff {
  text-align: right;
  font-weight: 700;
  font-size: 13px;
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

@media (max-width: 480px) {
  .row {
    grid-template-columns: 36px minmax(0, 1fr) auto;
  }

  .diff {
    grid-column: 2 / -1;
    text-align: left;
  }
}
</style>
