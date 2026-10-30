/** Friends (request → accept) and the score snapshots friends can compare against. */
import { sanitizeSnapshot } from "@mt/shared";
import type { Db } from "./db";

export const MAX_PENDING_REQUESTS = 50;
export const MAX_FRIENDS = 200;

export class FriendsError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface SnapshotInfo {
  nickname: string;
  source: string;
  full: boolean;
  rating: number;
  recordCount: number;
  updatedAt: number;
}

export interface Friend {
  id: number;
  username: string;
  since: number;
  snapshot: SnapshotInfo | null;
}

export interface PendingRequest {
  id: number;
  username: string;
  createdAt: number;
}

export interface FriendsOverview {
  friends: Friend[];
  incoming: PendingRequest[];
  outgoing: PendingRequest[];
  snapshot: SnapshotInfo | null;
}

interface SnapshotRow {
  nickname: string | null;
  source: string | null;
  full: number | null;
  rating: number | null;
  record_count: number | null;
  updated_at: number | null;
}

const snapshotInfo = (r: SnapshotRow): SnapshotInfo | null =>
  r.updated_at === null
    ? null
    : { nickname: r.nickname!, source: r.source!, full: r.full === 1, rating: r.rating!, recordCount: r.record_count!, updatedAt: r.updated_at };

const SNAPSHOT_COLUMNS = "s.nickname, s.source, s.full, s.rating, s.record_count, s.updated_at";

export async function overview(db: Db, userId: number): Promise<FriendsOverview> {
  const friends = await db.all<{ id: number; username: string; created_at: number } & SnapshotRow>(
    `SELECT u.id, u.username, f.created_at, ${SNAPSHOT_COLUMNS}
     FROM friendships f JOIN users u ON u.id = f.friend_id LEFT JOIN score_snapshots s ON s.user_id = u.id
     WHERE f.user_id = ? ORDER BY u.username`,
    userId,
  );
  const incoming = await db.all<{ id: number; username: string; created_at: number }>(
    "SELECT u.id, u.username, r.created_at FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at DESC",
    userId,
  );
  const outgoing = await db.all<{ id: number; username: string; created_at: number }>(
    "SELECT u.id, u.username, r.created_at FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC",
    userId,
  );
  const own = await db.first<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM score_snapshots s WHERE s.user_id = ?`, userId);
  const pending = (r: { id: number; username: string; created_at: number }) => ({ id: r.id, username: r.username, createdAt: r.created_at });
  return {
    friends: friends.map((f) => ({ id: f.id, username: f.username, since: f.created_at, snapshot: snapshotInfo(f) })),
    incoming: incoming.map(pending),
    outgoing: outgoing.map(pending),
    snapshot: own ? snapshotInfo(own) : null,
  };
}

const areFriends = async (db: Db, a: number, b: number) =>
  !!(await db.first("SELECT 1 AS x FROM friendships WHERE user_id = ? AND friend_id = ?", a, b));

async function befriend(db: Db, a: number, b: number): Promise<void> {
  for (const id of [a, b]) {
    const n = (await db.first<{ c: number }>("SELECT COUNT(*) AS c FROM friendships WHERE user_id = ?", id))?.c ?? 0;
    if (n >= MAX_FRIENDS) throw new FriendsError(400, `好友数量已达上限（${MAX_FRIENDS}）`);
  }
  const now = Date.now();
  await db.run("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)", a, b, now, b, a, now);
  await db.run("DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", a, b, b, a);
}

/** Send a request by username. If that user already asked us, this accepts it instead. */
export async function requestFriend(db: Db, userId: number, usernameRaw: unknown): Promise<"requested" | "accepted"> {
  const username = typeof usernameRaw === "string" ? usernameRaw.trim() : "";
  if (!username) throw new FriendsError(400, "请填写对方的用户名");
  const target = await db.first<{ id: number }>("SELECT id FROM users WHERE username = ?", username);
  if (!target) throw new FriendsError(404, "找不到这个用户");
  if (target.id === userId) throw new FriendsError(400, "不能添加自己为好友");
  if (await areFriends(db, userId, target.id)) throw new FriendsError(409, "你们已经是好友了");

  if (await db.first("SELECT 1 AS x FROM friend_requests WHERE from_id = ? AND to_id = ?", target.id, userId)) {
    await befriend(db, userId, target.id);
    return "accepted";
  }
  const pending = (await db.first<{ c: number }>("SELECT COUNT(*) AS c FROM friend_requests WHERE from_id = ?", userId))?.c ?? 0;
  if (pending >= MAX_PENDING_REQUESTS) throw new FriendsError(400, `待处理的好友申请太多了（最多 ${MAX_PENDING_REQUESTS} 个）`);
  await db.run("INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)", userId, target.id, Date.now());
  return "requested";
}

export async function acceptRequest(db: Db, userId: number, fromId: number): Promise<void> {
  if (!(await db.first("SELECT 1 AS x FROM friend_requests WHERE from_id = ? AND to_id = ?", fromId, userId))) {
    throw new FriendsError(404, "好友申请不存在");
  }
  await befriend(db, userId, fromId);
}

/** Decline an incoming request or withdraw an outgoing one. */
export async function dropRequest(db: Db, userId: number, otherId: number): Promise<void> {
  await db.run("DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", userId, otherId, otherId, userId);
}

export async function removeFriend(db: Db, userId: number, friendId: number): Promise<void> {
  await db.run("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", userId, friendId, friendId, userId);
}

// ---- Snapshots ----

export async function saveSnapshot(db: Db, userId: number, input: unknown): Promise<SnapshotInfo> {
  const snap = sanitizeSnapshot(input);
  if (!snap || !snap.records.length) throw new FriendsError(400, "成绩数据格式不正确");
  const now = Date.now();
  await db.run(
    `INSERT INTO score_snapshots (user_id, source, nickname, full, rating, record_count, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET source = excluded.source, nickname = excluded.nickname, full = excluded.full,
       rating = excluded.rating, record_count = excluded.record_count, data = excluded.data, updated_at = excluded.updated_at`,
    userId,
    snap.source,
    snap.nickname,
    snap.full ? 1 : 0,
    snap.rating,
    snap.records.length,
    JSON.stringify(snap),
    now,
  );
  return { nickname: snap.nickname, source: snap.source, full: snap.full, rating: snap.rating, recordCount: snap.records.length, updatedAt: now };
}

export async function deleteSnapshot(db: Db, userId: number): Promise<void> {
  await db.run("DELETE FROM score_snapshots WHERE user_id = ?", userId);
}

/** The stored snapshot JSON, readable by its owner and the owner's friends only. */
export async function readSnapshot(db: Db, viewerId: number, ownerId: number): Promise<{ data: string; updatedAt: number }> {
  if (viewerId !== ownerId && !(await areFriends(db, viewerId, ownerId))) throw new FriendsError(403, "只能查看好友的成绩");
  const row = await db.first<{ data: string; updated_at: number }>("SELECT data, updated_at FROM score_snapshots WHERE user_id = ?", ownerId);
  if (!row) throw new FriendsError(404, viewerId === ownerId ? "你还没有上传成绩" : "对方还没有上传成绩");
  return { data: row.data, updatedAt: row.updated_at };
}
