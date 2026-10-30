/** Accounts (open or invite-only sign-up) with PBKDF2 password hashes and opaque, server-side sessions (Web Crypto only). */
import type { Db } from "./db";

/**
 * PBKDF2-SHA256 iterations. Kept low enough to fit the Workers free plan's 10 ms CPU budget (~5 ms).
 * The count is stored in each hash, so it can be raised later; old hashes keep verifying.
 */
export const PBKDF2_ITERATIONS = 20_000;
export const SESSION_TTL_MS = 30 * 24 * 3600_000;

export interface User {
  id: number;
  username: string;
}

export class AuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}

// ---- Encoding helpers ----

const enc = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Constant-time comparison (no early exit on the first differing byte). */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Passwords ----

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return ["pbkdf2-sha256", PBKDF2_ITERATIONS, toBase64Url(salt), toBase64Url(hash)].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterations, salt, hash] = stored.split("$");
  if (algo !== "pbkdf2-sha256" || !salt || !hash || !Number(iterations)) return false;
  return equalBytes(await pbkdf2(password, fromBase64Url(salt), Number(iterations)), fromBase64Url(hash));
}

// ---- Validation ----

const USERNAME = /^[\p{L}\p{N}_-]{2,20}$/u;

export function validateCredentials(username: unknown, password: unknown): { username: string; password: string } {
  if (typeof username !== "string" || !USERNAME.test(username.trim())) {
    throw new AuthError(400, "用户名需为 2–20 位的文字、数字、下划线或连字符");
  }
  return { username: username.trim(), password: validatePassword(password) };
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new AuthError(400, "密码长度需为 8–128 位");
  }
  return password;
}

// ---- Invites ----

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I; 32 symbols, so no modulo bias

export function generateInviteCode(): string {
  return [...randomBytes(10)].map((b) => INVITE_ALPHABET[b % 32]).join("");
}

export function normalizeInvite(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase().replace(/[\s-]/g, "") : "";
}

// ---- Rate limiting (stored in the database so it holds across Worker instances) ----

export const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

export async function checkRateLimit(db: Db, key: string): Promise<void> {
  const row = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM attempts WHERE key = ? AND at > ?", key, Date.now() - ATTEMPT_WINDOW_MS);
  if ((row?.n ?? 0) >= MAX_ATTEMPTS) throw new AuthError(429, "尝试次数过多，请 15 分钟后再试");
}

export async function recordAttempt(db: Db, key: string): Promise<void> {
  await db.run("INSERT INTO attempts (key, at) VALUES (?, ?)", key, Date.now());
}

// ---- Accounts ----

/** Create an account. With `inviteRequired`, a one-time invite code is claimed; otherwise sign-up is open. */
export async function register(
  db: Db,
  usernameRaw: unknown,
  passwordRaw: unknown,
  inviteRaw: unknown,
  { inviteRequired }: { inviteRequired: boolean },
): Promise<User> {
  const { username, password } = validateCredentials(usernameRaw, passwordRaw);
  const code = inviteRequired ? normalizeInvite(inviteRaw) : null;
  if (await db.first("SELECT 1 AS x FROM users WHERE username = ?", username)) throw new AuthError(409, "这个用户名已被注册");

  const hash = await hashPassword(password);
  if (code !== null) {
    // Claiming is a single conditional UPDATE, so two simultaneous sign-ups cannot share one code.
    const claimed = await db.run("UPDATE invites SET used_at = ? WHERE code = ? AND used_at IS NULL", Date.now(), code);
    if (claimed.changes !== 1) throw new AuthError(400, "邀请码无效或已被使用");
  }
  try {
    await db.run("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)", username, hash, Date.now());
  } catch (err) {
    if (code !== null) await db.run("UPDATE invites SET used_at = NULL WHERE code = ?", code); // give the code back
    if (err instanceof Error && /UNIQUE/i.test(err.message)) throw new AuthError(409, "这个用户名已被注册");
    throw err;
  }
  const user = (await db.first<User>("SELECT id, username FROM users WHERE username = ?", username))!;
  if (code !== null) await db.run("UPDATE invites SET used_by = ? WHERE code = ?", user.id, code);
  return user;
}

// A fixed hash to verify against when the username does not exist, so timing does not reveal which usernames exist.
let dummyHash: Promise<string> | null = null;

export async function login(db: Db, usernameRaw: unknown, passwordRaw: unknown): Promise<User> {
  const username = typeof usernameRaw === "string" ? usernameRaw.trim() : "";
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const row = await db.first<User & { password_hash: string }>(
    "SELECT id, username, password_hash FROM users WHERE username = ?",
    username,
  );
  dummyHash ??= hashPassword(toBase64Url(randomBytes(16)));
  const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
  if (!row || !ok) throw new AuthError(401, "用户名或密码错误");
  return { id: row.id, username: row.username };
}

async function checkCurrentPassword(db: Db, userId: number, password: unknown): Promise<void> {
  const row = await db.first<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", userId);
  if (!row || typeof password !== "string" || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError(401, "当前密码不正确");
  }
}

/** Change the password and sign out every other device; the session in `keepToken` stays valid. */
export async function changePassword(db: Db, userId: number, current: unknown, next: unknown, keepToken: string | undefined): Promise<void> {
  const password = validatePassword(next);
  await checkCurrentPassword(db, userId, current);
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(password), userId);
  await db.run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", userId, keepToken ? await sha256Hex(keepToken) : "");
}

/**
 * Delete the account and everything tied to it. Child rows are removed explicitly as well as through
 * ON DELETE CASCADE, so nothing is left behind even if foreign-key enforcement is off.
 */
export async function deleteAccount(db: Db, userId: number, password: unknown): Promise<void> {
  await checkCurrentPassword(db, userId, password);
  await db.run("DELETE FROM fav_songs WHERE folder_id IN (SELECT id FROM fav_folders WHERE user_id = ?)", userId);
  for (const sql of [
    "DELETE FROM fav_folders WHERE user_id = ?",
    "DELETE FROM b50_archives WHERE user_id = ?",
    "DELETE FROM score_snapshots WHERE user_id = ?",
    "DELETE FROM chart_tag_votes WHERE user_id = ?",
    "DELETE FROM feedback WHERE user_id = ?",
    "DELETE FROM friendships WHERE user_id = ?1 OR friend_id = ?1",
    "DELETE FROM friend_requests WHERE from_id = ?1 OR to_id = ?1",
    "UPDATE invites SET used_by = NULL WHERE used_by = ?",
    "DELETE FROM sessions WHERE user_id = ?",
    "DELETE FROM users WHERE id = ?",
  ]) {
    await db.run(sql, userId);
  }
}

// ---- Sessions ----

export async function createSession(db: Db, userId: number): Promise<string> {
  const token = toBase64Url(randomBytes(32));
  await db.run(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    await sha256Hex(token),
    userId,
    Date.now() + SESSION_TTL_MS,
  );
  return token;
}

export async function userForSession(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const row = await db.first<User & { expires_at: number }>(
    "SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
    await sha256Hex(token),
  );
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username };
}

export async function deleteSession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.run("DELETE FROM sessions WHERE token_hash = ?", await sha256Hex(token));
}

/** Daily clean-up of expired sessions and stale rate-limit rows. */
export async function purgeExpired(db: Db): Promise<void> {
  await db.run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  await db.run("DELETE FROM attempts WHERE at < ?", Date.now() - ATTEMPT_WINDOW_MS);
}
