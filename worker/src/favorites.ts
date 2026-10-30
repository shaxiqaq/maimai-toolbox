/**
 * Favorite folders. The server is the single source of truth and every change is a small, idempotent
 * operation, so two devices editing at once simply apply in order instead of overwriting each other.
 */
import type { Db } from "./db";

export const MAX_FOLDERS = 50;
export const MAX_SONGS_PER_FOLDER = 500;

export interface FavoriteFolder {
  id: string;
  name: string;
  songIds: number[];
  updatedAt: number;
}

export class FavoritesError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

function validName(name: unknown): string {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n || n.length > 30) throw new FavoritesError(400, "收藏夹名称需为 1–30 个字符");
  return n;
}

async function ownFolder(db: Db, userId: number, folderId: string): Promise<void> {
  if (!(await db.first("SELECT 1 AS x FROM fav_folders WHERE id = ? AND user_id = ?", folderId, userId))) {
    throw new FavoritesError(404, "收藏夹不存在");
  }
}

const touch = (db: Db, folderId: string) => db.run("UPDATE fav_folders SET updated_at = ? WHERE id = ?", Date.now(), folderId);

export async function listFolders(db: Db, userId: number): Promise<FavoriteFolder[]> {
  const folders = await db.all<{ id: string; name: string; updated_at: number }>(
    "SELECT id, name, updated_at FROM fav_folders WHERE user_id = ? ORDER BY created_at",
    userId,
  );
  const songs = await db.all<{ folder_id: string; song_id: number }>(
    `SELECT s.folder_id, s.song_id FROM fav_songs s JOIN fav_folders f ON f.id = s.folder_id
     WHERE f.user_id = ? ORDER BY s.added_at DESC`,
    userId,
  );
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    updatedAt: f.updated_at,
    songIds: songs.filter((s) => s.folder_id === f.id).map((s) => s.song_id),
  }));
}

export async function createFolder(db: Db, userId: number, name: unknown): Promise<FavoriteFolder> {
  const n = validName(name);
  const count = (await db.first<{ c: number }>("SELECT COUNT(*) AS c FROM fav_folders WHERE user_id = ?", userId))?.c ?? 0;
  if (count >= MAX_FOLDERS) throw new FavoritesError(400, `最多只能有 ${MAX_FOLDERS} 个收藏夹`);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.run("INSERT INTO fav_folders (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", id, userId, n, now, now);
  return { id, name: n, songIds: [], updatedAt: now };
}

export async function renameFolder(db: Db, userId: number, folderId: string, name: unknown): Promise<void> {
  await ownFolder(db, userId, folderId);
  await db.run("UPDATE fav_folders SET name = ?, updated_at = ? WHERE id = ?", validName(name), Date.now(), folderId);
}

export async function deleteFolder(db: Db, userId: number, folderId: string): Promise<void> {
  await ownFolder(db, userId, folderId);
  // Delete songs explicitly too, in case foreign-key cascades are off.
  await db.run("DELETE FROM fav_songs WHERE folder_id = ?", folderId);
  await db.run("DELETE FROM fav_folders WHERE id = ?", folderId);
}

export async function addSong(db: Db, userId: number, folderId: string, songId: number): Promise<void> {
  await ownFolder(db, userId, folderId);
  if (!Number.isInteger(songId) || songId <= 0) throw new FavoritesError(400, "曲目 ID 无效");
  const count = (await db.first<{ c: number }>("SELECT COUNT(*) AS c FROM fav_songs WHERE folder_id = ?", folderId))?.c ?? 0;
  if (count >= MAX_SONGS_PER_FOLDER) throw new FavoritesError(400, `每个收藏夹最多 ${MAX_SONGS_PER_FOLDER} 首`);
  await db.run("INSERT OR IGNORE INTO fav_songs (folder_id, song_id, added_at) VALUES (?, ?, ?)", folderId, songId, Date.now());
  await touch(db, folderId);
}

export async function removeSong(db: Db, userId: number, folderId: string, songId: number): Promise<void> {
  await ownFolder(db, userId, folderId);
  await db.run("DELETE FROM fav_songs WHERE folder_id = ? AND song_id = ?", folderId, songId);
  await touch(db, folderId);
}
