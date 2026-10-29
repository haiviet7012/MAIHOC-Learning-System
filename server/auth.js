import crypto from "node:crypto";
import { promisify } from "node:util";
import { db, pool, initPostgresSchema } from "./postgres.js";

export { db, pool, initPostgresSchema };

const scrypt = promisify(crypto.scrypt);

export async function initAuthDatabase() {
  await initPostgresSchema(db);
}

const SESSION_COOKIE = "maihoc.sid";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const cookieSecure = () => process.env.NODE_ENV === "production";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(header = "") {
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function writeCookie(res, token, maxAgeSeconds) {
  const secure = cookieSecure() ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

export function publicUser(user) {
  if (!user) return null;
  const rawCreatedAt = user.created_at ?? user.createdAt ?? user.created_at_ms ?? null;
  let createdAt = rawCreatedAt;
  if (typeof rawCreatedAt === "number" || /^\\d{10,13}$/.test(String(rawCreatedAt ?? "").trim())) {
    const timestamp = Number(rawCreatedAt);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      createdAt = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
    }
  }
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    adminLevel: Number(user.admin_level ?? user.adminLevel ?? 0),
    createdAt
  };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = Buffer.from(
      await scrypt(String(password), salt, expected.length, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024
      })
    );
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function registerUser({ name, email, password }) {
  const safeName = String(name || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();
  const secret = String(password || "");
  if (safeName.length < 2 || safeName.length > 80) {
    throw new Error("Tên cần có từ 2 đến 80 ký tự.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail) || safeEmail.length > 254) {
    throw new Error("Email không hợp lệ.");
  }
  if (secret.length < 8 || secret.length > 128) {
    throw new Error("Mật khẩu cần từ 8 đến 128 ký tự.");
  }
  const passwordHash = await hashPassword(secret);
  try {
    const result = await db
      .prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'user')")
      .run(safeName, safeEmail, passwordHash);
    return publicUser(await db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid));
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT") || error.pgCode === "23505" || error.code === "23505") {
      throw new Error("Email này đã được đăng ký.");
    }
    throw error;
  }
}

export async function authenticateUser(email, password) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const user = await db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(safeEmail);
  if (!user) {
    await hashPassword("dummy-password-for-timing-only").catch(() => null);
    return null;
  }
  if (!(await verifyPassword(String(password || ""), user.password_hash))) {
    return null;
  }
  return publicUser(user);
}

export async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .run(hashToken(token), userId, now + SESSION_MS, now);
  await db
    .prepare(
      "INSERT INTO user_presence(user_id,last_seen_at,activity) VALUES(?,?,'Đang trực tuyến') ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at"
    )
    .run(userId, now);
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  writeCookie(res, token, Math.floor(SESSION_MS / 1000));
}

export async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
  }
  if (req.user?.id) {
    const remaining = await db
      .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND expires_at>?")
      .get(req.user.id, Date.now());
    if (!Number(remaining?.count)) {
      await db.prepare("DELETE FROM user_presence WHERE user_id=?").run(req.user.id);
    } else {
      await db.prepare("UPDATE user_presence SET last_seen_at=? WHERE user_id=?").run(Date.now(), req.user.id);
    }
  }
  writeCookie(res, "", 0);
}

const presenceUpdateCache = new Map();
const PRESENCE_WRITE_INTERVAL_MS = 60 * 1000;

export async function loadCurrentUser(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      const session = await db
        .prepare(`
          SELECT u.id,u.name,u.email,u.role,u.admin_level,u.created_at,s.expires_at
          FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=?
        `)
        .get(hashToken(token));
      if (session && Number(session.expires_at) > Date.now()) {
        req.user = publicUser(session);
        req.sessionTokenHash = hashToken(token);

        const nowMs = Date.now();
        const currentUserId = req.user.id;
        const lastUpdateMs = presenceUpdateCache.get(currentUserId) || 0;

        if (nowMs - lastUpdateMs >= PRESENCE_WRITE_INTERVAL_MS) {
          presenceUpdateCache.set(currentUserId, nowMs);
          try {
            await db
              .prepare(`
                INSERT INTO user_presence (user_id, last_seen_at)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
              `)
              .run(currentUserId, nowMs);
          } catch {
            // Presence updates are best-effort and must not fail authenticated requests.
          }
        }
      } else if (session) {
        await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
        writeCookie(res, "", 0);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
  if (req.user.role !== "admin" || Number(req.user.adminLevel) < 1) {
    return res.status(403).json({ error: "Tài khoản Admin này chưa được Admin cao nhất cấp quyền." });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
  if (req.user.role !== "admin" || Number(req.user.adminLevel) < 2) {
    return res.status(403).json({ error: "Chỉ Admin cấp cao nhất mới có quyền thực hiện thao tác này." });
  }
  next();
}

export async function createInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "MAI HỌC Admin").trim();
  if (!email && !password) return;
  if (!email || !password) throw new Error("Cần cấu hình cả ADMIN_EMAIL và ADMIN_PASSWORD để tạo Admin ban đầu.");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD cần có ít nhất 8 ký tự.");
  const existing = await db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (existing) {
    await db.prepare("UPDATE users SET role='admin', admin_level=2 WHERE id=?").run(existing.id);
    return;
  }
  const passwordHash = await hashPassword(password);
  await db
    .prepare("INSERT INTO users (name,email,password_hash,role,admin_level) VALUES (?,?,?,'admin',2)")
    .run(name, email, passwordHash);
  console.log("Đã tạo tài khoản Admin ban đầu từ cấu hình môi trường.");
}

export function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin) {
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("x-forwarded-host") || req.get("host");
    const dynamicOrigin = proto + "://" + host;
    const expected = process.env.PUBLIC_ORIGIN;

    if (expected && origin === expected) return next();
    if (origin === dynamicOrigin) return next();

    // Hỗ trợ reverse proxy (Render, Cloudflare) khi protocol chuyển tiếp giữa http và https
    try {
      const originHost = new URL(origin).host;
      if (originHost && originHost === host) return next();
    } catch {}

    return res.status(403).json({ error: "Yêu cầu không cùng nguồn gốc." });
  }
  next();
}
