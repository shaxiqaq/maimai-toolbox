<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";

interface Announcement {
  id: number;
  title: string;
  body: string;
  createdAt: number;
}

interface Feedback {
  id: number;
  username: string | null;
  contact: string;
  body: string;
  page: string;
  status: "open" | "done";
  reply: string;
  createdAt: number;
}

const auth = useAuthStore();
const announcements = ref<Announcement[]>([]);
const feedback = ref<Feedback[]>([]);
const showAll = ref(false);
const drafts = ref<Record<number, string>>({});
const title = ref("");
const body = ref("");
const error = ref<string | null>(null);

async function act(fn: () => Promise<unknown>) {
  error.value = null;
  try {
    await fn();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function load() {
  await act(async () => {
    announcements.value = await api<Announcement[]>("GET", "/announcements");
    feedback.value = await api<Feedback[]>("GET", `/admin/feedback${showAll.value ? "?status=all" : ""}`);
    drafts.value = Object.fromEntries(feedback.value.map((f) => [f.id, f.reply]));
  });
}

async function post() {
  await act(async () => {
    await api("POST", "/admin/announcements", { title: title.value, body: body.value });
    title.value = "";
    body.value = "";
    await load();
  });
}

function removeAnnouncement(a: Announcement) {
  if (confirm(`删除公告「${a.title}」？`)) void act(() => api("DELETE", `/admin/announcements/${a.id}`).then(load));
}

function save(f: Feedback, status: Feedback["status"]) {
  void act(() => api("PATCH", `/admin/feedback/${f.id}`, { status, reply: drafts.value[f.id] ?? "" }).then(load));
}

const when = (ms: number) => new Date(ms).toLocaleString("zh-CN");

watch(showAll, () => void load());
watch(
  () => [auth.user?.id, auth.isAdmin],
  () => {
    if (auth.isAdmin) void load();
  },
  { immediate: true },
);
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>管理后台</h1>
      <p>发布公告，处理反馈</p>
    </header>
    <p v-if="auth.ready && !auth.isAdmin" class="state muted">
      这个页面只对管理员开放。管理员在 <code>worker/wrangler.jsonc</code> 的 <code>ADMIN_USERNAMES</code> 里设置。
    </p>

    <template v-else-if="auth.isAdmin">
      <p v-if="error" class="err">{{ error }}</p>

      <section class="card block">
        <h2>发布公告</h2>
        <form class="form" @submit.prevent="post">
          <input v-model="title" class="field" maxlength="60" placeholder="标题" required />
          <textarea v-model="body" class="field" rows="3" maxlength="2000" placeholder="内容" required />
          <button type="submit" class="btn" :disabled="!title.trim() || !body.trim()">发布</button>
        </form>
        <ul class="list">
          <li v-for="a in announcements" :key="a.id">
            <div class="row">
              <b>{{ a.title }}</b>
              <span class="muted small">{{ when(a.createdAt) }}</span>
              <button type="button" class="link danger" @click="removeAnnouncement(a)">删除</button>
            </div>
            <p class="text">{{ a.body }}</p>
          </li>
        </ul>
      </section>

      <section class="card block">
        <div class="row">
          <h2>反馈</h2>
          <label class="small"><input v-model="showAll" type="checkbox" /> 包含已处理</label>
        </div>
        <p v-if="!feedback.length" class="muted small">没有{{ showAll ? "" : "待处理的" }}反馈。</p>
        <ul class="list">
          <li v-for="f in feedback" :key="f.id">
            <div class="row small muted">
              <span>{{ f.username ?? "未登录用户" }}</span>
              <span v-if="f.contact">联系方式：{{ f.contact }}</span>
              <span v-if="f.page">页面：{{ f.page }}</span>
              <span>{{ when(f.createdAt) }}</span>
              <span :class="f.status">{{ f.status === "done" ? "已处理" : "待处理" }}</span>
            </div>
            <p class="text">{{ f.body }}</p>
            <textarea
              v-if="f.username"
              v-model="drafts[f.id]"
              class="field"
              rows="2"
              maxlength="2000"
              placeholder="回复（对方在反馈页能看到）"
            />
            <div class="row">
              <button v-if="f.status === 'open'" type="button" class="btn sm" @click="save(f, 'done')">
                {{ f.username ? "回复并标为已处理" : "标为已处理" }}
              </button>
              <template v-else>
                <button v-if="f.username" type="button" class="btn sm" @click="save(f, 'done')">更新回复</button>
                <button type="button" class="link" @click="save(f, 'open')">重新打开</button>
              </template>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.state {
  text-align: center;
  padding: 32px 0;
}

.err {
  color: var(--warn);
  font-size: 13px;
}

.block {
  padding: 14px;
  margin-bottom: 12px;
}

h2 {
  margin: 0;
  font-size: 16px;
}

.small {
  font-size: 12px;
}

.form {
  display: grid;
  gap: 8px;
  margin: 10px 0;
}

textarea.field {
  resize: vertical;
  font: inherit;
}

.btn {
  justify-self: start;
  padding: 6px 16px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent-grad);
  color: var(--accent-contrast);
  cursor: pointer;
}

.btn.sm {
  padding: 3px 12px;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list li {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.row .danger {
  margin-left: auto;
}

.text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
}

.done {
  color: var(--accent);
}

.link {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
}

.link.danger {
  color: var(--warn);
}
</style>
