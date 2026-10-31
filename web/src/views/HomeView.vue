<script setup lang="ts">
import { summarizeB50 } from "@mt/shared";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api";
import Icon, { type IconName } from "@/components/Icon.vue";
import { ratingTier } from "@/composables/ratingTier";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player";

interface Announcement {
  id: number;
  title: string;
  body: string;
  createdAt: number;
}

const SEEN_KEY = "seenAnnouncement";
const announcements = ref<Announcement[]>([]);
const seen = ref(readSeen());
const showHistory = ref(false);
const latest = computed(() => announcements.value[0] ?? null);
const unread = computed(() => !!latest.value && latest.value.id > seen.value);

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function dismiss() {
  if (!latest.value) return;
  seen.value = latest.value.id;
  try {
    localStorage.setItem(SEEN_KEY, String(latest.value.id));
  } catch {
    // Shown again next visit.
  }
}

const auth = useAuthStore();
const player = usePlayerStore();
const router = useRouter();
const summary = computed(() => (player.b50 ? summarizeB50(player.b50.b35, player.b50.b15) : null));
const greetingName = computed(() => player.b50?.nickname || auth.user?.username || "玩家");
const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 6 ? "夜深了" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
});

const search = ref("");
function goSearch() {
  const q = search.value.trim();
  void router.push({ path: "/songs", query: q ? { query: q } : {} });
}

onMounted(async () => {
  void player.restore();
  announcements.value = await api<Announcement[]>("GET", "/announcements").catch(() => []);
});

type Tint = "pink" | "orange" | "blue" | "purple" | "green" | "yellow";

interface Feature {
  icon: IconName;
  tint: Tint;
  title: string;
  desc: string;
  to: string;
}

const features: Feature[] = [
  { icon: "library_music", tint: "pink", title: "曲库", desc: "曲目、别名、定数、拟合难度与谱面确认", to: "/songs" },
  { icon: "emoji_events", tint: "orange", title: "B50", desc: "Best 50 与 Rating，可生成图片", to: "/b50" },
  { icon: "format_list_bulleted", tint: "blue", title: "成绩", desc: "全部成绩与筛选（落雪密钥）", to: "/records" },
  { icon: "donut_large", tint: "green", title: "完成度", desc: "等级分布与版本完成进度", to: "/progress" },
  { icon: "military_tech", tint: "yellow", title: "牌子与收藏品", desc: "将/極/神/舞舞、称号、头像、背景", to: "/collections" },
  { icon: "trending_up", tint: "purple", title: "上分推荐", desc: "按 B50 底分推荐目标谱面", to: "/recommend" },
  { icon: "insights", tint: "blue", title: "能力雷达", desc: "按谱面标签看擅长与薄弱", to: "/skills" },
  { icon: "calculate", tint: "green", title: "计算器", desc: "达成率、容错与 Rating", to: "/calculator" },
  { icon: "casino", tint: "pink", title: "随机抽歌", desc: "按条件随机选曲", to: "/lottery" },
  { icon: "group", tint: "purple", title: "好友对比", desc: "互加好友，逐张谱面比成绩", to: "/friends" },
  { icon: "star", tint: "yellow", title: "收藏夹", desc: "云同步的歌单", to: "/favorites" },
  { icon: "place", tint: "orange", title: "机厅", desc: "附近 / 按地区查找舞萌机厅", to: "/arcades" },
  { icon: "grid_view", tint: "blue", title: "Bingo 海报", desc: "自定义 Bingo 表，可按成绩生成", to: "/bingo" },
  { icon: "face", tint: "pink", title: "头像制作", desc: "照片加外圈、名字与 Rating 徽章", to: "/avatar" },
  { icon: "feedback", tint: "green", title: "意见反馈", desc: "报告问题或提建议", to: "/feedback" },
];
</script>

