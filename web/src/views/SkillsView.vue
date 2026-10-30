<script setup lang="ts">
import { recordKey, skillRadar, snapshotRecords, TAG_LABELS, type SkillRadar, type TagId } from "@mt/shared";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useMyRecords } from "@/composables/myRecords";
import { useAuthStore } from "@/stores/auth";
import { useCatalogStore } from "@/stores/catalog";
import { useFriendsStore } from "@/stores/friends";
import { usePlayerStore } from "@/stores/player";
import { useTagsStore } from "@/stores/tags";

const auth = useAuthStore();
const catalog = useCatalogStore();
const player = usePlayerStore();
const friends = useFriendsStore();
const tags = useTagsStore();
const { records: myRecords, full: myFull, nickname: myNickname, load: loadMine } = useMyRecords();

const friendId = ref("");
const friendRadar = shallowRef<SkillRadar | null>(null);
const friendError = ref<string | null>(null);

/** Community average achievement per chart (Diving-Fish chart_stats). */
const communityAvg = computed(() => {
  const map = new Map<string, number>();
  for (const s of catalog.catalog?.songs ?? []) for (const c of s.charts) if (c.stats) map.set(recordKey(s.id, c.difficulty), c.stats.avgAchievement);
  return (songId: number, difficulty: number) => map.get(recordKey(songId, difficulty)) ?? null;
});

const mine = computed(() => skillRadar(myRecords.value, tags.lookup, communityAvg.value));
const friendsWithScores = computed(() => (friends.overview?.friends ?? []).filter((f) => f.snapshot));
const friendName = computed(() => friendsWithScores.value.find((f) => String(f.id) === friendId.value)?.username ?? "");

watch(friendId, async (id) => {
  friendRadar.value = null;
  friendError.value = null;
  if (!id || !catalog.catalog) return;
  try {
    const { snapshot } = await friends.fetchSnapshot(Number(id));
    if (friendId.value === id) friendRadar.value = skillRadar(snapshotRecords(snapshot, catalog.catalog), tags.lookup, communityAvg.value);
  } catch (err) {
    friendError.value = (err as Error).message;
  }
});

// ---- Drawing ----
const SIZE = 340;
const C = SIZE / 2;
const R = 115;
const axes = computed(() => mine.value.axes);
const friendByTag = computed(() => new Map((friendRadar.value?.axes ?? []).map((a) => [a.tag, a])));

function point(i: number, score: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.value.length;
  const r = (R * score) / 100;
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)];
}
const polygon = (scores: number[]) => scores.map((s, i) => point(i, s).map((v) => v.toFixed(1)).join(",")).join(" ");
const myPolygon = computed(() => polygon(axes.value.map((a) => a.score)));
/** Axes the friend has too little data on sit at their own average (50). */
const friendPolygon = computed(() => polygon(axes.value.map((a) => friendByTag.value.get(a.tag)?.score ?? 50)));

