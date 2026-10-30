<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";

interface Feedback {
  id: number;
  body: string;
  page: string;
  status: "open" | "done";
  reply: string;
  createdAt: number;
  updatedAt: number;
}

const auth = useAuthStore();
const route = useRoute();

const body = ref("");
const contact = ref("");
const page = typeof route.query.from === "string" ? route.query.from.slice(0, 200) : "";
const sending = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);
const mine = ref<Feedback[]>([]);

async function loadMine() {
  mine.value = auth.user ? await api<Feedback[]>("GET", "/feedback/mine").catch(() => []) : [];
}

async function send() {
  sending.value = true;
  message.value = null;
  try {
    await api("POST", "/feedback", { body: body.value, contact: contact.value, page });
    body.value = "";
    message.value = { ok: true, text: auth.user ? "已收到，回复会显示在下面。" : "已收到，谢谢！需要回复的话请留下联系方式。" };
    await loadMine();
  } catch (err) {
    message.value = { ok: false, text: (err as Error).message };
  } finally {
    sending.value = false;
  }
}

const when = (ms: number) => new Date(ms).toLocaleString("zh-CN");

watch(() => auth.user?.id, () => void loadMine(), { immediate: true });
</script>

<template>
  <main class="page narrow">
    <section class="card block">
      <h1>意见反馈</h1>
      <p class="muted small">遇到问题、发现数据不对，或者想要什么功能，都可以写在这里。</p>
      <form class="form" @submit.prevent="send">
        <textarea v-model="body" class="field" rows="5" maxlength="2000" placeholder="想说的话（最多 2000 字）" required />
        <input
          v-if="!auth.user"
          v-model="contact"
          class="field"
          maxlength="100"
          placeholder="联系方式（选填，QQ / 邮箱等，方便回复你）"
        />
        <p v-if="page" class="muted small">来自页面：{{ page }}</p>
        <button type="submit" class="btn" :disabled="sending || !body.trim()">{{ sending ? "发送中…" : "发送" }}</button>
      </form>
      <p v-if="message" :class="message.ok ? 'ok' : 'err'">{{ message.text }}</p>
      <p v-if="!auth.user" class="muted small">
        <RouterLink :to="{ path: '/login', query: { next: '/feedback' } }">登录</RouterLink>后发送，可以在这里看到回复。
      </p>
    </section>

    <section v-if="mine.length" class="card block">
      <h2>我的反馈</h2>
      <ul class="list">
        <li v-for="f in mine" :key="f.id">
          <div class="meta muted">
            {{ when(f.createdAt) }} · <span :class="f.status">{{ f.status === "done" ? "已处理" : "待处理" }}</span>
          </div>
          <p class="body">{{ f.body }}</p>
          <p v-if="f.reply" class="reply"><b>回复：</b>{{ f.reply }}</p>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.narrow {
  max-width: 560px;
}

.block {
  padding: 14px;
  margin-bottom: 12px;
}

h1 {
  margin: 0 0 4px;
  font-size: 18px;
}

h2 {
  margin: 0 0 8px;
  font-size: 16px;
}

.small {
  font-size: 12px;
}

.small a {
  color: var(--accent);
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
  padding: 6px 18px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ok {
  color: var(--accent);
  font-size: 13px;
}

.err {
  color: var(--warn);
  font-size: 13px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list li {
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.meta {
  font-size: 12px;
}

.meta .done {
  color: var(--accent);
}

.body,
.reply {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
}

.reply {
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--surface-2);
}
</style>
