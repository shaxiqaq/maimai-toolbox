<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";
import { useFavoritesStore } from "@/stores/favorites";

interface ArchiveSummary {
  id: string;
  title: string;
  rating: number;
  source: "diving-fish" | "lxns";
  shareId: string | null;
  createdAt: number;
}

const auth = useAuthStore();
const favorites = useFavoritesStore();
const router = useRouter();

const archives = ref<ArchiveSummary[]>([]);
const error = ref<string | null>(null);
const copied = ref<string | null>(null);

async function load() {
  try {
    archives.value = await api<ArchiveSummary[]>("GET", "/archives");
    error.value = null;
  } catch (err) {
    error.value = (err as Error).message;
  }
}

const shareUrl = (shareId: string) => `${location.origin}/s/${shareId}`;

async function act(fn: () => Promise<unknown>) {
  try {
    await fn();
    await load();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function rename(a: ArchiveSummary) {
  const title = prompt("新的存档名称", a.title);
  if (title != null && title.trim()) void act(() => api("PATCH", `/archives/${a.id}`, { title }));
}

function remove(a: ArchiveSummary) {
  if (confirm(`删除存档「${a.title}」？分享链接也会失效。`)) void act(() => api("DELETE", `/archives/${a.id}`));
}

async function share(a: ArchiveSummary) {
  await act(() => api("POST", `/archives/${a.id}/share`));
  const updated = archives.value.find((x) => x.id === a.id);
  if (updated?.shareId) await copy(updated.shareId);
}

async function copy(shareId: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(shareId));
    copied.value = shareId;
    setTimeout(() => (copied.value = null), 2000);
  } catch {
    prompt("复制下面的链接", shareUrl(shareId));
  }
}

async function logout() {
  await auth.logout();
  favorites.reset();
  await router.replace("/");
}

watch(
  () => auth.user,
  (u) => {
    if (u) void load();
    else if (auth.ready) void router.replace({ path: "/login", query: { next: "/account" } });
  },
);
onMounted(() => {
  if (auth.user) void load();
  else if (auth.ready) void router.replace({ path: "/login", query: { next: "/account" } });
});
</script>

<template>
  <main class="page">
    <template v-if="auth.user">
      <header class="head">
        <h1>{{ auth.user.username }}</h1>
        <button type="button" class="link" @click="logout">退出登录</button>
      </header>

      <section class="card block">
        <h2>B50 存档</h2>
        <p class="muted hint">在 B50 页查询后点「保存到云端」即可存档。分享链接任何人都能打开（只读），可以随时取消。</p>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="!archives.length" class="muted hint">还没有存档。</p>
        <ul class="list">
          <li v-for="a in archives" :key="a.id" class="row">
            <div class="info">
              <RouterLink :to="`/archives/${a.id}`" class="title">{{ a.title }}</RouterLink>
              <div class="muted meta">
                Rating {{ a.rating }} · {{ a.source === "lxns" ? "落雪" : "水鱼" }} ·
                {{ new Date(a.createdAt).toLocaleString("zh-CN") }}
              </div>
              <div v-if="a.shareId" class="share">
                <code>{{ shareUrl(a.shareId) }}</code>
                <button type="button" class="link" @click="copy(a.shareId)">{{ copied === a.shareId ? "已复制" : "复制" }}</button>
                <button type="button" class="link danger" @click="act(() => api('DELETE', `/archives/${a.id}/share`))">
                  取消分享
                </button>
              </div>
            </div>
            <div class="actions">
              <button v-if="!a.shareId" type="button" class="link" @click="share(a)">分享</button>
              <button type="button" class="link" @click="rename(a)">重命名</button>
              <button type="button" class="link danger" @click="remove(a)">删除</button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.head h1 {
  margin: 0;
  font-size: 20px;
}

.block {
  padding: 14px;
}

.block h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.hint {
  font-size: 12px;
  margin: 0 0 8px;
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

.row {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.info {
  flex: 1;
  min-width: 0;
}

.title {
  font-weight: 600;
  color: var(--text);
}

.meta {
  font-size: 12px;
}

.share {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 4px;
  font-size: 12px;
}

.share code {
  overflow-wrap: anywhere;
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 4px;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
}

.link.danger {
  color: var(--warn);
}
</style>
