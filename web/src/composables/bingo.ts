import { jacketUrl, type DifficultyIndex, type Song } from "@mt/shared";

export interface BingoCell {
  text: string;
  /** Optional song shown as jacket + title; text then becomes the caption under it. */
  songId?: number;
  difficulty?: DifficultyIndex;
}

export interface BingoBoard {
  title: string;
  subtitle: string;
  maker: string;
  filler: string;
  rows: number;
  cols: number;
  accent: string;
  cells: BingoCell[];
}

export const ACCENTS = ["#0d8a78", "#e0474c", "#8c4fd6", "#d99a00", "#2f6fd6", "#1a1f1c"];
const DIFF_COLORS = ["#3fa34d", "#d99a00", "#e0474c", "#8c4fd6", "#b48be6"];
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

export const WIDTH = 1080;
const PAD = 44;
const HEADER = 170;
const FOOTER = 46;

export function emptyBoard(rows = 5, cols = 5): BingoBoard {
  return {
    title: "舞萌 Bingo",
    subtitle: "连成一条线你就是……",
    maker: "",
    filler: "",
    rows,
    cols,
    accent: ACCENTS[0]!,
    cells: Array.from({ length: rows * cols }, () => ({ text: "" })),
  };
}

/** Grid geometry shared by drawing and click hit-testing. */
export function layout(board: BingoBoard) {
  const cellW = (WIDTH - PAD * 2) / board.cols;
  const cellH = cellW * (board.cells.some((c) => c.songId) ? 1.05 : 0.72);
  const top = PAD + HEADER;
  return { cellW, cellH, top, height: top + cellH * board.rows + FOOTER + PAD };
}

export function cellAt(board: BingoBoard, x: number, y: number): number | null {
  const { cellW, cellH, top } = layout(board);
  const col = Math.floor((x - PAD) / cellW);
  const row = Math.floor((y - top) / cellH);
  return col >= 0 && col < board.cols && row >= 0 && row < board.rows ? row * board.cols + col : null;
}

/** Greedy line breaking by measured width; explicit newlines are kept. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

/** Largest font size (down to `min`) at which the text fits the box. */
function fitText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, max: number, min = 14, weight = 600) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrap(ctx, text, w);
    if (lines.length * size * 1.2 <= h) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  return { size: min, lines: wrap(ctx, text, w) };
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

