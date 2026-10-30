<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "./composables/theme";

const { choice, cycle } = useTheme();
const themeLabel = computed(() => ({ system: "跟随系统", light: "浅色", dark: "深色" })[choice.value]);
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <RouterLink to="/" class="brand">舞萌工具箱</RouterLink>
      <nav class="nav">
        <RouterLink to="/b50">B50</RouterLink>
        <RouterLink to="/songs">曲库</RouterLink>
        <button class="theme" type="button" :title="`主题：${themeLabel}`" @click="cycle">
          {{ themeLabel }}
        </button>
      </nav>
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
  height: 52px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.nav {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px;
}

.nav a.router-link-active {
  color: var(--accent);
  font-weight: 600;
}

.theme {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
