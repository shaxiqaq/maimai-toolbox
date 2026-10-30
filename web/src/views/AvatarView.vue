<script setup lang="ts">
import { summarizeB50 } from "@mt/shared";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePlayerStore } from "@/stores/player";

/** Output size and the photo circle inside it. */
const SIZE = 512;
const CX = SIZE / 2;
const CY = SIZE / 2;
const PHOTO_R = 200;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
const ACCENTS = ["#0d8a78", "#ff4f9e", "#38c6ff", "#8c4fd6", "#ff6a13", "#1a1f1c"];

/** DX Rating band colours (our own palette, loosely following the in-game tiers). */
function ratingColor(r: number): string | [string, string, string] {
  if (r >= 15000) return ["#ff6ad5", "#ffd23f", "#38c6ff"];
  if (r >= 14500) return "#9fd6e8";
  if (r >= 14000) return "#e8c547";
  if (r >= 13000) return "#b9c2c9";
  if (r >= 12000) return "#c7834a";
  if (r >= 10000) return "#8c4fd6";
  if (r >= 7000) return "#e0474c";
  if (r >= 4000) return "#ff8a2b";
  if (r >= 2000) return "#3fa34d";
  return "#38c6ff";
}

const player = usePlayerStore();
const rating = computed(() => (player.b50 ? summarizeB50(player.b50.b35, player.b50.b15).total : null));

const opts = reactive({
  accent: ACCENTS[0]!,
  ring: true,
  name: player.b50?.nickname ?? "",
  showRating: true,
});

const canvas = ref<HTMLCanvasElement | null>(null);
const photo = ref<HTMLImageElement | null>(null);
const view = reactive({ zoom: 1, x: 0, y: 0 });
const imageUrl = ref<string | null>(null);

/** Scale at zoom 1: the photo just covers the circle. */
const baseScale = computed(() => (photo.value ? (PHOTO_R * 2) / Math.min(photo.value.width, photo.value.height) : 1));

/** Keep the circle fully covered: limit panning to the overhang on each axis. */
function clampPan() {
  const img = photo.value;
  if (!img) return;
  const s = baseScale.value * view.zoom;
  const maxX = Math.max(0, (img.width * s) / 2 - PHOTO_R);
  const maxY = Math.max(0, (img.height * s) / 2 - PHOTO_R);
  view.x = Math.min(maxX, Math.max(-maxX, view.x));
  view.y = Math.min(maxY, Math.max(-maxY, view.y));
}