function labelAt(i: number) {
  const [x, y] = point(i, 122);
  const anchor = Math.abs(x - C) < 4 ? "middle" : x > C ? "start" : "end";
  return { x, y: y + 4, anchor };
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
const label = (t: TagId) => TAG_LABELS[t];

onMounted(() => {
  void tags.load();
  void loadMine();
});
watch(
  () => auth.user?.id,
  (uid) => {
    if (uid && !friends.overview) void friends.load();
  },
  { immediate: true },
);
</script>

<template>
  <main class="page">
    <section class="card intro">
      <h1>能力雷达</h1>
      <p class="muted small">
        按谱面标签（社区投票，加上诈称、高物量、触摸、绝赞段这几个按谱面数据自动判断的标签），把你在每类谱面上的达成率和水鱼玩家平均水平比较。每个方向都相对于你自己的整体水平：
        外凸是你相对擅长的类型，内凹是相对薄弱的类型。每个标签至少要有 3 张你玩过的谱面才会画出来。
      </p>
    </section>

    <p v-if="!catalog.catalog || player.loading" class="state muted">加载中…</p>
    <section v-else-if="!myRecords.length" class="card intro">
      <p>需要先查询成绩。用落雪密钥可以拿到全部成绩，雷达会准确得多；水鱼只有 B50。</p>
      <RouterLink to="/b50" class="go">去 B50 页查询 →</RouterLink>
    </section>

    <template v-else>
      <section class="card chart">
        <div class="legend">
          <span class="me">● {{ myNickname }}（{{ mine.played }} 张，平均高出 {{ signed(mine.overallDelta) }}%）</span>
          <span v-if="friendRadar" class="fr">● {{ friendName }}（{{ friendRadar.played }} 张，平均高出 {{ signed(friendRadar.overallDelta) }}%）</span>
        </div>
        <p v-if="!myFull" class="muted small">只有 B50 的成绩，样本很少；用落雪密钥查询后再来看会准确得多。</p>

        <svg v-if="axes.length >= 3" :viewBox="`-60 -10 ${SIZE + 120} ${SIZE + 20}`" class="radar" role="img" aria-label="能力雷达图">
          <polygon v-for="s in [25, 50, 75, 100]" :key="s" :points="polygon(axes.map(() => s))" class="ring" :class="{ mid: s === 50 }" />
          <line v-for="(a, i) in axes" :key="a.tag" :x1="C" :y1="C" :x2="point(i, 100)[0]" :y2="point(i, 100)[1]" class="spoke" />
          <polygon v-if="friendRadar" :points="friendPolygon" class="area friend" />
          <polygon :points="myPolygon" class="area me" />
          <text v-for="(a, i) in axes" :key="`l-${a.tag}`" :x="labelAt(i).x" :y="labelAt(i).y" :text-anchor="labelAt(i).anchor" class="axis-label">
            {{ label(a.tag) }}
          </text>
        </svg>
        <p v-else class="muted state">
          有足够数据的标签还不到 3 个（现在 {{ axes.length }} 个）。去<RouterLink to="/songs">曲库</RouterLink>的谱面详情里给你熟悉的谱面打标签吧。
        </p>

        <div v-if="auth.user" class="friend-pick">
          <select v-model="friendId" class="field">
            <option value="">叠加好友的雷达…</option>
            <option v-for="f in friendsWithScores" :key="f.id" :value="String(f.id)">{{ f.username }}</option>
          </select>
          <span v-if="friendError" class="err small">{{ friendError }}</span>
          <RouterLink v-if="!friendsWithScores.length" to="/friends" class="small go">还没有分享成绩的好友 →</RouterLink>
        </div>
      </section>

      <section v-if="axes.length" class="card">
        <table class="table">
          <thead>
            <tr>
              <th>标签</th>
              <th>谱面</th>
              <th>平均达成</th>
              <th title="和水鱼玩家平均达成率的差">比平均</th>
              <th v-if="friendRadar">{{ friendName }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in [...axes].sort((x, y) => y.score - x.score)" :key="a.tag">
              <td>
                <RouterLink :to="{ path: '/songs', query: { tag: a.tag } }">{{ label(a.tag) }}</RouterLink>
              </td>
              <td>{{ a.played }}</td>
              <td>{{ a.avgAchievement.toFixed(2) }}%</td>
              <td :class="a.delta >= mine.overallDelta ? 'up' : 'down'">{{ signed(a.delta) }}</td>
              <td v-if="friendRadar">
                {{ friendByTag.get(a.tag) ? signed(friendByTag.get(a.tag)!.delta) : "—" }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </main>
</template>

<style scoped>
.intro,
.chart {
  padding: 14px;
  margin-bottom: 12px;
}

.intro h1 {
  margin: 0 0 6px;
  font-size: 18px;
}

.intro p {
  margin: 0 0 8px;
}

.small {
  font-size: 12px;
}

.go,
.state a {
  color: var(--accent);
  font-weight: 600;
}

.state {
  text-align: center;
  padding: 24px 0;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 13px;
}

.legend .me {
  color: var(--accent);
}

.legend .fr {
  color: var(--warn);
}

.radar {
  display: block;
  width: 100%;
  max-width: 460px;
  margin: 8px auto;
}

.ring {
  fill: none;
  stroke: var(--border);
}

.ring.mid {
  stroke: var(--text-muted);
  stroke-dasharray: 3 3;
}

.spoke {
  stroke: var(--border);
}

.area {
  stroke-width: 2;
}

.area.me {
  fill: color-mix(in srgb, var(--accent) 25%, transparent);
  stroke: var(--accent);
}

.area.friend {
  fill: color-mix(in srgb, var(--warn) 15%, transparent);
  stroke: var(--warn);
  stroke-dasharray: 5 3;
}

.axis-label {
  fill: var(--text);
  font-size: 13px;
}

.friend-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.friend-pick .field {
  width: auto;
  min-width: 180px;
}

.err {
  color: var(--warn);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.table th,
.table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}

.table th:first-child,
.table td:first-child {
  text-align: left;
}

.table a {
  color: var(--accent);
}

.up {
  color: var(--accent);
}

.down {
  color: var(--warn);
}
</style>
