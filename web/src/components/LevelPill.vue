<script setup lang="ts">
defineProps<{ difficulty: number; level: string; utage?: boolean }>();
</script>

<template>
  <span class="pill" :style="{ background: utage ? 'var(--diff-utage)' : `var(--diff-${difficulty})` }">{{ level }}</span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  justify-content: center;
  min-width: 30px;
  height: 20px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  color: #fff;
}
</style>