function draw(target: HTMLCanvasElement) {
  target.width = target.height = SIZE;
  const ctx = target.getContext("2d")!;
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Photo, clipped to the circle.
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, PHOTO_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#e4e7e0";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const img = photo.value;
  if (img) {
    const s = baseScale.value * view.zoom;
    ctx.drawImage(img, CX + view.x - (img.width * s) / 2, CY + view.y - (img.height * s) / 2, img.width * s, img.height * s);
  }
  ctx.restore();

  if (opts.ring) {
    ctx.lineWidth = 22;
    ctx.strokeStyle = opts.accent;
    ctx.beginPath();
    ctx.arc(CX, CY, PHOTO_R + 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(CX, CY, PHOTO_R + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    // Eight markers around the ring, like the cabinet's buttons.
    ctx.fillStyle = "#ffffff";
    for (let b = 0; b < 8; b++) {
      const a = -Math.PI / 2 + Math.PI / 8 + (b * Math.PI) / 4;
      const r = PHOTO_R + 11;
      ctx.beginPath();
      ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const badge = (text: string, y: number, fill: string | [string, string, string], size: number) => {
    ctx.font = `800 ${size}px ${FONT}`;
    const w = Math.min(SIZE - 40, ctx.measureText(text).width + size * 1.4);
    const h = size * 1.6;
    const x = CX - w / 2;
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, h / 2);
    if (Array.isArray(fill)) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      fill.forEach((c, i) => g.addColorStop(i / (fill.length - 1), c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 4;
    ctx.fillText(text, CX, y + 1, w - size);
    ctx.shadowBlur = 0;
  };

  if (opts.name.trim()) badge(opts.name.trim(), SIZE - 52, opts.accent, 30);
  if (opts.showRating && rating.value != null) badge(String(rating.value), 46, ratingColor(rating.value), 26);
}

function redraw() {
  if (canvas.value) draw(canvas.value);
}

watch([opts, view, photo], redraw, { deep: true });

// ---- Photo input (stays in the browser) ----
function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    photo.value = img;
    Object.assign(view, { zoom: 1, x: 0, y: 0 });
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ---- Pan & pinch with pointer events ----
const pointers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; zoom: number } | null = null;

function toCanvas(dx: number) {
  return (dx * SIZE) / (canvas.value?.clientWidth || SIZE);
}

function onDown(e: PointerEvent) {
  (e.target as Element).setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
  }
}

function onMove(e: PointerEvent) {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    view.zoom = Math.min(4, Math.max(1, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist));
  } else if (pointers.size === 1) {
    view.x += toCanvas(e.clientX - prev.x);
    view.y += toCanvas(e.clientY - prev.y);
  }
  clampPan();
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  view.zoom = Math.min(4, Math.max(1, view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
  clampPan();
}

watch(() => view.zoom, clampPan);

async function exportImage() {
  const out = document.createElement("canvas");
  draw(out);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) return;
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = URL.createObjectURL(blob);
}

onMounted(() => {
  void player.restore();
  redraw();
});
onBeforeUnmount(() => imageUrl.value && URL.revokeObjectURL(imageUrl.value));
</script>

<template>
  <main class="page">
    <div class="layout">
      <section class="card stage">
        <canvas
          ref="canvas"
          class="avatar"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
          @wheel="onWheel"
        />
        <p class="hint muted">{{ photo ? "拖动调整位置，滚轮或双指缩放。" : "先选择一张照片。" }}</p>
      </section>

      <section class="card panel">
        <label class="file">
          <input type="file" accept="image/*" @change="onFile" />
          <span class="primary">选择照片</span>
          <span class="muted small">照片只在你的浏览器里处理，不会上传。</span>
        </label>
        <label>缩放 <input v-model.number="view.zoom" type="range" min="1" max="4" step="0.01" :disabled="!photo" /></label>
        <label class="check"><input v-model="opts.ring" type="checkbox" /> 显示外圈</label>
        <div class="swatches" role="radiogroup" aria-label="主题色">
          <button
            v-for="c in ACCENTS"
            :key="c"
            type="button"
            class="swatch"
            :class="{ on: opts.accent === c }"
            :style="{ background: c }"
            :aria-label="c"
            @click="opts.accent = c"
          />
        </div>
        <label>名字 <input v-model="opts.name" class="field" maxlength="16" placeholder="留空则不显示" /></label>
        <label class="check">
          <input v-model="opts.showRating" type="checkbox" :disabled="rating == null" />
          显示 DX Rating{{ rating != null ? `（${rating}）` : "（先在 B50 页查询）" }}
        </label>
        <button type="button" class="primary" :disabled="!photo" @click="exportImage">生成 512×512 图片</button>
        <template v-if="imageUrl">
          <a :href="imageUrl" download="avatar.png" class="secondary">下载头像</a>
          <img :src="imageUrl" alt="头像预览" class="result" />
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 12px;
}

@media (min-width: 760px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

.stage {
  padding: 16px;
}

.avatar {
  display: block;
  width: min(100%, 420px);
  margin: 0 auto;
  aspect-ratio: 1;
  touch-action: none;
  cursor: grab;
  background:
    repeating-conic-gradient(var(--surface-2) 0% 25%, transparent 0% 50%) 50% / 24px 24px;
  border-radius: var(--radius-sm);
}

.hint {
  text-align: center;
  font-size: 12px;
  margin: 8px 0 0;
}

.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
  font-size: 13px;
}

.panel label {
  display: grid;
  gap: 4px;
}

.panel label.check {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file input {
  display: none;
}

.file {
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px !important;
  cursor: pointer;
}

.small {
  font-size: 12px;
}

.swatches {
  display: flex;
  gap: 6px;
}

.swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border);
  cursor: pointer;
}

.swatch.on {
  box-shadow: 0 0 0 2px var(--text);
}

.primary,
.secondary {
  justify-self: start;
  padding: 7px 14px;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}

.primary {
  border: none;
  background: var(--accent);
  color: var(--accent-contrast);
}

.primary:disabled {
  opacity: 0.5;
}

.secondary {
  border: 1px solid var(--accent);
  color: var(--accent);
}

.result {
  width: 160px;
  border-radius: 50%;
}
</style>
