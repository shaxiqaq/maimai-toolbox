<script setup lang="ts">
import { jacketUrl, type Song } from "@mt/shared";
import { ref } from "vue";

defineProps<{ song: Pick<Song, "id" | "lxnsId">; alt?: string; size?: number }>();
const failed = ref(false);
</script>

<template>
  <div class="jacket" :style="{ width: `${size ?? 56}px`, height: `${size ?? 56}px` }">
    <img
      v-if="!failed"
      :src="jacketUrl(song)"
      :alt="alt ?? ''"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
  </div>
</template>

<style scoped>
.jacket {
  flex: none;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-2);
}

.jacket img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
