<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "@/api";

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

onMounted(async () => {
  announcements.value = await api<Announcement[]>("GET", "/announcements").catch(() => []);
});

interface Feature {
  title: string;
  desc: string;
  to?: string;
  /** Milestone the feature is planned for, shown while unavailable. */
  plannedFor?: string;
}

const features: Feature[] = [
  { title: "曲库", desc: "搜索曲目、别名、定数和拟合难度", to: "/songs" },
  { title: "B50", desc: "查询 Best 50 与 Rating", to: "/b50" },
  { title: "成绩", desc: "全部成绩与筛选（落雪密钥）", to: "/records" },
  { title: "完成度", desc: "等级分布与版本完成进度", to: "/progress" },
  { title: "牌子与收藏品", desc: "将/極/神/舞舞进度、称号、头像、背景", to: "/collections" },
  { title: "上分推荐", desc: "按 B50 底分推荐目标谱面", to: "/recommend" },
  { title: "计算器", desc: "达成率、容错与 Rating", to: "/calculator" },
  { title: "随机抽歌", desc: "按条件随机选曲", to: "/lottery" },
  { title: "能力雷达", desc: "按谱面标签看擅长与薄弱的类型", to: "/skills" },
  { title: "好友对比", desc: "互加好友，逐张谱面比成绩（需登录）", to: "/friends" },
  { title: "收藏夹", desc: "云同步的歌单（需登录）", to: "/favorites" },
  { title: "谱面确认", desc: "曲目详情页跳转 DXRating 看谱面视频", to: "/songs" },
  { title: "机厅", desc: "附近 / 按地区查找舞萌机厅", to: "/arcades" },
  { title: "Bingo 海报", desc: "自定义 Bingo 表，可用成绩自动生成", to: "/bingo" },
  { title: "头像制作", desc: "照片加外圈、名字与 Rating 徽章", to: "/avatar" },
  { title: "意见反馈", desc: "报告问题或提建议", to: "/feedback" },
];
</script>

<template>
  <main class="page">
    <section class="hero">
      <h1>纱汐查分器</h1>
      <p class="muted">好友间自用的舞萌 DX 查分与工具站。数据来自水鱼查分器与落雪查分器。</p>
    </section>

    <section v-if="unread && latest" class="card notice">
      <div class="notice-head">
        <strong>📢 {{ latest.title }}</strong>
        <span class="muted small">{{ new Date(latest.createdAt).toLocaleDateString("zh-CN") }}</span>
      </div>
      <p>{{ latest.body }}</p>
      <button type="button" class="link" @click="dismiss">知道了</button>
    </section>

    <section class="grid">
      <component
        :is="f.to ? 'RouterLink' : 'div'"
        v-for="f in features"
        :key="f.title"
        :to="f.to"
        class="card tile"
        :class="{ disabled: !f.to }"
      >
        <div class="tile-head">
          <strong>{{ f.title }}</strong>
          <span v-if="f.plannedFor" class="badge">{{ f.plannedFor }}</span>
        </div>
        <p class="muted">{{ f.desc }}</p>
      </component>
    </section>

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
.hero h1 {
  margin: 8px 0 4px;
  font-size: 26px;
}

.hero p {
  margin: 0 0 20px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.tile {
  padding: 14px;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.tile:not(.disabled):hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.tile.disabled {
  opacity: 0.55;
}

.notice {
  padding: 12px 14px;
  margin-bottom: 14px;
  border-color: var(--accent);
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

.tile-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tile p {
  margin: 6px 0 0;
  font-size: 13px;
}
</style>
