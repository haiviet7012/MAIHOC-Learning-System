import crypto from "node:crypto";
import { Server as SocketIOServer } from "socket.io";
import { db, publicUser } from "./auth.js";

const SESSION_COOKIE = "maihoc.sid";

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
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

// ----------------------------------------------------
// Database Migration & Schema Setup
// ----------------------------------------------------
export function initChatDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('global', 'direct')),
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);
  `);

  // Ensure default Global Chat room exists
  db.prepare(`
    INSERT OR IGNORE INTO chat_conversations (id, type, title, created_at, updated_at)
    VALUES ('global', 'global', 'Phòng học tập chung', datetime('now'), datetime('now'))
  `).run();
}

// ----------------------------------------------------
// Chat Service Helpers
// ----------------------------------------------------

/**
 * Returns deterministic conversation ID for 1-1 chat between two users.
 */
export function getDirectConversationId(userId1, userId2) {
  const id1 = Number(userId1);
  const id2 = Number(userId2);
  const min = Math.min(id1, id2);
  const max = Math.max(id1, id2);
  return `direct_${min}_${max}`;
}

/**
 * Ensures a direct conversation between userA and userB exists in DB.
 */
export function getOrCreateDirectConversation(userAId, userBId) {
  if (Number(userAId) === Number(userBId)) {
    throw new Error("Không thể nhắn tin riêng với chính mình.");
  }

  const targetUser = db.prepare("SELECT id, name FROM users WHERE id = ?").get(userBId);
  if (!targetUser) {
    throw new Error("Người dùng không tồn tại.");
  }

  const convId = getDirectConversationId(userAId, userBId);
  
  const createTx = db.transaction(() => {
    const existing = db.prepare("SELECT id FROM chat_conversations WHERE id = ?").get(convId);
    if (!existing) {
      db.prepare(`
        INSERT INTO chat_conversations (id, type, title, created_at, updated_at)
        VALUES (?, 'direct', '', datetime('now'), datetime('now'))
      `).run(convId);

      const addPart = db.prepare(`
        INSERT OR IGNORE INTO chat_participants (conversation_id, user_id, joined_at, last_read_message_id)
        VALUES (?, ?, datetime('now'), 0)
      `);
      addPart.run(convId, userAId);
      addPart.run(convId, userBId);
    } else {
      // Ensure both are participants
      const addPart = db.prepare(`
        INSERT OR IGNORE INTO chat_participants (conversation_id, user_id, joined_at, last_read_message_id)
        VALUES (?, ?, datetime('now'), 0)
      `);
      addPart.run(convId, userAId);
      addPart.run(convId, userBId);
    }
  });
  createTx();

  return { id: convId, type: "direct", partner: { id: targetUser.id, name: targetUser.name } };
}

/**
 * Checks if a user is permitted to view/participate in conversation.
 */
export function isParticipant(conversationId, userId) {
  if (conversationId === "global") {
    // Ensure user is in chat_participants for global room (for tracking last_read_message_id)
    db.prepare(`
      INSERT OR IGNORE INTO chat_participants (conversation_id, user_id, joined_at, last_read_message_id)
      VALUES ('global', ?, datetime('now'), 0)
    `).run(userId);
    return true;
  }
  const row = db.prepare(`
    SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?
  `).get(conversationId, userId);
  return Boolean(row);
}

// ----------------------------------------------------
// Setup Socket.IO & Chat REST API
// ----------------------------------------------------
export function setupChat(server, app) {
  initChatDatabase();

  const io = new SocketIOServer(server, {
    path: "/socket.io",
    cors: {
      origin: true,
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 25000
  });

  // Track online users: userId (number) => Set of socketId (string)
  const onlineUsers = new Map();

  function isUserOnline(userId) {
    const sockets = onlineUsers.get(Number(userId));
    return Boolean(sockets && sockets.size > 0);
  }

  // Socket Authentication Middleware using maihoc.sid cookie
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.request.headers.cookie || "";
      const cookies = parseCookies(cookieHeader);
      const token = cookies[SESSION_COOKIE];

      if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
        return next(new Error("Vui lòng đăng nhập để kết nối chat."));
      }

      const session = db.prepare(`
        SELECT u.id, u.name, u.email, u.role, u.admin_level, s.expires_at
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
      `).get(hashToken(token));

      if (!session || session.expires_at <= Date.now()) {
        return next(new Error("Phiên đăng nhập đã hết hạn."));
      }

      socket.user = {
        id: session.id,
        name: session.name,
        email: session.email,
        role: session.role
      };
      next();
    } catch (err) {
      next(new Error("Lỗi xác thực kết nối."));
    }
  });

  // Rate limit tracking for chat messages: userId => Array of timestamps
  const messageTimestamps = new Map();
  function checkRateLimit(userId) {
    const now = Date.now();
    let timestamps = messageTimestamps.get(userId) || [];
    // Keep timestamps from the last 5 seconds
    timestamps = timestamps.filter(t => now - t < 5000);
    if (timestamps.length >= 6) {
      return false; // Exceeded limit (max 6 messages per 5s)
    }
    timestamps.push(now);
    messageTimestamps.set(userId, timestamps);
    return true;
  }

  io.on("connection", (socket) => {
    const user = socket.user;
    const userId = Number(user.id);

    // Track presence
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    const userSockets = onlineUsers.get(userId);
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);

    // Join personal room for targeted notifications/events
    socket.join(`user_${userId}`);

    // Auto join global chat room
    socket.join("conv_global");
    isParticipant("global", userId);

    // Broadcast presence update if this user just came online
    if (wasOffline) {
      io.emit("chat:presence", { userId, isOnline: true });
    }

    // Client requests online status of specific user or initial presence check
    socket.on("chat:check-presence", (targetUserId, callback) => {
      const online = isUserOnline(targetUserId);
      if (typeof callback === "function") callback({ userId: targetUserId, isOnline: online });
    });

    // Join conversation room
    socket.on("chat:join", (conversationId, callback) => {
      try {
        const convId = String(conversationId || "").trim();
        if (!convId) return;

        if (!isParticipant(convId, userId)) {
          if (typeof callback === "function") callback({ error: "Bạn không có quyền tham gia cuộc trò chuyện này." });
          return;
        }

        socket.join(`conv_${convId}`);
        if (typeof callback === "function") callback({ ok: true, conversationId: convId });
      } catch (err) {
        if (typeof callback === "function") callback({ error: "Không thể tham gia phòng chat." });
      }
    });

    // Leave conversation room
    socket.on("chat:leave", (conversationId) => {
      const convId = String(conversationId || "").trim();
      if (convId && convId !== "global") {
        socket.leave(`conv_${convId}`);
      }
    });

    // Send message event
    socket.on("chat:send", (data, callback) => {
      try {
        if (!data || typeof data !== "object") {
          if (typeof callback === "function") callback({ error: "Dữ liệu không hợp lệ." });
          return;
        }

        const conversationId = String(data.conversationId || "").trim();
        const content = String(data.content || "").trim();
        const clientTempId = data.clientTempId ? String(data.clientTempId) : null;

        if (!conversationId) {
          if (typeof callback === "function") callback({ error: "Thiếu mã cuộc trò chuyện." });
          return;
        }

        if (!content) {
          if (typeof callback === "function") callback({ error: "Nội dung tin nhắn không được để trống." });
          return;
        }

        if (content.length > 2000) {
          if (typeof callback === "function") callback({ error: "Tin nhắn không được vượt quá 2.000 ký tự." });
          return;
        }

        if (!checkRateLimit(userId)) {
          if (typeof callback === "function") callback({ error: "Bạn đang gửi tin nhắn quá nhanh. Vui lòng thử lại sau vài giây." });
          return;
        }

        // Verify permission
        if (!isParticipant(conversationId, userId)) {
          if (typeof callback === "function") callback({ error: "Bạn không có quyền gửi tin nhắn trong cuộc trò chuyện này." });
          return;
        }

        // Persist message in SQLite database
        let insertedMessage = null;
        let convInfo = null;

        const sendTx = db.transaction(() => {
          const insertStmt = db.prepare(`
            INSERT INTO chat_messages (conversation_id, sender_id, content, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `);
          const res = insertStmt.run(conversationId, userId, content);
          
          db.prepare(`
            UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?
          `).run(conversationId);

          // Update sender's last_read_message_id
          db.prepare(`
            UPDATE chat_participants
            SET last_read_message_id = ?
            WHERE conversation_id = ? AND user_id = ?
          `).run(res.lastInsertRowid, conversationId, userId);

          insertedMessage = db.prepare(`
            SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, u.name AS sender_name
            FROM chat_messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.id = ?
          `).get(res.lastInsertRowid);

          convInfo = db.prepare(`
            SELECT id, type, title FROM chat_conversations WHERE id = ?
          `).get(conversationId);
        });
        sendTx();

        const messagePayload = {
          id: insertedMessage.id,
          conversationId: insertedMessage.conversation_id,
          senderId: insertedMessage.sender_id,
          senderName: insertedMessage.sender_name,
          content: insertedMessage.content,
          createdAt: insertedMessage.created_at,
          clientTempId
        };

        // Emit message to everyone in the conversation room
        io.to(`conv_${conversationId}`).emit("chat:new-message", messagePayload);

        // For direct chats: ensure the other participant receives conversation update notification
        if (convInfo && convInfo.type === "direct") {
          const participants = db.prepare(`
            SELECT user_id FROM chat_participants WHERE conversation_id = ?
          `).all(conversationId);

          for (const p of participants) {
            io.to(`user_${p.user_id}`).emit("chat:conversation-updated", {
              conversationId,
              lastMessage: messagePayload
            });
          }
        } else if (conversationId === "global") {
          io.emit("chat:global-activity", {
            lastMessage: messagePayload
          });
        }

        if (typeof callback === "function") {
          callback({ ok: true, message: messagePayload });
        }
      } catch (err) {
        console.error("Chat send error:", err);
        if (typeof callback === "function") callback({ error: "Lỗi hệ thống khi gửi tin nhắn." });
      }
    });

    // Mark messages as read
    socket.on("chat:read", (data) => {
      try {
        const conversationId = String(data?.conversationId || "").trim();
        const messageId = Number(data?.messageId || 0);
        if (!conversationId || !messageId) return;

        if (!isParticipant(conversationId, userId)) return;

        db.prepare(`
          UPDATE chat_participants
          SET last_read_message_id = MAX(last_read_message_id, ?)
          WHERE conversation_id = ? AND user_id = ?
        `).run(messageId, conversationId, userId);

        socket.to(`conv_${conversationId}`).emit("chat:read-receipt", {
          conversationId,
          userId,
          messageId
        });
      } catch (err) {
        console.error("Chat read error:", err);
      }
    });

    // Typing indicators
    socket.on("chat:typing", (data) => {
      const conversationId = String(data?.conversationId || "").trim();
      const isTyping = Boolean(data?.isTyping);
      if (!conversationId) return;

      socket.to(`conv_${conversationId}`).emit("chat:user-typing", {
        conversationId,
        userId,
        userName: user.name,
        isTyping
      });
    });

    socket.on("disconnect", () => {
      if (onlineUsers.has(userId)) {
        const sockets = onlineUsers.get(userId);
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("chat:presence", { userId, isOnline: false });
        }
      }
    });
  });

  // ----------------------------------------------------
  // REST API Endpoints
  // ----------------------------------------------------

  // 1. Get conversations list for current user
  app.get("/api/chat/conversations", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
    const currentUserId = req.user.id;

    try {
      // Ensure user has global chat participant record
      isParticipant("global", currentUserId);

      // Fetch all conversations user participates in
      const rows = db.prepare(`
        SELECT c.id, c.type, c.title, c.updated_at, p.last_read_message_id
        FROM chat_participants p
        JOIN chat_conversations c ON c.id = p.conversation_id
        WHERE p.user_id = ?
        ORDER BY c.updated_at DESC
      `).all(currentUserId);

      const conversations = rows.map(conv => {
        // Last message
        const lastMsg = db.prepare(`
          SELECT m.id, m.content, m.sender_id, m.created_at, u.name AS sender_name
          FROM chat_messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = ?
          ORDER BY m.id DESC LIMIT 1
        `).get(conv.id);

        // Unread count
        const unreadRow = db.prepare(`
          SELECT COUNT(id) AS unread
          FROM chat_messages
          WHERE conversation_id = ? AND id > ? AND sender_id != ?
        `).get(conv.id, conv.last_read_message_id || 0, currentUserId);

        let partner = null;
        if (conv.type === "direct") {
          const partnerRow = db.prepare(`
            SELECT u.id, u.name
            FROM chat_participants cp
            JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = ? AND cp.user_id != ?
          `).get(conv.id, currentUserId);

          if (partnerRow) {
            partner = {
              id: partnerRow.id,
              name: partnerRow.name,
              isOnline: isUserOnline(partnerRow.id)
            };
          }
        }

        return {
          id: conv.id,
          type: conv.type,
          title: conv.type === "global" ? "Phòng học tập chung" : (partner ? partner.name : "Tin nhắn"),
          partner,
          updatedAt: conv.updated_at,
          unreadCount: unreadRow ? unreadRow.unread : 0,
          lastMessage: lastMsg ? {
            id: lastMsg.id,
            content: lastMsg.content,
            senderId: lastMsg.sender_id,
            senderName: lastMsg.sender_name,
            createdAt: lastMsg.created_at
          } : null
        };
      });

      res.json({ conversations });
    } catch (err) {
      console.error("GET /api/chat/conversations error:", err);
      res.status(500).json({ error: "Không thể lấy danh sách cuộc trò chuyện." });
    }
  });

  // 2. Search users for direct chat
  app.get("/api/chat/users", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
    const currentUserId = req.user.id;
    const query = String(req.query.q || req.query.search || "").trim();

    try {
      let users = [];
      if (query) {
        // Allow searching by either display name or email (many users search by email).
        users = db.prepare(`
          SELECT id, name
          FROM users
          WHERE id != ?
            AND (name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)
          ORDER BY name COLLATE NOCASE ASC LIMIT 25
        `).all(currentUserId, `%${query}%`, `%${query}%`);
      } else {
        // Return recent users or top students
        users = db.prepare(`
          SELECT id, name
          FROM users
          WHERE id != ?
          ORDER BY id DESC LIMIT 20
        `).all(currentUserId);
      }

      const results = users.map(u => ({
        id: u.id,
        name: u.name,
        isOnline: isUserOnline(u.id)
      }));

      res.json({ users: results });
    } catch (err) {
      console.error("GET /api/chat/users error:", err);
      res.status(500).json({ error: "Không thể tìm kiếm người dùng." });
    }
  });

  // 3. Create or get 1-1 conversation with a user
  app.post("/api/chat/direct", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
    const currentUserId = req.user.id;
    const targetUserId = Number(req.body.targetUserId);

    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({ error: "Mã người nhận không hợp lệ." });
    }

    try {
      const conv = getOrCreateDirectConversation(currentUserId, targetUserId);
      conv.partner.isOnline = isUserOnline(conv.partner.id);
      res.json(conv);
    } catch (err) {
      res.status(400).json({ error: err.message || "Không thể tạo cuộc trò chuyện." });
    }
  });

  // 4. Get message history for a conversation with pagination
  app.get("/api/chat/conversations/:id/messages", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
    const currentUserId = req.user.id;
    const convId = String(req.params.id || "").trim();
    const beforeId = Number(req.query.before || 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 40), 10), 100);

    if (!convId) return res.status(400).json({ error: "Mã cuộc trò chuyện không hợp lệ." });

    try {
      if (!isParticipant(convId, currentUserId)) {
        return res.status(403).json({ error: "Bạn không có quyền xem cuộc trò chuyện này." });
      }

      let messages = [];
      if (beforeId > 0) {
        messages = db.prepare(`
          SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, u.name AS sender_name
          FROM chat_messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = ? AND m.id < ?
          ORDER BY m.id DESC LIMIT ?
        `).all(convId, beforeId, limit);
      } else {
        messages = db.prepare(`
          SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, u.name AS sender_name
          FROM chat_messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = ?
          ORDER BY m.id DESC LIMIT ?
        `).all(convId, limit);
      }

      // Return in chronological order (oldest to newest)
      messages.reverse();

      res.json({
        conversationId: convId,
        messages: messages.map(m => ({
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          content: m.content,
          createdAt: m.created_at
        }))
      });
    } catch (err) {
      console.error("GET messages error:", err);
      res.status(500).json({ error: "Không thể lấy lịch sử tin nhắn." });
    }
  });

  // 5. Mark conversation as read via HTTP
  app.post("/api/chat/conversations/:id/read", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
    const currentUserId = req.user.id;
    const convId = String(req.params.id || "").trim();
    const messageId = Number(req.body.messageId || 0);

    if (!convId) return res.status(400).json({ error: "Mã cuộc trò chuyện không hợp lệ." });

    try {
      if (!isParticipant(convId, currentUserId)) {
        return res.status(403).json({ error: "Không có quyền truy cập." });
      }

      if (messageId > 0) {
        db.prepare(`
          UPDATE chat_participants
          SET last_read_message_id = MAX(last_read_message_id, ?)
          WHERE conversation_id = ? AND user_id = ?
        `).run(messageId, convId, currentUserId);
      } else {
        // Mark all current messages in conversation as read
        const maxRow = db.prepare(`
          SELECT MAX(id) AS max_id FROM chat_messages WHERE conversation_id = ?
        `).get(convId);
        if (maxRow && maxRow.max_id) {
          db.prepare(`
            UPDATE chat_participants
            SET last_read_message_id = ?
            WHERE conversation_id = ? AND user_id = ?
          `).run(maxRow.max_id, convId, currentUserId);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Không thể cập nhật trạng thái đã đọc." });
    }
  });

  return io;
}

