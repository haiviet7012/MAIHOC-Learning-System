import crypto from "node:crypto";
import { promisify } from "node:util";
import argon2 from "argon2";
import Database from "better-sqlite3";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import path from "node:path";
import fs from "node:fs";

const randomBytes = promisify(crypto.randomBytes);
const root = path.resolve(process.cwd(), "..");
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "maihoc.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const SQLiteStore = connectSqlite3(session);
export const sessionMiddleware = session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir, concurrentDB: true }),
  name: "maihoc.sid",
  secret: process.env.SESSION_SECRET || "",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
});

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.created_at };
}

export async function registerUser({ name, email, password }) {
  const safeName = String(name || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();
  const secret = String(password || "");
  if (safeName.length < 2 || safeName.length > 80) throw new Error("Tên cần có từ 2 đến 80 ký tự.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail) || safeEmail.length > 254) throw new Error("Email không hợp lệ.");
  if (secret.length < 10 || secret.length > 128) throw new Error("Mật khẩu cần từ 10 đến 128 ký tự.");
  const passwordHash = await argon2.hash(secret, { type: argon2.argon2id });
  try {
    const result = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'user')")
      .run(safeName, safeEmail, passwordHash);
    return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid));
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT")) throw new Error("Email này đã được đăng ký.");
    throw error;
  }
}

export async function authenticateUser(email, password) {
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(String(email || "").trim());
  if (!user) {
    // Run a dummy hash verification to reduce timing differences for unknown emails.
    await argon2.verify("$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$uYh3Qp5qF7p9XWZ0jv0L4H8t0xA7pVfN5t+7N1y3v+0", String(password || "")).catch(() => false);
    return null;
  }
  if (!await argon2.verify(user.password_hash, String(password || ""))) return null;
  return publicUser(user);
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
  if (req.session.user.role !== "admin") return res.status(403).json({ error: "Chức năng này chỉ dành cho quản trị viên." });
  next();
}

export async function createInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "MAI HỌC Admin").trim();
  if (!email || !password) return;
  if (password.length < 12) throw new Error("ADMIN_PASSWORD cần có ít nhất 12 ký tự.");
  const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (existing) return;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')").run(name, email, passwordHash);
  console.log("Đã tạo tài khoản Admin ban đầu từ cấu hình môi trường.");
}