<template>
  <main class="page">
    <header class="greet">
      <span class="greet-avatar" aria-hidden="true">{{ greetingName.slice(0, 1).toUpperCase() }}</span>
      <div>
        <h1>{{ greeting }}，{{ greetingName }}</h1>
        <p class="muted">我的舞萌 DX 工作台</p>
      </div>
    </header>

    <form class="search" role="search" @submit.prevent="goSearch">
      <Icon name="search" />
      <input v-model="search" type="search" placeholder="搜索歌曲、别名、曲师、ID…" aria-label="搜索歌曲" />
    </form>

    <section v-if="unread && latest" class="card notice">
      <div class="notice-head">
        <strong>{{ latest.title }}</strong>
        <span class="muted small">{{ new Date(latest.createdAt).toLocaleDateString("zh-CN") }}</span>
      </div>
      <p>{{ latest.body }}</p>
      <button type="button" class="link" @click="dismiss">知道了</button>
    </section>

    <div class="overview">
      <RouterLink to="/b50" class="player">
        <template v-if="player.b50 && summary">
          <div class="player-top">
            <strong class="player-name">{{ player.b50.nickname || player.b50.username }}</strong>
            <span class="pill">{{ player.b50.source === "lxns" ? "落雪" : "水鱼" }}</span>
          </div>
          <div class="player-bottom">
            <span class="muted small">DX Rating</span>
            <b class="rating-plate" :class="`tier-${ratingTier(summary.total)}`">{{ summary.total }}</b>
          </div>
        </template>
        <template v-else>
          <div class="player-top">
            <strong class="player-name">{{ player.loading ? "正在读取成绩…" : "还没有查询成绩" }}</strong>
          </div>
          <div class="player-bottom">
            <span class="muted small">用水鱼用户名、QQ 或落雪密钥查询 B50</span>
            <span class="go">去查询 <Icon name="chevron_right" :size="18" /></span>
          </div>
        </template>
      </RouterLink>

      <div class="stats">
        <div class="card stat">
          <span class="stat-label"><Icon name="trending_up" :size="16" /> B35</span>
          <b>{{ summary?.b35 ?? "—" }}</b>
          <span class="muted small">底分 {{ summary?.b35Floor || "—" }}</span>
        </div>
        <div class="card stat">
          <span class="stat-label"><Icon name="star" :size="16" /> B15</span>
          <b>{{ summary?.b15 ?? "—" }}</b>
          <span class="muted small">底分 {{ summary?.b15Floor || "—" }}</span>
        </div>
      </div>
    </div>

    <h2 class="section-title">功能入口</h2>
    <div class="grid">
      <RouterLink v-for="f in features" :key="f.title" :to="f.to" class="card tile" :title="f.desc">
        <span class="tile-icon" :class="f.tint"><Icon :name="f.icon" /></span>
        <strong>{{ f.title }}</strong>
        <span class="tile-desc muted">{{ f.desc }}</span>
      </RouterLink>
    </div>

    <section v-if="announcements.length" class="history">
      <button type="button" class="link muted" @click="showHistory = !showHistory">
        {{ showHistory ? "收起公告" : `历史公告（${announcements.length}）` }}
      </button>
      <ul v-if="showHistory">
        <li v-for="a in announcements" :key="a.id">
          <strong>{{ a.title }}</strong>
          <span class="muted small"> · {{ new Date(a.createdAt).toLocaleDateString("zh-CN") }}</span>
          <p>{{ a.body }}</p>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.greet {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 4px 0 16px;
}

.greet-avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  font-size: 20px;
  font-weight: 700;
}

.greet h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.greet p {
  margin: 0;
  font-size: 13px;
}

.search {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 18px;
  margin-bottom: 16px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
}

.search:focus-within {
  background: var(--surface-2);
}

.search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 15px;
  color: var(--text);
}

.notice {
  padding: 14px 18px;
  margin-bottom: 16px;
  background: var(--tint-yellow);
}

.notice-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.notice p,
.history p {
  margin: 6px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
}

.small {
  font-size: 12px;
}

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.overview {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
}

.player {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  min-height: 168px;
  padding: 20px 22px;
  border-radius: 24px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  transition: filter 0.15s ease;
}

.player:hover {
  filter: brightness(0.97);
}

.player .muted {
  color: inherit;
  opacity: 0.75;
}

.player-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.player-name {
  font-size: 22px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.pill {
  flex: none;
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--on-accent-soft) 12%, transparent);
  font-size: 12px;
  font-weight: 600;
}

.player-bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.player-bottom .rating-plate {
  font-size: 30px;
  line-height: 1.2;
}

.go {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px 6px 16px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 14px;
  font-weight: 600;
}

.stats {
  display: grid;
  gap: 12px;
}

.stat {
  display: grid;
  align-content: center;
  padding: 14px 18px;
}

.stat-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.stat b {
  font-size: 24px;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}

.section-title {
  margin: 28px 4px 12px;
  font-size: 18px;
  font-weight: 700;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.tile {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 6px;
  padding: 16px 10px;
  text-align: center;
}

.tile strong {
  font-size: 14px;
  font-weight: 600;
}

.tile-desc {
  font-size: 12px;
  line-height: 1.4;
}

.tile-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
}

.tile-icon.pink {
  background: var(--tint-pink);
  color: var(--tint-ink-pink);
}

.tile-icon.orange {
  background: var(--tint-orange);
  color: var(--tint-ink-orange);
}

.tile-icon.blue {
  background: var(--tint-blue);
  color: var(--tint-ink-blue);
}

.tile-icon.purple {
  background: var(--tint-purple);
  color: var(--tint-ink-purple);
}

.tile-icon.green {
  background: var(--tint-green);
  color: var(--tint-ink-green);
}

.tile-icon.yellow {
  background: var(--tint-yellow);
  color: var(--tint-ink-yellow);
}

.history {
  margin-top: 18px;
}

.history ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.history li {
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

@media (max-width: 639px) {
  .overview {
    grid-template-columns: 1fr;
  }

  .stats {
    grid-template-columns: 1fr 1fr;
  }

  .tile {
    padding: 14px 6px;
  }

  .tile-desc {
    display: none;
  }
}
</style>
