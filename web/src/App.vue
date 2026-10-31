<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import Icon, { type IconName } from "./components/Icon.vue";
import { useTheme } from "./composables/theme";
import { useAuthStore } from "./stores/auth";
import { useFriendsStore } from "./stores/friends";
import { usePlayerStore } from "./stores/player";

const auth = useAuthStore();
const player = usePlayerStore();
const friends = useFriendsStore();
const route = useRoute();
onMounted(() => void auth.refresh());

// Keep the score snapshot friends see in step with each lookup, if the user turned that on.
watch(
  () => [player.b50, auth.user] as const,
  ([b50, user]) => {
    if (b50 && user) void friends.autoUpload();
  },
);
// A different account must not see the previous one's friends.
watch(
  () => auth.user?.id,
  () => friends.reset(),
);

const { choice, cycle } = useTheme();
const themeLabel = computed(() => ({ system: "跟随系统", light: "浅色", dark: "深色" })[choice.value]);
const themeIcon = computed<IconName>(() => ({ system: "brightness_auto", light: "light_mode", dark: "dark_mode" } as const)[choice.value]);

interface NavLink {
  to: string;
  label: string;
  icon: IconName;
}

/** Sidebar on wide screens. */
const groups: { title?: string; links: NavLink[] }[] = [
  {
    links: [
      { to: "/", label: "首页", icon: "home" },
      { to: "/b50", label: "B50", icon: "emoji_events" },
      { to: "/records", label: "成绩", icon: "format_list_bulleted" },
      { to: "/progress", label: "完成度", icon: "donut_large" },
      { to: "/collections", label: "牌子", icon: "military_tech" },
      { to: "/recommend", label: "上分推荐", icon: "trending_up" },
      { to: "/skills", label: "能力雷达", icon: "insights" },
    ],
  },
  {
    title: "工具",
    links: [
      { to: "/songs", label: "曲库", icon: "library_music" },
      { to: "/calculator", label: "计算器", icon: "calculate" },
      { to: "/lottery", label: "随机抽歌", icon: "casino" },
      { to: "/arcades", label: "机厅", icon: "place" },
    ],
  },
  {
    title: "账号",
    links: [
      { to: "/friends", label: "好友", icon: "group" },
      { to: "/favorites", label: "收藏夹", icon: "star" },
    ],
  },
];

/** Bottom bar on phones; everything else is reachable from the home page. */
const tabs = computed<NavLink[]>(() => [
  { to: "/", label: "首页", icon: "home" },
  { to: "/b50", label: "B50", icon: "emoji_events" },
  { to: "/songs", label: "曲库", icon: "library_music" },
  { to: "/friends", label: "好友", icon: "group" },
  auth.user ? { to: "/account", label: "我的", icon: "person" } : { to: "/login", label: "登录", icon: "login" },
]);

/** "/" must match exactly; other links also light up on their sub-pages (e.g. /songs/834). */
function isActive(to: string): boolean {
  return to === "/" ? route.path === "/" : route.path === to || route.path.startsWith(`${to}/`);
}

const loginTarget = computed(() => ({ path: "/login", query: { next: route.fullPath } }));
</script>

