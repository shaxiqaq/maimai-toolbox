/** Announcements (admins write, everyone reads) and feedback (anyone sends, admins reply). */
import type { Db } from "./db";

export const MAX_FEEDBACK_LENGTH = 2000;

export class FeedbackError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  createdAt: number;
}

export type FeedbackStatus = "open" | "done";

export interface Feedback {
  id: number;
  username: string | null;
  contact: string;
  body: string;
  page: string;
  status: FeedbackStatus;
  reply: string;
  createdAt: number;
  updatedAt: number;
}

function text(value: unknown, max: number, field: string, required = true): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw new FeedbackError(400, `请填写${field}`);
  if (s.length > max) throw new FeedbackError(400, `${field}最多 ${max} 个字`);
  return s;
}

// ---- Announcements ----

export async function listAnnouncements(db: Db): Promise<Announcement[]> {
  return db.all<Announcement>("SELECT id, title, body, created_at AS createdAt FROM announcements ORDER BY created_at DESC LIMIT 20");
}

export async function createAnnouncement(db: Db, input: Record<string, unknown>): Promise<Announcement> {
  const title = text(input.title, 60, "标题");
  const body = text(input.body, MAX_FEEDBACK_LENGTH, "内容");
  return (await db.first<Announcement>(
    "INSERT INTO announcements (title, body, created_at) VALUES (?, ?, ?) RETURNING id, title, body, created_at AS createdAt",
    title,
    body,
    Date.now(),
  ))!;
}

export async function deleteAnnouncement(db: Db, id: number): Promise<void> {
  await db.run("DELETE FROM announcements WHERE id = ?", id);
}

// ---- Feedback ----

const FEEDBACK_COLUMNS = `f.id, u.username, f.contact, f.body, f.page, f.status, f.reply,
  f.created_at AS createdAt, f.updated_at AS updatedAt`;

export async function sendFeedback(db: Db, userId: number | null, input: Record<string, unknown>): Promise<void> {
  const body = text(input.body, MAX_FEEDBACK_LENGTH, "反馈内容");
  const contact = text(input.contact, 100, "联系方式", false);
  const page = text(input.page, 200, "页面", false);
  const now = Date.now();
  await db.run(
    "INSERT INTO feedback (user_id, contact, body, page, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    userId,
    contact,
    body,
    page,
    now,
    now,
  );
}

export async function myFeedback(db: Db, userId: number): Promise<Feedback[]> {
  return db.all<Feedback>(
    `SELECT ${FEEDBACK_COLUMNS} FROM feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 50`,
    userId,
  );
}

export async function allFeedback(db: Db, status: string | undefined): Promise<Feedback[]> {
  const open = status !== "all";
  return db.all<Feedback>(
    `SELECT ${FEEDBACK_COLUMNS} FROM feedback f LEFT JOIN users u ON u.id = f.user_id
     ${open ? "WHERE f.status = 'open'" : ""} ORDER BY f.created_at DESC LIMIT 200`,
  );
}

export async function updateFeedback(db: Db, id: number, input: Record<string, unknown>): Promise<void> {
  const row = await db.first<{ status: FeedbackStatus; reply: string }>("SELECT status, reply FROM feedback WHERE id = ?", id);
  if (!row) throw new FeedbackError(404, "反馈不存在");
  const status = input.status === "done" || input.status === "open" ? input.status : row.status;
  const reply = input.reply === undefined ? row.reply : text(input.reply, MAX_FEEDBACK_LENGTH, "回复", false);
  await db.run("UPDATE feedback SET status = ?, reply = ?, updated_at = ? WHERE id = ?", status, reply, Date.now(), id);
}
