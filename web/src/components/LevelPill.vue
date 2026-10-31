<script setup lang="ts">
defineProps<{ difficulty: number; level: string; utage?: boolean }>();
</script>

<template>
  <span class="pill" :class="{ remaster: !utage && difficulty === 4 }" :style="{ '--c': utage ? 'var(--diff-utage)' : `var(--diff-${difficulty})` }">{{ level }}</span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  justify-content: center;
  min-width: 32px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--font-num);
  line-height: 20px;
  color: #fff;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 82%, #fff), var(--c));
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.2);
}

/* Re:MASTER is white with a purple rim in game. */
.pill.remaster {
  background: #fff;
  color: var(--diff-3);
  box-shadow: inset 0 0 0 1.5px var(--diff-4);
  text-shadow: none;
  line-height: 20px;
}
</style>
