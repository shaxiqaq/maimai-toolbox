<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";

defineProps<{ feature: string }>();
const player = usePlayerStore();
</script>

<template>
  <section class="card needs">
    <p v-if="player.loading" class="muted">正在加载成绩…</p>
    <template v-else>
      <p>
        {{ feature }}需要<strong>全部成绩</strong>。目前只有通过落雪个人密钥查询时才能拿到全部成绩，
        水鱼的公开查询只返回 B50。
      </p>
      <RouterLink to="/b50" class="go">去 B50 页用落雪密钥查询 →</RouterLink>
      <p v-if="player.error" class="err">{{ player.error }}</p>
    </template>
  </section>
</template>

<style scoped>
.needs {
  padding: 16px;
  text-align: center;
}

.needs p {
  margin: 0 0 10px;
}

.go {
  color: var(--accent);
  font-weight: 600;
}

.err {
  margin-top: 10px !important;
  color: var(--warn);
  font-size: 13px;
}
</style>
