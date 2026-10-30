<script setup lang="ts">
import type { Song } from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import LevelPill from "@/components/LevelPill.vue";
import SongJacket from "@/components/SongJacket.vue";
import { useAuthStore } from "@/stores/auth";
import { useCatalogStore } from "@/stores/catalog";
import { useFavoritesStore } from "@/stores/favorites";

const auth = useAuthStore();
const catalog = useCatalogStore();
const favorites = useFavoritesStore();

const selected = ref<string | null>(null);
const newName = ref("");
const renaming = ref(false);
const renameValue = ref("");

const folder = computed(() => favorites.folders.find((f) => f.id === selected.value) ?? favorites.folders[0] ?? null);
const songs = computed(() =>
  (folder.value?.songIds ?? []).map((id) => catalog.getSong(id)).filter((s): s is Song => !!s),
);

async function create() {
  const name = newName.value.trim();
  if (!name) return;
  try {
    const f = await favorites.createFolder(name);
    newName.value = "";
    selected.value = f.id;
  } catch (err) {
    favorites.error = (err as Error).message;
  }
}

async function remove() {
  if (!folder.value || !confirm(`删除收藏夹「${folder.value.name}」？里面的 ${folder.value.songIds.length} 首会一起移除。`)) return;
  await favorites.deleteFolder(folder.value.id).catch(() => {});
  selected.value = null;
}

async function saveRename() {
  if (folder.value && renameValue.value.trim()) await favorites.renameFolder(folder.value.id, renameValue.value).catch(() => {});
  renaming.value = false;
}

watch(
  () => auth.user,
  (u) => {
    if (u) void favorites.load(true);
    else favorites.reset();
  },
  { immediate: true },
);
onMounted(() => void catalog.load());
</script>

<template>
  <main class="page">
    <section v-if="auth.ready && !auth.user" class="card needs">
      <p>收藏夹保存在你的账号里，可以在多台设备之间同步。</p>
      <RouterLink :to="{ path: '/login', query: { next: '/favorites' } }" class="go">登录或注册 →</RouterLink>
    </section>

    <template v-else-if="auth.user">
      <div class="folders">
        <button
          v-for="f in favorites.folders"
          :key="f.id"
          type="button"
          class="chip"
          :class="{ on: folder?.id === f.id }"
          @click="selected = f.id"
        >
          {{ f.name }} <span>{{ f.songIds.length }}</span>
        </button>
        <form class="new" @submit.prevent="create">
          <input v-model="newName" class="field" maxlength="30" placeholder="新建收藏夹" />
          <button type="submit" class="chip" :disabled="!newName.trim()">＋</button>
        </form>
      </div>
      <p v-if="favorites.error" class="err">{{ favorites.error }}</p>

      <section v-if="folder" class="card body">
        <header class="head">
          <template v-if="!renaming">
            <h1>{{ folder.name }}</h1>
            <button type="button" class="link" @click="(renaming = true), (renameValue = folder.name)">重命名</button>
            <button type="button" class="link danger" @click="remove">删除</button>
          </template>
          <form v-else class="rename" @submit.prevent="saveRename">
            <input v-model="renameValue" class="field" maxlength="30" />
            <button type="submit" class="link">保存</button>
            <button type="button" class="link" @click="renaming = false">取消</button>
          </form>
        </header>

        <p v-if="!songs.length" class="muted empty">还没有曲目。在曲目详情页点「收藏」即可加入。</p>
        <ul class="list">
          <li v-for="s in songs" :key="s.id" class="row">
            <RouterLink :to="`/songs/${s.id}`" class="song">
              <SongJacket :song="s" :alt="s.title" :size="44" />
              <div class="info">
                <div class="title">{{ s.title }}</div>
                <div class="levels">
                  <LevelPill v-for="c in s.charts" :key="c.difficulty" :difficulty="c.difficulty" :level="c.level" />
                </div>
              </div>
            </RouterLink>
            <button type="button" class="link" @click="favorites.toggleSong(folder.id, s.id).catch(() => {})">移除</button>
          </li>
        </ul>
      </section>
      <p v-else-if="favorites.loaded" class="muted empty">还没有收藏夹，先新建一个吧。</p>
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

.folders {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.chip {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
}

.chip span {
  color: var(--text-muted);
  margin-left: 2px;
}

.chip.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.chip.on span {
  color: inherit;
  opacity: 0.8;
}

.new {
  display: flex;
  gap: 4px;
}

.new .field {
  width: 140px;
  min-height: 30px;
  padding: 2px 8px;
  font-size: 13px;
}

.err {
  color: var(--warn);
  font-size: 13px;
}

.body {
  padding: 12px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.head h1 {
  font-size: 18px;
  margin: 0;
  margin-right: auto;
}

.rename {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  flex: none;
}

.link.danger {
  color: var(--warn);
}

.empty {
  font-size: 13px;
  margin: 8px 0;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}

.song {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.info {
  min-width: 0;
}

.title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.levels {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
</style>
