<script setup lang="ts">
import {
  achievementForRating,
  BREAK_JUDGES,
  chartRating,
  computeAchievement,
  maxAchievement,
  minAchievementFor,
  NORMAL_JUDGES,
  RANK_LABELS,
  rankOf,
  tolerance,
  validateJudgements,
  type BreakJudge,
  type ChartRef,
  type Judgements,
  type NoteCounts,
  type NoteKind,
  type NormalJudge,
  type RankId,
} from "@mt/shared";
import { computed, reactive, ref, watch } from "vue";
import ChartPicker from "@/components/ChartPicker.vue";

type Tab = "achievement" | "tolerance" | "rating";
const tab = ref<Tab>("achievement");

const picked = ref<ChartRef | null>(null);
const manual = reactive({ tap: 500, hold: 50, slide: 50, touch: 0, break: 30, ds: 13.0 });

const notes = computed<NoteCounts>(() => {
  if (picked.value) return picked.value.chart.notes;
  const n = { tap: manual.tap || 0, hold: manual.hold || 0, slide: manual.slide || 0, touch: manual.touch || 0, break: manual.break || 0 };
  return { ...n, total: n.tap + n.hold + n.slide + n.touch + n.break };
});
const ds = ref(13.0);
watch(picked, (p) => p && (ds.value = p.chart.ds));

const KIND_LABELS: Record<NoteKind, string> = { tap: "TAP", hold: "HOLD", slide: "SLIDE", touch: "TOUCH", break: "BREAK" };
const NORMAL_LABELS: Record<NormalJudge, string> = { great: "GREAT", good: "GOOD", miss: "MISS" };
const BREAK_LABELS: Record<BreakJudge, string> = {
  perfectHigh: "高 PERFECT",
  perfectLow: "低 PERFECT",
  greatHigh: "GREAT 高",
  greatMid: "GREAT 中",
  greatLow: "GREAT 低",
  good: "GOOD",
  miss: "MISS",
};
const NORMAL_KINDS = ["tap", "hold", "slide", "touch"] as const;

// ---- Achievement ----
const judgements = reactive<Judgements>({ tap: {}, hold: {}, slide: {}, touch: {}, break: {} });
const problems = computed(() => validateJudgements(notes.value, judgements));
const result = computed(() => computeAchievement(notes.value, judgements, ds.value || undefined));
function resetJudgements() {
  for (const k of [...NORMAL_KINDS, "break"] as const) judgements[k] = {};
}

// ---- Tolerance ----
const TARGETS: RankId[] = ["sssp", "sss", "ssp", "ss", "sp", "s"];
const target = ref<RankId>("sssp");
const toleranceRows = computed(() => tolerance(notes.value, minAchievementFor(target.value)));

// ---- Rating ----
const achievementInput = ref(100.5);
const targetRating = ref(300);
const ratingResult = computed(() => {
  const a = Math.min(achievementInput.value || 0, 101);
  return { rank: rankOf(a), rating: chartRating(ds.value || 0, a) };
});
const neededAchievement = computed(() => achievementForRating(ds.value || 0, targetRating.value || 0));
const rankTable = computed(() =>
  (["sssp", "sss", "ssp", "ss", "sp", "s", "aaa"] as RankId[]).map((r) => {
    const a = minAchievementFor(r);
    return { rank: r, achievement: a, rating: chartRating(ds.value || 0, a) };
  }),
);

const fmt4 = (n: number) => n.toFixed(4);
</script>