<template>
  <div class="shell">
    <aside class="rail">
      <RouterLink to="/" class="brand">
        <span class="logo" aria-hidden="true"><Icon name="music_note" :size="20" /></span>
        <span>纱汐查分器</span>
      </RouterLink>
      <nav class="rail-nav" aria-label="主导航">
        <template v-for="(g, gi) in groups" :key="gi">
          <p v-if="g.title" class="rail-title">{{ g.title }}</p>
          <RouterLink v-for="l in g.links" :key="l.to" :to="l.to" class="rail-link" :class="{ on: isActive(l.to) }">
            <Icon :name="l.icon" />
            <span>{{ l.label }}</span>
          </RouterLink>
        </template>
        <RouterLink v-if="auth.isAdmin" to="/admin" class="rail-link" :class="{ on: isActive('/admin') }">
          <Icon name="admin_panel_settings" />
          <span>管理后台</span>
        </RouterLink>
      </nav>
      <div class="rail-foot">
        <button class="rail-link" type="button" :title="`主题：${themeLabel}（点击切换）`" @click="cycle">
          <Icon :name="themeIcon" />
          <span>{{ themeLabel }}</span>
        </button>
        <RouterLink v-if="auth.user" to="/account" class="me" :class="{ on: isActive('/account') }">
          <span class="avatar" aria-hidden="true">{{ auth.user.username.slice(0, 1).toUpperCase() }}</span>
          <span class="me-name">{{ auth.user.username }}</span>
        </RouterLink>
        <RouterLink v-else-if="auth.ready" :to="loginTarget" class="me">
          <span class="avatar ghost" aria-hidden="true"><Icon name="person" :size="18" /></span>
          <span class="me-name">未登录</span>
        </RouterLink>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <RouterLink to="/" class="brand">
          <span class="logo" aria-hidden="true"><Icon name="music_note" :size="18" /></span>
          <span>纱汐查分器</span>
        </RouterLink>
        <button class="icon-btn" type="button" :title="`主题：${themeLabel}`" :aria-label="`主题：${themeLabel}`" @click="cycle">
          <Icon :name="themeIcon" />
        </button>
      </header>
      <RouterView />
      <footer class="footer">
        <p>纱汐查分器 · 好友自用、非商业 · 数据来自水鱼查分器与落雪查分器 · 与 SEGA 无关</p>
        <p>
          <a href="https://github.com/shaxiqaq/maimai-toolbox" target="_blank" rel="noopener">GitHub</a>
          ·
          <RouterLink to="/feedback">意见反馈</RouterLink>
        </p>
      </footer>
    </div>

    <nav class="tabbar" aria-label="主导航">
      <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ on: isActive(t.to) }">
        <span class="tab-icon"><Icon :name="t.icon" :size="22" /></span>
        <span>{{ t.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.main {
  flex: 1;
  min-width: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 16px;
}

.logo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
}

/* ---- Sidebar (wide screens) ---- */

.rail {
  position: sticky;
  top: 12px;
  flex: none;
  display: flex;
  flex-direction: column;
  width: 208px;
  height: calc(100vh - 24px);
  margin: 12px 0 12px 12px;
  padding: 16px 10px 12px;
  border-radius: 24px;
  background: var(--nav-bg);
  border: 1px solid var(--border);
}

.rail > .brand {
  padding: 0 8px 14px;
}

.rail-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 2px;
  scrollbar-width: none;
}

.rail-title {
  margin: 12px 14px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.rail-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.rail-link:hover {
  background: var(--surface-2);
}

.rail-link.on {
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  font-weight: 700;
}

.rail-foot {
  display: grid;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
}

.me:hover,
.me.on {
  background: var(--surface-2);
}

.avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 14px;
  font-weight: 700;
}

.avatar.ghost {
  background: var(--surface-3);
  color: var(--text-muted);
}

.me-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Top bar and bottom tabs (phones) ---- */

.topbar,
.tabbar {
  display: none;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--surface);
  cursor: pointer;
}

.footer {
  max-width: 1040px;
  margin: 0 auto;
  padding: 8px 16px 28px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.footer p {
  margin: 2px 0;
}

.footer a {
  color: var(--accent);
}

@media (max-width: 899px) {
  .rail {
    display: none;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(8px + env(safe-area-inset-top)) 16px 8px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .footer {
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }

  .tabbar {
    position: fixed;
    inset: auto 0 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
    background: var(--nav-bg);
    border-top: 1px solid var(--border);
  }

  .tab {
    display: grid;
    justify-items: center;
    gap: 3px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .tab-icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 30px;
    border-radius: 999px;
    transition: background-color 0.15s ease;
  }

  .tab.on {
    color: var(--text);
    font-weight: 700;
  }

  .tab.on .tab-icon {
    background: var(--accent-soft);
    color: var(--on-accent-soft);
  }
}
</style>
