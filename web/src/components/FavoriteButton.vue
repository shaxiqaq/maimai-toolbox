<script setup lang="ts">
import { computed, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useFavoritesStore } from "@/stores/favorites";

const props = defineProps<{ songId: number }>();
const auth = useAuthStore();
const favorites = useFavoritesStore();

const open = ref(false);
const newName = ref("");
const inCount = computed(() => favorites.folders.filter((f) => f.songIds.includes(props.songId)).length);

async function toggleOpen() {
  open.value = !open.value;
  if (open.value) await favorites.load();
}

async function addFolder() {
  const name = newName.value.trim();
  if (!name) return;
  try {
    const folder = await favorites.createFolder(name);
    newName.value = "";
    await favorites.toggleSong(folder.id, props.songId);
  } catch {
    // error is shown from the store
  }
}
</script>

<template>
  <div class="fav">
    <RouterLink v-if="!auth.user" :to="{ path: '/login', query: { next: $route.fullPath } }" class="btn">登录后收藏</RouterLink>
    <template v-else>
      <button type="button" class="btn" :class="{ on: inCount }" @click="toggleOpen">
        {{ inCount ? `★ 已收藏（${inCount}）` : "☆ 收藏" }}
      </button>
      <div v-if="open" class="card menu">
        <label v-for="f in favorites.folders" :key="f.id" class="item">
          <input type="checkbox" :checked="f.songIds.includes(songId)" @change="favorites.toggleSong(f.id, songId).catch(() => {})" />
          {{ f.name }} <span class="muted">{{ f.songIds.length }}</span>
        </label>
        <form class="new" @submit.prevent="addFolder">
          <input v-model="newName" class="field" maxlength="30" placeholder="新建收藏夹" />
          <button type="submit" class="btn" :disabled="!newName.trim()">新建</button>
        </form>
        <p v-if="favorites.error" class="err">{{ favorites.error }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fav {
  position: relative;
}

.btn {
  display: inline-block;
  padding: 4px 12px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn.on {
  background: var(--accent);
  color: var(--accent-contrast);
}

.btn:disabled {
  opacity: 0.5;
}

.menu {
  position: absolute;
  z-index: 6;
  top: calc(100% + 6px);
  left: 0;
  width: min(280px, calc(100vw - 32px));
  padding: 8px;
  display: grid;
  gap: 4px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  font-size: 13px;
  cursor: pointer;
}

.new {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.new .field {
  min-height: 32px;
  padding: 4px 8px;
}

.err {
  margin: 0;
  color: var(--warn);
  font-size: 12px;
}
</style>
