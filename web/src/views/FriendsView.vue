<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useFriendsStore, type SnapshotInfo } from "@/stores/friends";
import { usePlayerStore } from "@/stores/player";

const auth = useAuthStore();
const player = usePlayerStore();
const friends = useFriendsStore();

const username = ref("");
const message = ref<string | null>(null);
const actionError = ref<string | null>(null);

const ov = computed(() => friends.overview);
const pending = computed(() => friends.currentSnapshot());

function when(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function describe(s: SnapshotInfo): string {
  return `${s.nickname || "未命名"} · Rating ${s.rating} · ${s.full ? `全部成绩 ${s.recordCount} 条` : "仅 B50"}`;
}

/** Run an action and show its error inline instead of failing silently. */
async function run(action: () => Promise<unknown>, done?: string) {
  actionError.value = null;
  message.value = null;
  try {
    await action();
    if (done) message.value = done;
  } catch (err) {
    actionError.value = (err as Error).message;
  }
}

async function add() {
  const name = username.value.trim();
  if (!name) return;
  await run(async () => {
    const status = await friends.request(name);
    message.value = status === "accepted" ? `已和 ${name} 成为好友` : `已向 ${name} 发送好友申请`;
    username.value = "";
  });
}

function removeFriend(id: number, name: string) {
  if (confirm(`删除好友 ${name}？双方都将看不到对方的成绩。`)) void run(() => friends.remove(id));
}

function toggleAuto(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  friends.setAutoShare(on);
  if (on && pending.value) void run(() => friends.upload(), "已上传当前成绩");
}

watch(
  () => auth.user,
  (u) => {
    if (u) {
      void friends.load();
      void player.restore();
    }
  },
  { immediate: true },
);
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>好友</h1>
      <p>互加好友，分享成绩，逐张谱面对比</p>
    </header>
    <section v-if="auth.ready && !auth.user" class="card needs">
      <p>好友功能需要账号：互加好友后，可以逐张谱面对比双方的成绩。</p>
      <RouterLink :to="{ path: '/login', query: { next: '/friends' } }" class="go">登录或注册 →</RouterLink>
    </section>

    <template v-else-if="auth.user">
      <p v-if="friends.error" class="err">{{ friends.error }}</p>
      <p v-if="actionError" class="err">{{ actionError }}</p>
      <p v-if="message" class="ok">{{ message }}</p>

      <section class="card block">
        <h2>我分享给好友的成绩</h2>
        <p v-if="ov?.snapshot" class="muted small">
          {{ describe(ov.snapshot) }}，更新于 {{ when(ov.snapshot.updatedAt) }}
        </p>
        <p v-else class="muted small">还没有上传。好友只能看到你主动上传的成绩，不会看到你的落雪密钥或水鱼账号。</p>

        <p v-if="pending" class="small">
          当前已查询：{{ pending.nickname }} ·
          {{ pending.full ? `全部成绩 ${pending.records.length} 条（落雪）` : "仅 B50（水鱼只公开 B50，用落雪密钥可分享全部成绩）" }}
        </p>
        <p v-else class="small muted">
          先去 <RouterLink to="/b50">B50 页</RouterLink>查询成绩，再回来上传。
        </p>

        <div class="row">
          <button type="button" class="primary" :disabled="!pending || friends.uploading" @click="run(() => friends.upload(), '已上传当前成绩')">
            {{ friends.uploading ? "上传中…" : ov?.snapshot ? "用当前成绩更新" : "上传当前成绩" }}
          </button>
          <button v-if="ov?.snapshot" type="button" class="ghost" @click="run(() => friends.deleteSnapshot(), '已删除分享的成绩')">
            删除
          </button>
        </div>
        <label class="check">
          <input type="checkbox" :checked="friends.autoShare" @change="toggleAuto" />
          在这台设备上每次查分后自动更新
        </label>
      </section>

      <section class="card block">
        <h2>添加好友</h2>
        <form class="row" @submit.prevent="add">
          <input v-model="username" class="field" maxlength="20" placeholder="对方在本站的用户名" autocomplete="off" />
          <button type="submit" class="primary" :disabled="!username.trim()">发送申请</button>
        </form>
        <p class="muted small">你的用户名是 <b>{{ auth.user.username }}</b>，可以发给好友让对方加你。</p>
      </section>

      <section v-if="ov?.incoming.length" class="card block">
        <h2>收到的申请</h2>
        <ul class="list">
          <li v-for="r in ov.incoming" :key="r.id">
            <span class="name">{{ r.username }}</span>
            <span class="muted small">{{ when(r.createdAt) }}</span>
            <span class="acts">
              <button type="button" class="primary sm" @click="run(() => friends.accept(r.id), `已和 ${r.username} 成为好友`)">同意</button>
              <button type="button" class="ghost sm" @click="run(() => friends.drop(r.id))">拒绝</button>
            </span>
          </li>
        </ul>
      </section>

      <section v-if="ov?.outgoing.length" class="card block">
        <h2>等待对方同意</h2>
        <ul class="list">
          <li v-for="r in ov.outgoing" :key="r.id">
            <span class="name">{{ r.username }}</span>
            <span class="muted small">{{ when(r.createdAt) }}</span>
            <span class="acts"><button type="button" class="ghost sm" @click="run(() => friends.drop(r.id))">撤回</button></span>
          </li>
        </ul>
      </section>

      <section class="card block">
        <h2>好友 <span class="muted small">{{ ov?.friends.length ?? 0 }}</span></h2>
        <p v-if="ov && !ov.friends.length" class="muted small">还没有好友。</p>
        <ul class="list">
          <li v-for="f in ov?.friends ?? []" :key="f.id">
            <div class="who">
              <span class="name">{{ f.username }}</span>
              <span class="muted small">
                {{ f.snapshot ? `${describe(f.snapshot)} · ${when(f.snapshot.updatedAt)}` : "还没有分享成绩" }}
              </span>
            </div>
            <span class="acts">
              <RouterLink v-if="f.snapshot" :to="`/friends/${f.id}`" class="primary sm link">对比 →</RouterLink>
              <button type="button" class="ghost sm" @click="removeFriend(f.id, f.username)">删除</button>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.needs {
  padding: 16px;
  text-align: center;
}

.go {
  color: var(--accent);
  font-weight: 600;
}

.block {
  padding: 14px;
  margin-bottom: 12px;
}

.block h2 {
  margin: 0 0 8px;
  font-size: 16px;
}

.small {
  font-size: 12px;
}

.small a {
  color: var(--accent);
}

.err,
.ok {
  margin: 0 0 10px;
  font-size: 13px;
}

.err {
  color: var(--warn);
}

.ok {
  color: var(--accent);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}

.row .field {
  flex: 1;
  min-width: 160px;
}

.primary,
.ghost {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--accent);
}

.primary {
  background: var(--accent-grad);
  color: var(--accent-contrast);
}

.primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.ghost {
  background: none;
  color: var(--text-muted);
  border-color: var(--border);
}

.sm {
  padding: 3px 10px;
  font-size: 12px;
}

.link {
  display: inline-block;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.who {
  display: grid;
  min-width: 0;
  flex: 1;
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.acts {
  margin-left: auto;
  display: flex;
  gap: 6px;
  flex: none;
}
</style>
