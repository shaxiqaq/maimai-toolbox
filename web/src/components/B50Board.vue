<script setup lang="ts">
import { summarizeB50, type PlayerB50 } from "@mt/shared";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useCatalogStore } from "@/stores/catalog";
import RecordCard from "./RecordCard.vue";

/** Read-only B50 view (summary, B35/B15 tabs, image export) for saved or shared snapshots. */
const props = defineProps<{ b50: PlayerB50; title?: string }>();
const catalog = useCatalogStore();

const tab = ref<"b35" | "b15">("b35");
const summary = computed(() => summarizeB50(props.b50.b35, props.b50.b15));

const imageUrl = ref<string | null>(null);
const rendering = ref(false);
async function exportImage() {
  if (!catalog.catalog) return;
  rendering.value = true;
  try {
    const { renderB50Image } = await import("@/composables/b50Image");
    const blob = await renderB50Image(props.b50, new Map(catalog.catalog.songs.map((s) => [s.id, s])));
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = URL.createObjectURL(blob);
  } finally {
    rendering.value = false;
  }
}
watch(
  () => props.b50,
  () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = null;
  },
);
onBeforeUnmount(() => imageUrl.value && URL.revokeObjectURL(imageUrl.value));
</script>

<template>
  <section class="card summary">
    <div class="who">
      <strong>{{ title ?? (b50.nickname || b50.username) }}</strong>
      <span class="badge">{{ b50.source === "lxns" ? "落雪" : "水鱼" }}</span>
    </div>
    <div class="muted when">{{ b50.nickname || b50.username }} · 数据时间 {{ new Date(b50.fetchedAt).toLocaleString("zh-CN") }}</div>
    <div class="total">
      <span class="muted">DX Rating</span>
      <b>{{ summary.total }}</b>
    </div>
    <dl class="parts">
      <div><dt>旧版本 B35</dt><dd>{{ summary.b35 }}</dd></div>
      <div><dt>当前版本 B15</dt><dd>{{ summary.b15 }}</dd></div>
      <div><dt>B35 底分</dt><dd>{{ summary.b35Floor || "—" }}</dd></div>
      <div><dt>B15 底分</dt><dd>{{ summary.b15Floor || "—" }}</dd></div>
    </dl>
    <div>
      <button type="button" class="secondary" :disabled="rendering || !catalog.catalog" @click="exportImage">
        {{ rendering ? "生成中…" : "生成图片" }}
      </button>
    </div>
  </section>

  <section v-if="imageUrl" class="card preview">
    <a :href="imageUrl" :download="`B50-${b50.nickname || b50.username}.png`" class="secondary">下载图片</a>
    <img :src="imageUrl" alt="B50 图片预览" />
  </section>

  <div class="tabs">
    <button type="button" :class="{ on: tab === 'b35' }" @click="tab = 'b35'">B35 <span>{{ b50.b35.length }}</span></button>
    <button type="button" :class="{ on: tab === 'b15' }" @click="tab = 'b15'">B15 <span>{{ b50.b15.length }}</span></button>
  </div>
  <ul class="grid">
    <li v-for="(r, i) in b50[tab]" :key="`${r.songId}-${r.difficulty}`">
      <RecordCard :record="r" :index="i" />
    </li>
  </ul>
</template>

<style scoped>
.summary {
  padding: 14px;
  margin-bottom: 12px;
  display: grid;
  gap: 8px;
}

.who {
  display: flex;
  align-items: center;
  gap: 8px;
}

.when {
  font-size: 12px;
}

.total {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.total b {
  font-size: 34px;
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.parts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

@media (min-width: 720px) {
  .parts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.parts div {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}

.parts dt {
  font-size: 12px;
  color: var(--text-muted);
}

.parts dd {
  margin: 0;
  font-weight: 700;
}

.secondary {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.preview {
  padding: 12px;
  margin-bottom: 12px;
  display: grid;
  gap: 10px;
  justify-items: start;
}

.preview img {
  width: 100%;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.tabs button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
}

.tabs button span {
  color: var(--text-muted);
}

.tabs button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.tabs button.on span {
  color: inherit;
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

@media (min-width: 720px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