<template>
  <main class="page">
    <section class="card source">
      <ChartPicker v-model="picked" />
      <div v-if="picked" class="chart-meta muted">
        定数 {{ picked.chart.ds.toFixed(1) }} · 物量 {{ notes.total }}（TAP {{ notes.tap }} / HOLD {{ notes.hold }} / SLIDE
        {{ notes.slide }} / TOUCH {{ notes.touch }} / BREAK {{ notes.break }}）
      </div>
      <details v-else class="manual">
        <summary class="muted">不选曲目，手动输入物量</summary>
        <div class="manual-grid">
          <label v-for="k in (['tap', 'hold', 'slide', 'touch', 'break'] as const)" :key="k">
            {{ KIND_LABELS[k] }}
            <input v-model.number="manual[k]" class="field" type="number" min="0" />
          </label>
        </div>
      </details>
    </section>

    <div class="tabs" role="tablist">
      <button type="button" :class="{ on: tab === 'achievement' }" @click="tab = 'achievement'">达成率</button>
      <button type="button" :class="{ on: tab === 'tolerance' }" @click="tab = 'tolerance'">容错</button>
      <button type="button" :class="{ on: tab === 'rating' }" @click="tab = 'rating'">Rating</button>
    </div>

    <!-- Achievement from judgements -->
    <section v-if="tab === 'achievement'" class="card panel">
      <p class="hint muted">填写非 CRITICAL 的判定数，其余默认为 CRITICAL PERFECT。</p>
      <div class="judge-table">
        <div class="jrow head">
          <span />
          <span v-for="j in NORMAL_JUDGES" :key="j">{{ NORMAL_LABELS[j] }}</span>
        </div>
        <div v-for="k in NORMAL_KINDS" :key="k" class="jrow" :class="{ off: !notes[k] }">
          <span class="kind">{{ KIND_LABELS[k] }} <small class="muted">{{ notes[k] }}</small></span>
          <input
            v-for="j in NORMAL_JUDGES"
            :key="j"
            v-model.number="judgements[k][j]"
            class="field"
            type="number"
            min="0"
            :max="notes[k]"
            :disabled="!notes[k]"
            :aria-label="`${KIND_LABELS[k]} ${NORMAL_LABELS[j]}`"
          />
        </div>
      </div>
      <div class="break-grid">
        <span class="kind">BREAK <small class="muted">{{ notes.break }}</small></span>
        <label v-for="j in BREAK_JUDGES" :key="j">
          {{ BREAK_LABELS[j] }}
          <input v-model.number="judgements.break[j]" class="field" type="number" min="0" :max="notes.break" />
        </label>
      </div>
      <p v-for="p in problems" :key="p.kind" class="error">{{ p.message }}</p>
      <div class="result">
        <div>
          <span class="muted">达成率</span>
          <b>{{ fmt4(result.achievement) }}%</b>
        </div>
        <div>
          <span class="muted">评级</span>
          <b>{{ RANK_LABELS[result.rank] }}</b>
        </div>
        <div>
          <span class="muted">单曲 Rating（定数 {{ ds.toFixed(1) }}）</span>
          <b>{{ result.rating ?? "—" }}</b>
        </div>
      </div>
      <button type="button" class="link" @click="resetJudgements">清空判定</button>
    </section>

    <!-- Tolerance -->
    <section v-else-if="tab === 'tolerance'" class="card panel">
      <label class="inline">
        目标
        <select v-model="target" class="field small">
          <option v-for="r in TARGETS" :key="r" :value="r">{{ RANK_LABELS[r] }}（{{ minAchievementFor(r) }}%）</option>
        </select>
      </label>
      <p class="hint muted">
        满分 {{ maxAchievement(notes) }}%，可损失 {{ fmt4(Math.max(0, maxAchievement(notes) - minAchievementFor(target))) }}%。
        下表是只出现某一种判定时最多能有几个。
      </p>
      <table class="tol">
        <thead>
          <tr><th>音符</th><th>判定</th><th>每个损失</th><th>最多</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in toleranceRows" :key="`${r.kind}-${r.judge}`">
            <td>{{ KIND_LABELS[r.kind] }}</td>
            <td>{{ r.kind === "break" ? BREAK_LABELS[r.judge as BreakJudge] : NORMAL_LABELS[r.judge as NormalJudge] }}</td>
            <td class="num">{{ fmt4(r.loss) }}%</td>
            <td class="num strong">{{ r.allowed === Infinity ? "∞" : r.allowed }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Rating -->
    <section v-else class="card panel">
      <label class="inline">
        定数
        <input v-model.number="ds" class="field small num" type="number" step="0.1" min="1" max="15" />
      </label>
      <div class="rating-io">
        <label>
          达成率
          <input v-model.number="achievementInput" class="field num" type="number" step="0.0001" min="0" max="101" />
        </label>
        <div class="out">
          → {{ RANK_LABELS[ratingResult.rank] }}，Rating <b>{{ ratingResult.rating }}</b>
        </div>
        <label>
          目标 Rating
          <input v-model.number="targetRating" class="field num" type="number" min="0" />
        </label>
        <div class="out">
          <template v-if="neededAchievement != null">→ 至少 <b>{{ fmt4(neededAchievement) }}%</b></template>
          <template v-else>→ 这个定数达不到</template>
        </div>
      </div>
      <table class="tol">
        <thead>
          <tr><th>评级</th><th>最低达成率</th><th>Rating</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rankTable" :key="r.rank">
            <td>{{ RANK_LABELS[r.rank] }}</td>
            <td class="num">{{ r.achievement }}%</td>
            <td class="num strong">{{ r.rating }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<style scoped>
.source {
  padding: 12px;
}

.chart-meta {
  margin-top: 8px;
  font-size: 12px;
}

.manual {
  margin-top: 8px;
  font-size: 13px;
}

.manual summary {
  cursor: pointer;
}

.manual-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin-top: 6px;
}

.manual-grid label,
.break-grid label {
  display: grid;
  gap: 2px;
  font-size: 12px;
}

.tabs {
  display: flex;
  gap: 6px;
  margin: 12px 0 8px;
}

.tabs button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}

.tabs button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.panel {
  padding: 12px;
  display: grid;
  gap: 10px;
}

.hint {
  margin: 0;
  font-size: 12px;
}

.field {
  min-height: 34px;
  padding: 4px 8px;
}

.field.small {
  width: auto;
}

.field.num {
  max-width: 120px;
}

.judge-table {
  display: grid;
  gap: 6px;
}

.jrow {
  display: grid;
  grid-template-columns: 84px repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

.jrow.head {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.jrow.off {
  opacity: 0.45;
}

.kind {
  font-weight: 600;
  font-size: 13px;
}

.break-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  align-items: end;
}

.break-grid .kind {
  grid-column: 1 / -1;
}

@media (min-width: 720px) {
  .break-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

.error {
  margin: 0;
  color: var(--warn);
  font-size: 13px;
}

.result {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.result div {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: grid;
  font-size: 12px;
}

.result b {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.link {
  justify-self: start;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
}

.inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.tol {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tol th,
.tol td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.tol th {
  font-weight: 500;
  color: var(--text-muted);
  font-size: 12px;
}

.num {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}

.strong {
  font-weight: 700;
}

.rating-io {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 12px;
  align-items: center;
  font-size: 13px;
}

.rating-io label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.out b {
  color: var(--accent);
  font-size: 15px;
}
</style>