export async function drawBoard(canvas: HTMLCanvasElement, board: BingoBoard, songs: Map<number, Song>, scale = 1) {
  const { cellW, cellH, top, height } = layout(board);
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const jackets = await Promise.all(
    board.cells.map((c) => {
      const song = c.songId != null ? songs.get(c.songId) : undefined;
      return song ? loadImage(jacketUrl(song)) : Promise.resolve(null);
    }),
  );

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = board.accent;
  ctx.fillRect(0, 0, WIDTH, 10);

  // Header: title + subtitle on the left, maker / filler on the right.
  ctx.textBaseline = "top";
  ctx.fillStyle = "#1a1f1c";
  const title = fitText(ctx, board.title || " ", WIDTH * 0.62, 70, 60, 28, 800);
  ctx.font = `800 ${title.size}px ${FONT}`;
  ctx.fillText(title.lines[0] ?? "", PAD, PAD + 4);
  ctx.fillStyle = "#5b645f";
  const sub = fitText(ctx, board.subtitle, WIDTH * 0.62, 64, 28, 16, 500);
  sub.lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, PAD, PAD + 82 + i * sub.size * 1.2));
  ctx.textAlign = "right";
  ctx.font = `600 24px ${FONT}`;
  if (board.maker) ctx.fillText(`制表：${board.maker}`, WIDTH - PAD, PAD + 20);
  if (board.filler) ctx.fillText(`填表：${board.filler}`, WIDTH - PAD, PAD + 58);
  ctx.textAlign = "left";

  board.cells.forEach((cell, i) => {
    const col = i % board.cols;
    const row = Math.floor(i / board.cols);
    const x = PAD + col * cellW;
    const y = top + row * cellH;
    const song = cell.songId != null ? songs.get(cell.songId) : undefined;
    const inner = 12;

    if (song) {
      const color = DIFF_COLORS[cell.difficulty ?? 3] ?? board.accent;
      const size = Math.min(cellW - inner * 2, cellH * 0.6);
      const jx = x + (cellW - size) / 2;
      const jy = y + inner;
      ctx.fillStyle = "#eceee8";
      ctx.fillRect(jx, jy, size, size);
      const img = jackets[i];
      if (img) ctx.drawImage(img, jx, jy, size, size);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.strokeRect(jx, jy, size, size);
      const chart = song.charts[cell.difficulty ?? 3];
      const caption = [cell.text, song.title, chart ? `${chart.level}（${chart.ds.toFixed(1)}）` : ""].filter(Boolean).join("\n");
      const { size: fs, lines } = fitText(ctx, caption, cellW - inner * 2, cellH - size - inner * 3, 26, 12);
      ctx.fillStyle = "#1a1f1c";
      ctx.textAlign = "center";
      lines.forEach((l, k) => ctx.fillText(l, x + cellW / 2, jy + size + inner + k * fs * 1.2));
      ctx.textAlign = "left";
    } else if (cell.text) {
      const { size: fs, lines } = fitText(ctx, cell.text, cellW - inner * 2, cellH - inner * 2, 40);
      const blockH = lines.length * fs * 1.2;
      ctx.fillStyle = "#1a1f1c";
      ctx.textAlign = "center";
      lines.forEach((l, k) => ctx.fillText(l, x + cellW / 2, y + (cellH - blockH) / 2 + k * fs * 1.2));
      ctx.textAlign = "left";
    }
  });

  // Grid lines on top so jackets never cover them.
  ctx.strokeStyle = board.accent;
  ctx.lineWidth = 4;
  for (let r = 0; r <= board.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(PAD, top + r * cellH);
    ctx.lineTo(WIDTH - PAD, top + r * cellH);
    ctx.stroke();
  }
  for (let c = 0; c <= board.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(PAD + c * cellW, top);
    ctx.lineTo(PAD + c * cellW, top + board.rows * cellH);
    ctx.stroke();
  }

  ctx.fillStyle = "#9aa49e";
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText("舞萌工具箱 · 曲绘版权归 SEGA", PAD, height - PAD - 6);
}

// ---- Share codes (text only; songs travel as ids, images are reloaded) ----

const PREFIX = "MTBINGO1:";

export function encodeBoard(board: BingoBoard): string {
  const json = JSON.stringify({
    ...board,
    cells: board.cells.map((c) => (c.songId != null ? [c.text, c.songId, c.difficulty ?? 3] : [c.text])),
  });
  const bytes = new TextEncoder().encode(json);
  return PREFIX + btoa(String.fromCharCode(...bytes));
}

export function decodeBoard(code: string): BingoBoard {
  const raw = code.trim();
  if (!raw.startsWith(PREFIX)) throw new Error("不是有效的 Bingo 分享码");
  const bytes = Uint8Array.from(atob(raw.slice(PREFIX.length)), (ch) => ch.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Omit<BingoBoard, "cells"> & { cells: unknown[] };
  const rows = clampInt(data.rows, 2, 7);
  const cols = clampInt(data.cols, 2, 7);
  if (!Array.isArray(data.cells) || data.cells.length !== rows * cols) throw new Error("分享码里的格子数量不对");
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    title: str(data.title, 30),
    subtitle: str(data.subtitle, 60),
    maker: str(data.maker, 20),
    filler: str(data.filler, 20),
    rows,
    cols,
    accent: ACCENTS.includes(data.accent) ? data.accent : ACCENTS[0]!,
    cells: data.cells.map((c) => {
      const [text, songId, difficulty] = Array.isArray(c) ? c : [""];
      return Number.isInteger(songId)
        ? { text: str(text, 50), songId: songId as number, difficulty: clampInt(difficulty, 0, 4) as DifficultyIndex }
        : { text: str(text, 50) };
    }),
  };
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** Resize keeping existing cells where they still fit. */
export function resizeBoard(board: BingoBoard, rows: number, cols: number): BingoBoard {
  const cells = Array.from({ length: rows * cols }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return r < board.rows && c < board.cols ? board.cells[r * board.cols + c]! : { text: "" };
  });
  return { ...board, rows, cols, cells };
}
