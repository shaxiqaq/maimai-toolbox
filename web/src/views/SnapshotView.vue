<script setup lang="ts">
import type { PlayerB50 } from "@mt/shared";
import { onMounted, ref, watch } from "vue";
import { api } from "@/api";
import B50Board from "@/components/B50Board.vue";
import { useCatalogStore } from "@/stores/catalog";

/** Shows one saved B50: the owner's archive (`archiveId`) or a public share link (`shareId`). */
const props = defineProps<{ archiveId?: string; shareId?: string }>();
const catalog = useCatalogStore();

const snapshot = ref<{ title: string; b50: PlayerB50 } | null>(null);
const error = ref<string | null>(null);

async function load() {
  snapshot.value = null;
  error.value = null;
  try {
    snapshot.value = props.shareId
      ? await api("GET", `/shared/${encodeURIComponent(props.shareId)}`)
      : await api("GET", `/archives/${encodeURIComponent(props.archiveId ?? "")}`);
  } catch (err) {
    error.value = (err as Error).message;
  }
}

watch(() => [props.archiveId, props.shareId], load);
onMounted(() => {
  void catalog.load();
  void load();
});
</script>

<template>
  <main class="page">
    <RouterLink v-if="archiveId" to="/account" class="back muted">← 我的存档</RouterLink>
    <p v-if="error" class="state">{{ error }}</p>
    <p v-else-if="!snapshot" class="state muted">加载中…</p>
    <B50Board v-else :b50="snapshot.b50" :title="snapshot.title" />
  </main>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 10px;
  font-size: 14px;
}

.state {
  text-align: center;
  padding: 32px 0;
}
</style>
