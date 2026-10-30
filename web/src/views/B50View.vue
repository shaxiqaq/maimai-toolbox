<script setup lang="ts">
import { summarizeB50 } from "@mt/shared";
import { computed, onMounted, ref } from "vue";
import RecordCard from "@/components/RecordCard.vue";
import { useCatalogStore } from "@/stores/catalog";
import { usePlayerStore, type LookupKind } from "@/stores/player";

const player = usePlayerStore();
const catalog = useCatalogStore();

const SOURCE_NAMES = { "diving-fish": "水鱼", lxns: "落雪" } as const;

const kind = ref<LookupKind>(player.lastLookup?.kind ?? "username");
/** Diving-Fish username or QQ. */
const query = ref(player.lastLookup?.kind !== "lxns" ? (player.lastLookup?.value ?? "") : "");
const token = ref(player.savedToken);
const showToken = ref(false);
const rememberToken = ref(player.savedToken !== "" || player.lastLookup?.kind !== "lxns");
const tab = ref<"b35" | "b15">("b35");

const isLxns = computed(() => kind.value === "lxns");
const input = computed(() => (isLxns.value ? token.value : query.value).trim());

const summary = computed(() => (player.b50 ? summarizeB50(player.b50.b35, player.b50.b15) : null));
const list = computed(() => (player.b50 ? player.b50[tab.value] : []));
const mismatch = computed(
  () => player.b50 && summary.value && player.b50.reportedRating !== summary.value.total,
);

function submit() {
  if (input.value) void player.lookup(kind.value, input.value, isLxns.value && rememberToken.value);
}

function forget() {
  player.forgetToken();
  token.value = "";
}

onMounted(() => {
  void catalog.load();
  if (!player.b50 && input.value) submit();
});
</script>

<template>
  <main class="page">
    <form class="card lookup" @submit.prevent="submit">
      <div class="kinds" role="tablist">
        <button type="button" :class="{ on: kind === 'username' }" @click="kind = 'username'">水鱼用户名</button>
        <button type="button" :class="{ on: kind === 'qq' }" @click="kind = 'qq'">水鱼 QQ</button>
        <button type="button" :class="{ on: kind === 'lxns' }" @click="kind = 'lxns'">落雪个人密钥</button>
      </div>
      <div class="row">
        <input
          v-if="!isLxns"
          v-model="query"
          class="field"
          :inputmode="kind === 'qq' ? 'numeric' : 'text'"
          :placeholder="kind === 'qq' ? '绑定在水鱼的 QQ 号' : '水鱼查分器用户名'"
          autocomplete="off"
        />
        <input
          v-else
          v-model="token"
          class="field"
          :type="showToken ? 'text' : 'password'"
          placeholder="落雪查分器个人 API 密钥"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="primary" type="submit" :disabled="player.loading || !input">
          {{ player.loading ? "查询中…" : "查询" }}
        </button>
      </div>
      <template v-if="isLxns">
        <div class="token-opts">
          <label><input v-model="showToken" type="checkbox" /> 显示密钥</label>
          <label><input v-model="rememberToken" type="checkbox" /> 在此设备记住</label>
          <button v-if="player.savedToken" type="button" class="link" @click="forget">忘记已保存的密钥</button>
        </div>
        <p class="hint muted">
          在落雪查分器的账号设置中生成个人 API 密钥后粘贴到这里。密钥只保存在你自己的浏览器里，查询时经本站转发给落雪，
          不会被记录。它相当于你落雪账号的钥匙，不要发给别人；泄露后可以在落雪重新生成。
        </p>
      </template>
      <p v-else class="hint muted">数据来自水鱼查分器公开查询，对方需未开启隐私。</p>
    </form>

    <p v-if="player.error" class="state error">{{ player.error }}</p>

    <template v-if="player.b50 && summary">
      <section class="card summary">
        <div class="who">
          <strong>{{ player.b50.nickname || player.b50.username }}</strong>
          <span v-if="player.b50.plate" class="badge">{{ player.b50.plate }}</span>
          <span class="badge source">{{ SOURCE_NAMES[player.b50.source] }}</span>
        </div>
        <div class="total">
          <span class="muted">DX Rating</span>
          <b>{{ summary.total }}</b>
        </div>
        <dl class="parts">
          <div><dt>旧版本 B35</dt><dd>{{ summary.b35 }}</dd></div>
          <div><dt>当前版本 B15</dt><dd>{{ summary.b15 }}</dd></div>
          <div><dt>B35 底分</dt><dd>{{ summary.b35Floor || "—" }}</dd></div>
          <div><dt>B15 底分</dt><dd>{{ summary.b15Floor || "—" }}</dd></div>
        </dl>
        <p v-if="mismatch" class="note muted">
          {{ SOURCE_NAMES[player.b50.source] }}记录的 Rating 为 {{ player.b50.reportedRating }}，与按成绩重算的结果不同，
          可能是查分器数据或本站曲库尚未更新。
        </p>
        <p v-if="player.b50.unmatched" class="note muted">
          有 {{ player.b50.unmatched }} 条成绩对应的谱面不在本站曲库中（可能是新曲尚未同步），未计入 B50。
        </p>
      </section>

      <div class="tabs">
        <button type="button" :class="{ on: tab === 'b35' }" @click="tab = 'b35'">
          B35 <span class="muted">{{ player.b50.b35.length }}</span>
        </button>
        <button type="button" :class="{ on: tab === 'b15' }" @click="tab = 'b15'">
          B15 <span class="muted">{{ player.b50.b15.length }}</span>
        </button>
      </div>

      <ul class="grid">
        <li v-for="(r, i) in list" :key="`${r.songId}-${r.difficulty}`">
          <RecordCard :record="r" :index="i" />
        </li>
      </ul>
      <p v-if="!list.length" class="state muted">这一栏还没有成绩</p>
    </template>
  </main>
</template>

<style scoped>
.lookup {
  padding: 12px;
  display: grid;
  gap: 8px;
}

.kinds,
.tabs {
  display: flex;
  gap: 6px;
}

.kinds button,
.tabs button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
}

.kinds button.on,
.tabs button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.tabs button.on .muted {
  color: inherit;
  opacity: 0.8;
}

.row {
  display: flex;
  gap: 8px;
}

.primary {
  flex: none;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.hint {
  margin: 0;
  font-size: 12px;
}

.token-opts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  font-size: 13px;
}

.token-opts label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
}

.badge.source {
  margin-left: auto;
}

.state {
  text-align: center;
  padding: 24px 0;
}

.state.error {
  color: var(--warn);
}

.summary {
  margin: 12px 0;
  padding: 14px;
  display: grid;
  gap: 8px;
}

.who {
  display: flex;
  align-items: center;
  gap: 8px;
}

.total {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.total b {
  font-size: 34px;
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.parts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

@media (min-width: 720px) {
  .parts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.parts div {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}

.parts dt {
  font-size: 12px;
  color: var(--text-muted);
}

.parts dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.note {
  margin: 0;
  font-size: 12px;
}

.tabs {
  margin-bottom: 8px;
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
