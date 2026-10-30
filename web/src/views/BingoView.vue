<script setup lang="ts">
import { scoreHighlights, type ChartRef } from "@mt/shared";
import { computed, onMounted, ref, watch } from "vue";
import ChartPicker from "@/components/ChartPicker.vue";
import {
  ACCENTS,
  cellAt,
  decodeBoard,
  drawBoard,
  emptyBoard,
  encodeBoard,
  resizeBoard,
  WIDTH,
  type BingoBoard,
} from "@/composables/bingo";
import { useCatalogStore } from "@/stores/catalog";
import { usePlayerStore } from "@/stores/player";

const STORAGE_KEY = "bingoBoard";
const catalog = useCatalogStore();
const player = usePlayerStore();

function loadSaved(): BingoBoard {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? decodeBoard(raw) : emptyBoard();
  } catch {
    return emptyBoard();
  }
}

const board = ref<BingoBoard>(loadSaved());
const selected = ref<number | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const message = ref<string | null>(null);
const exporting = ref(false);
const imageUrl = ref<string | null>(null);

const songs = computed(() => new Map((catalog.catalog?.songs ?? []).map((s) => [s.id, s])));
const cell = computed(() => (selected.value != null ? board.value.cells[selected.value] : undefined));

// The picker edits a ChartRef; mirror it into the selected cell.
const picked = computed<ChartRef | null>({
  get: () => {
    const c = cell.value;
    const song = c?.songId != null ? songs.value.get(c.songId) : undefined;
    const chart = song?.charts[c?.difficulty ?? 3] ?? song?.charts[song.charts.length - 1];
    return song && chart ? { song, chart } : null;
  },
  set: (ref) => {
    if (!cell.value) return;
    if (ref) {
      cell.value.songId = ref.song.id;
      cell.value.difficulty = ref.chart.difficulty;
    } else {
      delete cell.value.songId;
      delete cell.value.difficulty;
    }
  },
});

let pending = 0;
async function redraw() {
  const ticket = ++pending;
  await catalog.load();
  if (ticket !== pending || !canvas.value) return;
  await drawBoard(canvas.value, board.value, songs.value);
}

watch(
  board,
  (b) => {
    void redraw();
    try {
      localStorage.setItem(STORAGE_KEY, encodeBoard(b));
    } catch {
      // Autosave is a convenience; ignore storage failures.
    }
    if (imageUrl.value) {
      URL.revokeObjectURL(imageUrl.value);
      imageUrl.value = null;
    }
  },
  { deep: true },
);

function onCanvasClick(e: MouseEvent) {
  const c = canvas.value!;
  const k = WIDTH / c.clientWidth;
  const rect = c.getBoundingClientRect();
  selected.value = cellAt(board.value, (e.clientX - rect.left) * k, (e.clientY - rect.top) * k);
}

function setSize(rows: number, cols: number) {
  board.value = resizeBoard(board.value, rows, cols);
  selected.value = null;
}

function fillFromScores() {
  const records = player.scores?.records ?? (player.b50 ? [...player.b50.b35, ...player.b50.b15] : []);
  const highlights = scoreHighlights(records).slice(0, 9);
  if (!highlights.length) {
    message.value = "先在 B50 页查询一次成绩（用落雪密钥可以得到完整成绩）。";
    return;
  }
  const next = resizeBoard({ ...emptyBoard(3, 3), title: board.value.title, maker: board.value.maker, accent: board.value.accent }, 3, 3);
  next.title = `${player.b50?.nickname || player.scores?.nickname || "我"}的舞萌 Bingo`;
  next.subtitle = player.scores ? "根据全部成绩自动生成" : "根据 B50 自动生成";
  highlights.forEach((h, i) => {
    next.cells[i] = { text: `${h.label}\n${h.detail}`, songId: h.record.songId, difficulty: h.record.difficulty };
  });
  board.value = next;
  selected.value = null;
  message.value = null;
}

async function exportImage() {
  exporting.value = true;
  try {
    const out = document.createElement("canvas");
    await drawBoard(out, board.value, songs.value, 2);
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    if (!blob) throw new Error("图片生成失败");
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = URL.createObjectURL(blob);
  } catch (err) {
    message.value = (err as Error).message;
  } finally {
    exporting.value = false;
  }
}

