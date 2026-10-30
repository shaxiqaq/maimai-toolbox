/** Invite-only accounts with scrypt password hashes and opaque, server-side sessions. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
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

// ---- Passwords ----

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// A fixed hash to verify against when the username does not exist, so timing does not reveal which usernames exist.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

// ---- Validation ----

const USERNAME = /^[\p{L}\p{N}_-]{2,20}$/u;

export function validateCredentials(username: unknown, password: unknown): { username: string; password: string } {
  if (typeof username !== "string" || !USERNAME.test(username.trim())) {
    throw new AuthError(400, "用户名需为 2–20 位的文字、数字、下划线或连字符");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new AuthError(400, "密码长度需为 8–128 位");
  }
  return { username: username.trim(), password };
}

// ---- Invites ----

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function createInvites(count: number): string[] {
  const insert = db.prepare("INSERT INTO invites (code, created_at) VALUES (?, ?)");
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const code = [...bytes].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
    insert.run(code, Date.now());
    return code;
  });
}

export function normalizeInvite(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase().replace(/[\s-]/g, "") : "";
}

// ---- Rate limiting (in-memory; fine for a single small server) ----

const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, number[]>();

export function checkRateLimit(key: string): void {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
  attempts.set(key, recent);
  if (recent.length >= MAX_ATTEMPTS) throw new AuthError(429, "尝试次数过多，请 15 分钟后再试");
}

export function recordFailure(key: string): void {
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()]);
}

// ---- Accounts ----

export async function register(usernameRaw: unknown, passwordRaw: unknown, inviteRaw: unknown): Promise<User> {
  const { username, password } = validateCredentials(usernameRaw, passwordRaw);
  const code = normalizeInvite(inviteRaw);
  const invite = db.prepare("SELECT used_at FROM invites WHERE code = ?").get(code) as { used_at: number | null } | undefined;
  if (!invite || invite.used_at != null) throw new AuthError(400, "邀请码无效或已被使用");
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) throw new AuthError(409, "这个用户名已被注册");

  const hash = await hashPassword(password);
  db.exec("BEGIN");
  try {
    // Re-check inside the transaction so two simultaneous sign-ups cannot share one code.
    const claimed = db.prepare("UPDATE invites SET used_at = ? WHERE code = ? AND used_at IS NULL").run(Date.now(), code);
    if (claimed.changes !== 1) throw new AuthError(400, "邀请码无效或已被使用");
    const res = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run(username, hash, Date.now());
    const id = Number(res.lastInsertRowid);
    db.prepare("UPDATE invites SET used_by = ? WHERE code = ?").run(id, code);
    db.exec("COMMIT");
    return { id, username };
  } catch (err) {
    db.exec("ROLLBACK");
    if (err instanceof Error && /UNIQUE/.test(err.message)) throw new AuthError(409, "这个用户名已被注册");
    throw err;
  }
}

export async function login(usernameRaw: unknown, passwordRaw: unknown): Promise<User> {
  const username = typeof usernameRaw === "string" ? usernameRaw.trim() : "";
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const row = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new AuthError(401, "用户名或密码错误");
  return { id: row.id, username: row.username };
}

// ---- Sessions ----

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    userId,
    Date.now() + SESSION_TTL_MS,
  );
  return token;
}

export function userForSession(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as { id: number; username: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    return null;
  }
  return { id: row.id, username: row.username };
}

export function deleteSession(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function purgeExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}
