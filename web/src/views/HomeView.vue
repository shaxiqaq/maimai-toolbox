<script setup lang="ts">
interface Feature {
  title: string;
  desc: string;
  to?: string;
  /** Milestone the feature is planned for, shown while unavailable. */
  plannedFor?: string;
}

const features: Feature[] = [
  { title: "曲库", desc: "搜索曲目、别名、定数和拟合难度", to: "/songs" },
  { title: "B50", desc: "查询 Best 50 与 Rating", to: "/b50" },
  { title: "成绩", desc: "全部成绩与筛选（落雪密钥）", to: "/records" },
  { title: "完成度", desc: "等级分布与版本完成进度", to: "/progress" },
  { title: "上分推荐", desc: "按 B50 底分推荐目标谱面", to: "/recommend" },
  { title: "计算器", desc: "达成率、容错与 Rating", to: "/calculator" },
  { title: "随机抽歌", desc: "按条件随机选曲", to: "/lottery" },
  { title: "收藏夹", desc: "云同步的歌单（需登录）", to: "/favorites" },
  { title: "谱面确认", desc: "曲目详情页跳转 DXRating 看谱面视频", to: "/songs" },
  { title: "机厅", desc: "附近 / 按地区查找舞萌机厅", to: "/arcades" },
  { title: "Bingo 海报", desc: "自定义 Bingo 表，可用成绩自动生成", to: "/bingo" },
  { title: "头像制作", desc: "照片加外圈、名字与 Rating 徽章", to: "/avatar" },
];
</script>

<template>
  <main class="page">
    <section class="hero">
      <h1>纱汐查分器</h1>
      <p class="muted">好友间自用的舞萌 DX 查分与工具站。数据来自水鱼查分器与落雪查分器。</p>
    </section>

    <section class="grid">
      <component
        :is="f.to ? 'RouterLink' : 'div'"
        v-for="f in features"
        :key="f.title"
        :to="f.to"
        class="card tile"
        :class="{ disabled: !f.to }"
      >
        <div class="tile-head">
          <strong>{{ f.title }}</strong>
          <span v-if="f.plannedFor" class="badge">{{ f.plannedFor }}</span>
        </div>
        <p class="muted">{{ f.desc }}</p>
      </component>
    </section>
  </main>
</template>

<style scoped>
.hero h1 {
  margin: 8px 0 4px;
  font-size: 26px;
}

.hero p {
  margin: 0 0 20px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.tile {
  padding: 14px;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.tile:not(.disabled):hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.tile.disabled {
  opacity: 0.55;
}

.tile-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tile p {
  margin: 6px 0 0;
  font-size: 13px;
}
</style>
