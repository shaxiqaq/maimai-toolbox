import {
  COMBO_LABELS,
  jacketUrl,
  RANK_LABELS,
  summarizeB50,
  SYNC_LABELS,
  type PlayerB50,
  type PlayRecord,
  type Song,
} from "@mt/shared";

/** The exported image always uses a light palette so it reads the same wherever it is shared. */
const C = {
  bg: "#f5f6f2",
  card: "#ffffff",
  border: "#dcdfd7",
  text: "#1a1f1c",
  muted: "#5b645f",
  accent: "#0d8a78",
  warn: "#d9612f",
  diff: ["#3fa34d", "#d99a00", "#e0474c", "#8c4fd6", "#b48be6"],
  utage: "#d63a8f",
};

const COLS = 5;
const CELL_W = 296;
const CELL_H = 112;
const GAP = 12;
const PAD = 28;
const HEADER_H = 150;
const SECTION_H = 40;
const FOOTER_H = 44;
const JACKET = 88;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const IMAGE_TIMEOUT_MS = 15_000;

/** Same-origin jacket; resolves null on error or timeout so one slow image never blocks the export. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  r: PlayRecord,
  index: number,
  x: number,
  y: number,
  jacket: HTMLImageElement | null,
) {
  roundRect(ctx, x, y, CELL_W, CELL_H, 12);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const jx = x + 12;
  const jy = y + 12;
  ctx.save();
  roundRect(ctx, jx, jy, JACKET, JACKET, 8);
  ctx.clip();
  ctx.fillStyle = "#e4e7e0";
  ctx.fillRect(jx, jy, JACKET, JACKET);
  if (jacket) ctx.drawImage(jacket, jx, jy, JACKET, JACKET);
  ctx.restore();

  const tx = jx + JACKET + 12;
  const tw = x + CELL_W - tx - 10;

  ctx.fillStyle = C.muted;
  ctx.font = `600 11px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText(`#${index + 1}`, tx, y + 12);

  ctx.fillStyle = C.text;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(fitText(ctx, r.title, tw), tx, y + 28);

  // Level pill + constant
  const pill = `${r.level}`;
  ctx.font = `700 12px ${FONT}`;
  const pw = Math.max(30, ctx.measureText(pill).width + 12);
  roundRect(ctx, tx, y + 50, pw, 20, 6);
  ctx.fillStyle = r.type === "UTAGE" ? C.utage : (C.diff[r.difficulty] ?? C.muted);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(pill, tx + pw / 2, y + 54);
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  ctx.fillText(`${r.ds.toFixed(1)}  ${r.type}`, tx + pw + 8, y + 54);

  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(`${r.achievement.toFixed(4)}%`, tx, y + 78);
  const flags = [RANK_LABELS[r.rank], COMBO_LABELS[r.combo], SYNC_LABELS[r.sync]].filter(Boolean).join(" ");
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = r.rank === "sssp" || r.rank === "sss" ? C.warn : C.muted;
  ctx.fillText(fitText(ctx, flags, tw - 46), tx, y + 96);

  ctx.textAlign = "right";
  ctx.fillStyle = C.accent;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(String(r.rating), x + CELL_W - 12, y + 78);
  ctx.textAlign = "left";
}

/** Render a shareable B50 image. Missing jackets fall back to a grey tile instead of failing. */
export async function renderB50Image(b50: PlayerB50, songsById: Map<number, Song>): Promise<Blob> {
  const rows35 = Math.ceil(b50.b35.length / COLS);
  const rows15 = Math.ceil(b50.b15.length / COLS);
  const width = PAD * 2 + COLS * CELL_W + (COLS - 1) * GAP;
  const gridH = (rows: number) => (rows ? rows * CELL_H + (rows - 1) * GAP : 0);
  const height = PAD + HEADER_H + SECTION_H + gridH(rows35) + SECTION_H + gridH(rows15) + FOOTER_H + PAD;

  const records = [...b50.b35, ...b50.b15];
  const jackets = await Promise.all(
    records.map((r) => loadImage(jacketUrl(songsById.get(r.songId) ?? { id: r.songId, lxnsId: null }))),
  );
  await document.fonts?.ready;

  const scale = 2; // crisp on high-DPI screens
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);

  // Header
  const s = summarizeB50(b50.b35, b50.b15);
  ctx.textBaseline = "top";
  ctx.fillStyle = C.text;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(fitText(ctx, b50.nickname || b50.username, width / 2), PAD, PAD + 8);
  ctx.fillStyle = C.muted;
  ctx.font = `500 15px ${FONT}`;
  const sourceName = b50.source === "lxns" ? "落雪查分器" : "水鱼查分器";
  ctx.fillText(`数据来源：${sourceName} · ${new Date(b50.fetchedAt).toLocaleString("zh-CN")}`, PAD, PAD + 52);
  ctx.fillText(`B35 ${s.b35}（底分 ${s.b35Floor || "—"}） · B15 ${s.b15}（底分 ${s.b15Floor || "—"}）`, PAD, PAD + 76);

  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText("DX Rating", width - PAD, PAD + 10);
  ctx.fillStyle = C.accent;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(String(s.total), width - PAD, PAD + 34);
  ctx.textAlign = "left";

  let y = PAD + HEADER_H;
  const drawSection = (title: string, list: PlayRecord[], offset: number) => {
    ctx.fillStyle = C.text;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(title, PAD, y + 8);
    y += SECTION_H;
    list.forEach((r, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      drawCell(ctx, r, i, PAD + col * (CELL_W + GAP), y + row * (CELL_H + GAP), jackets[offset + i] ?? null);
    });
    y += gridH(Math.ceil(list.length / COLS));
  };
  drawSection(`旧版本 Best 35 · ${s.b35}`, b50.b35, 0);
  drawSection(`当前版本 Best 15 · ${s.b15}`, b50.b15, b50.b35.length);

  ctx.fillStyle = C.muted;
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText("舞萌工具箱 · 好友间自用，非商业 · 曲绘版权归 SEGA，图片经由落雪查分器获取", PAD, height - PAD - 14);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片生成失败"))), "image/png"),
  );
}