async function copyCode() {
  const code = encodeBoard(board.value);
  try {
    await navigator.clipboard.writeText(code);
    message.value = "分享码已复制。曲目以编号保存，对方导入时会重新加载曲绘。";
  } catch {
    prompt("复制下面的分享码", code);
  }
}

function importCode() {
  const code = prompt("粘贴 Bingo 分享码");
  if (!code) return;
  try {
    board.value = decodeBoard(code);
    selected.value = null;
    message.value = "已导入。";
  } catch (err) {
    message.value = (err as Error).message;
  }
}

function reset() {
  if (!confirm("清空当前 Bingo？")) return;
  board.value = emptyBoard(board.value.rows, board.value.cols);
  selected.value = null;
}

onMounted(() => void redraw());
</script>

<template>
  <main class="page">
    <div class="layout">
      <section class="preview card">
        <canvas ref="canvas" title="点格子编辑" @click="onCanvasClick" />
        <p class="hint muted">点击格子编辑内容。</p>
      </section>

      <section class="side">
        <div v-if="cell" class="card panel">
          <header class="panel-head">
            <strong>第 {{ selected! + 1 }} 格</strong>
            <button type="button" class="link" @click="selected = null">完成</button>
          </header>
          <textarea v-model="cell.text" class="field" rows="3" maxlength="50" placeholder="文字（可选）" />
          <ChartPicker :key="selected!" v-model="picked" />
        </div>

        <div class="card panel">
          <label>标题 <input v-model="board.title" class="field" maxlength="30" /></label>
          <label>说明 <input v-model="board.subtitle" class="field" maxlength="60" /></label>
          <div class="two">
            <label>制表人 <input v-model="board.maker" class="field" maxlength="20" /></label>
            <label>填表人 <input v-model="board.filler" class="field" maxlength="20" /></label>
          </div>
          <div class="two">
            <label>
              行 × 列
              <select
                class="field"
                :value="`${board.rows}x${board.cols}`"
                @change="(e) => { const [r, c] = (e.target as HTMLSelectElement).value.split('x').map(Number); setSize(r!, c!); }"
              >
                <option v-for="n in [2, 3, 4, 5, 6, 7]" :key="n" :value="`${n}x${n}`">{{ n }} × {{ n }}</option>
                <option value="3x4">3 × 4</option>
                <option value="4x5">4 × 5</option>
              </select>
            </label>
            <div class="swatches" role="radiogroup" aria-label="主题色">
              <button
                v-for="c in ACCENTS"
                :key="c"
                type="button"
                class="swatch"
                :class="{ on: board.accent === c }"
                :style="{ background: c }"
                :aria-label="c"
                @click="board.accent = c"
              />
            </div>
          </div>
        </div>

        <div class="card panel actions">
          <button type="button" class="primary" :disabled="exporting" @click="exportImage">
            {{ exporting ? "生成中…" : "生成图片" }}
          </button>
          <button type="button" class="secondary" @click="fillFromScores">用我的成绩生成 3×3</button>
          <button type="button" class="secondary" @click="copyCode">复制分享码</button>
          <button type="button" class="secondary" @click="importCode">导入分享码</button>
          <button type="button" class="link danger" @click="reset">清空</button>
          <p v-if="message" class="msg">{{ message }}</p>
        </div>

        <div v-if="imageUrl" class="card panel">
          <a :href="imageUrl" :download="`${board.title || 'bingo'}.png`" class="primary dl">下载图片</a>
          <span class="muted hint">手机上也可以长按左侧图片保存。</span>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 12px;
}

@media (min-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: start;
  }
}

.preview {
  padding: 8px;
}

.preview canvas {
  display: block;
  width: 100%;
  height: auto;
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.hint {
  font-size: 12px;
  margin: 6px 0 0;
}

.side {
  display: grid;
  gap: 12px;
}

.panel {
  padding: 12px;
  display: grid;
  gap: 8px;
  font-size: 13px;
}

.panel label {
  display: grid;
  gap: 4px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: end;
}

textarea.field {
  resize: vertical;
  font-family: inherit;
}

.swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: 6px;
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

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.primary,
.secondary {
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

.primary.dl {
  justify-self: start;
}

.secondary {
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
}

.link.danger {
  color: var(--warn);
}

.msg {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
