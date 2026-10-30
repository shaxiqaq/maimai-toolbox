<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "./composables/theme";

const { choice, cycle } = useTheme();
const themeLabel = computed(() => ({ system: "跟随系统", light: "浅色", dark: "深色" })[choice.value]);

const links = [
  { to: "/b50", label: "B50" },
  { to: "/records", label: "成绩" },
  { to: "/progress", label: "进度" },
  { to: "/recommend", label: "推荐" },
  { to: "/calculator", label: "计算器" },
  { to: "/lottery", label: "抽歌" },
  { to: "/songs", label: "曲库" },
];
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <RouterLink to="/" class="brand">舞萌工具箱</RouterLink>
      <nav class="nav" aria-label="主导航">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
      </nav>
      <button class="theme" type="button" :title="`主题：${themeLabel}`" @click="cycle">{{ themeLabel }}</button>
    </div>
  </header>
  <RouterView />
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  padding-top: env(safe-area-inset-top);
}

.topbar-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 16px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: "brand nav theme";
  align-items: center;
  gap: 4px 16px;
  min-height: 52px;
}

.brand {
  grid-area: brand;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.nav {
  grid-area: nav;
  display: flex;
  gap: 16px;
  font-size: 14px;
  overflow-x: auto;
  scrollbar-width: none;
}

.nav a {
  flex: none;
  padding: 6px 0;
}

.nav a.router-link-active {
  color: var(--accent);
  font-weight: 600;
}

.theme {
  grid-area: theme;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}

/* Phones: brand + theme on the first row, the nav scrolls on its own row. */
@media (max-width: 559px) {
  .topbar-inner {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "brand theme"
      "nav nav";
    padding-top: 8px;
  }
}
</style>
