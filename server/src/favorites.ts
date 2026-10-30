/**
 * Favorite folders. The server is the single source of truth and every change is a small, idempotent
 * operation, so two devices editing at once simply apply in order instead of overwriting each other.
 */
import { randomUUID } from "node:crypto";
import { db } from "./db";

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

function ownFolder(userId: number, folderId: string): void {
  if (!db.prepare("SELECT 1 FROM fav_folders WHERE id = ? AND user_id = ?").get(folderId, userId)) {
    throw new FavoritesError(404, "收藏夹不存在");
  }
}

function touch(folderId: string): void {
  db.prepare("UPDATE fav_folders SET updated_at = ? WHERE id = ?").run(Date.now(), folderId);
}

export function listFolders(userId: number): FavoriteFolder[] {
  const folders = db
    .prepare("SELECT id, name, updated_at FROM fav_folders WHERE user_id = ? ORDER BY created_at")
    .all(userId) as { id: string; name: string; updated_at: number }[];
  const songs = db
    .prepare(
      `SELECT s.folder_id, s.song_id FROM fav_songs s JOIN fav_folders f ON f.id = s.folder_id
       WHERE f.user_id = ? ORDER BY s.added_at DESC`,
    )
    .all(userId) as { folder_id: string; song_id: number }[];
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    updatedAt: f.updated_at,
    songIds: songs.filter((s) => s.folder_id === f.id).map((s) => s.song_id),
  }));
}

export function createFolder(userId: number, name: unknown): FavoriteFolder {
  const n = validName(name);
  const count = (db.prepare("SELECT COUNT(*) AS c FROM fav_folders WHERE user_id = ?").get(userId) as { c: number }).c;
  if (count >= MAX_FOLDERS) throw new FavoritesError(400, `最多只能有 ${MAX_FOLDERS} 个收藏夹`);
  const id = randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO fav_folders (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    userId,
    n,
    now,
    now,
  );
  return { id, name: n, songIds: [], updatedAt: now };
}

export function renameFolder(userId: number, folderId: string, name: unknown): void {
  ownFolder(userId, folderId);
  db.prepare("UPDATE fav_folders SET name = ?, updated_at = ? WHERE id = ?").run(validName(name), Date.now(), folderId);
}

export function deleteFolder(userId: number, folderId: string): void {
  ownFolder(userId, folderId);
  db.prepare("DELETE FROM fav_folders WHERE id = ?").run(folderId);
}

export function addSong(userId: number, folderId: string, songId: number): void {
  ownFolder(userId, folderId);
  if (!Number.isInteger(songId) || songId <= 0) throw new FavoritesError(400, "曲目 ID 无效");
  const count = (db.prepare("SELECT COUNT(*) AS c FROM fav_songs WHERE folder_id = ?").get(folderId) as { c: number }).c;
  if (count >= MAX_SONGS_PER_FOLDER) throw new FavoritesError(400, `每个收藏夹最多 ${MAX_SONGS_PER_FOLDER} 首`);
  db.prepare("INSERT OR IGNORE INTO fav_songs (folder_id, song_id, added_at) VALUES (?, ?, ?)").run(folderId, songId, Date.now());
  touch(folderId);
}

export function removeSong(userId: number, folderId: string, songId: number): void {
  ownFolder(userId, folderId);
  db.prepare("DELETE FROM fav_songs WHERE folder_id = ? AND song_id = ?").run(folderId, songId);
  touch(folderId);
}
