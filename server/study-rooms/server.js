import crypto from "node:crypto";

const rooms = new Map();
const MAX_STUDENTS = 12;
const ROOM_IDLE_TTL = 5 * 60 * 1000;
const MEMBER_STALE_MS = 45 * 1000;
const EVENT_LIMIT = 500;
const EVENT_MAX_BYTES = 12 * 1024 * 1024;
const CHAT_HISTORY_MAX_BYTES = 6 * 1024 * 1024;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_EMOTES = new Set(["👍", "❤️", "👏", "😂", "🎉", "🔥"]);

function fail(res, status, error) {
  return res.status(status).json({ error });
}
function makeRoomId() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}


import { promisify } from "node:util";
const scryptAsync = promisify(crypto.scrypt);

async function hashRoomPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(String(password), salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyRoomPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = await scryptAsync(String(password), salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}


function isUserAdmin(user) {
  return Boolean(user && user.role === "admin" && (user.adminLevel === undefined || Number(user.adminLevel) >= 1));
}
function studentMembers(room) {
  return [...room.members.values()].filter(member => !member.isAdminObserver);
}
function publicMember(member) {
  return {
    participantId: member.participantId,
    userId: member.userId,
    name: member.name,
    isAdminObserver: Boolean(member.isAdminObserver),
    handRaised: Boolean(member.handRaised),
    micOn: Boolean(member.micOn),
    cameraOn: Boolean(member.cameraOn),
    joinedAt: member.joinedAt
  };
}
function visibleMembersFor(room, viewerIsAdmin = false) {
  const list = viewerIsAdmin
    ? [...room.members.values()]
    : studentMembers(room);
  return list.map(publicMember);
}
function publicRoom(room, viewerIsAdmin = false) {
  const students = studentMembers(room);
  const payload = {
    id: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash),
    participantCount: students.length,
    maxParticipants: MAX_STUDENTS,
    createdAt: room.createdAt,
    creatorName: room.creatorName,
    creatorId: room.creatorId,
    isFull: students.length >= MAX_STUDENTS,
    adminObserving: false
  };
  if (viewerIsAdmin) {
    payload.adminObserving = [...room.members.values()].some(member => member.isAdminObserver);
  }
  return payload;
}
function addEvent(room, type, payload, member, targetParticipantId = null) {
  const event = {
    id: ++room.eventSequence,
    type,
    payload,
    fromParticipantId: member?.participantId || null,
    fromName: member?.isAdminObserver ? "Peer" : (member?.name || "Hệ thống"),
    fromIsAdminObserver: Boolean(member?.isAdminObserver),
    targetParticipantId,
    createdAt: Date.now()
  };
  const eventBytes = Buffer.byteLength(JSON.stringify(event));
  room.events.push(event);
  room.eventBytes = (room.eventBytes || 0) + eventBytes;
  while (room.events.length > EVENT_LIMIT || room.eventBytes > EVENT_MAX_BYTES) {
    const removed = room.events.shift();
    if (!removed) break;
    room.eventBytes -= Buffer.byteLength(JSON.stringify(removed));
  }
  return event;
}
function filterEventsForMember(events, viewerMember) {
  const viewerIsAdmin = Boolean(viewerMember?.isAdminObserver);
  const result = [];
  for (const event of events) {
    if (event.targetParticipantId && event.targetParticipantId !== viewerMember.participantId) continue;
    if (!viewerIsAdmin && event.fromIsAdminObserver) {
      // Regular students must never see join/leave/presence events of a stealth Admin.
      // Only direct WebRTC signaling or stealth-peer cleanup is forwarded without Admin identity.
      if (["signal-offer", "signal-answer", "signal-ice", "stealth-peer-left"].includes(event.type)) {
        result.push({
          id: event.id,
          type: event.type,
          payload: event.payload,
          fromParticipantId: event.fromParticipantId,
          fromName: "Peer",
          fromIsAdminObserver: false,
          targetParticipantId: event.targetParticipantId,
          createdAt: event.createdAt
        });
      }
      continue;
    }
    result.push({ ...event });
  }
  return result;
}
function pruneRooms(now = Date.now()) {
  for (const [id, room] of rooms) {
    for (const [participantId, member] of room.members) {
      if (now - member.lastSeenAt > MEMBER_STALE_MS) {
        room.members.delete(participantId);
        if (member.isAdminObserver) {
          addEvent(room, "stealth-peer-left", { participantId }, member);
        } else {
          addEvent(room, "participant-left", { participantId }, member);
        }
      }
    }
    if (now - room.lastActivityAt > ROOM_IDLE_TTL && !room.members.size) rooms.delete(id);
  }
}
function requireUser(req, res, next) {
  if (!req.user) return fail(res, 401, "Vui lòng đăng nhập để sử dụng Phòng tự học.");
  next();
}
function requireRoom(roomId, res) {
  const room = rooms.get(String(roomId || "").toUpperCase());
  if (!room) {
    fail(res, 404, "Phòng học không tồn tại hoặc đã kết thúc.");
    return null;
  }
  return room;
}
function memberFor(room, req, token, res) {
  const member = room.members.get(String(token || ""));
  if (!member || member.userId !== req.user?.id) {
    fail(res, 403, "Phiên tham gia phòng không hợp lệ. Hãy vào phòng lại.");
    return null;
  }
  return member;
}

export function installStudyRooms({ app, db, requireAuth, requireSameOrigin }) {
  const auth = requireAuth || requireUser;
  const sameOrigin = requireSameOrigin || ((_req, _res, next) => next());

  // Cloudflare Realtime TURN credentials are short-lived and must be generated server-side.
  const turnKeyId = String(process.env.CLOUDFLARE_TURN_KEY_ID || "").trim();
  const turnApiToken = String(process.env.CLOUDFLARE_TURN_API_TOKEN || "").trim();
  let cachedIceServers = null;
  let cachedIceServersExpiresAt = 0;

  async function createCloudflareIceServers() {
    if (!turnKeyId || !turnApiToken) return null;
    if (cachedIceServers && Date.now() < cachedIceServersExpiresAt) return cachedIceServers;

    const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${turnApiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ttl: 86400 }),
      signal: AbortSignal.timeout(10000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[Study Rooms] Cloudflare TURN credential generation failed:", response.status, payload?.errors || payload?.error || "");
      throw new Error("Không thể lấy TURN credentials từ Cloudflare.");
    }
    if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
      throw new Error("Cloudflare không trả về danh sách ICE servers hợp lệ.");
    }
    cachedIceServers = payload.iceServers;
    cachedIceServersExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return cachedIceServers;
  }

  app.get("/api/study-rooms/ice-servers", sameOrigin, auth, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const iceServers = await createCloudflareIceServers();
      if (iceServers) return res.json({ iceServers, turnEnabled: true });
      return res.json({
        turnEnabled: false,
        iceServers: [
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.l.google.com:19302" }
        ]
      });
    } catch (error) {
      console.warn("[Study Rooms] TURN unavailable; falling back to STUN:", error.message);
      return res.json({
        turnEnabled: false,
        iceServers: [
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.l.google.com:19302" }
        ]
      });
    }
  });

  app.get("/api/study-rooms", sameOrigin, auth, async (req, res) => {
    pruneRooms();
    const isAdmin = isUserAdmin(req.user);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      rooms: [...rooms.values()].map(room => publicRoom(room, isAdmin)),
      isAdmin
    });
  });

  app.post("/api/study-rooms", sameOrigin, auth, async (req, res) => {
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    const password = String(req.body?.password || "");
    if (name.length < 3 || name.length > 60) return fail(res, 400, "Tên phòng phải từ 3 đến 60 ký tự.");
    if (password.length > 72) return fail(res, 400, "Mật khẩu phòng tối đa 72 ký tự.");
    pruneRooms();
    const existingRoom = [...rooms.values()].find(room => room.creatorId === req.user.id);
    if (existingRoom) {
      return fail(res, 409, "Mỗi người chỉ được tạo tối đa 1 phòng. Hãy đóng phòng cũ trước khi tạo phòng mới.");
    }
    let id = makeRoomId();
    while (rooms.has(id)) id = makeRoomId();
    const now = Date.now();
    const room = {
      id,
      name,
      creatorId: req.user.id,
      creatorName: req.user.name,
      passwordHash: password ? await hashRoomPassword(password) : null,
      createdAt: now,
      lastActivityAt: now,
      members: new Map(),
      events: [],
      eventSequence: 0,
      eventBytes: 0,
      chatHistory: [],
      chatHistoryBytes: 0
    };
    addEvent(room, "system", { message: `${req.user.name} đã tạo phòng học.` }, null);
    rooms.set(id, room);
    res.status(201).json({ room: publicRoom(room, isUserAdmin(req.user)), roomId: id });
  });

  app.post("/api/study-rooms/:roomId/join", sameOrigin, auth, async (req, res) => {
    pruneRooms();
    const room = requireRoom(req.params.roomId, res);
    if (!room) return;
    const isAdmin = isUserAdmin(req.user);
    // Admin joining any room (or clicking Giám sát) enters in 100% stealth monitoring mode,
    // unless the Admin is the creator explicitly entering their own room as host (monitor === false).
    const requestedMonitor = req.body?.monitor;
    const monitor = isAdmin
      ? (requestedMonitor !== undefined ? Boolean(requestedMonitor) : room.creatorId !== req.user.id)
      : false;
    if (Boolean(requestedMonitor) && !isAdmin) {
      return fail(res, 403, "Chỉ Admin mới có quyền giám sát phòng.");
    }
    const isCreator = room.creatorId === req.user.id;
    if (!monitor && !isCreator && room.passwordHash && ! await verifyRoomPassword(String(req.body?.password || ""), room.passwordHash)) {
      return fail(res, 403, "Mật khẩu phòng không đúng.");
    }


    // Admin chỉ giữ 1 phiên trong mỗi phòng: đổi chế độ (ẩn <-> thường) thì gỡ phiên cũ.
    if (isAdmin) {
      for (const [pid, m] of room.members) {
        if (m.userId === req.user.id && Boolean(m.isAdminObserver) !== monitor) {
          room.members.delete(pid);
          addEvent(room, m.isAdminObserver ? "stealth-peer-left" : "participant-left", { participantId: pid }, m);
        }
      }
    }



    const existing = [...room.members.values()].find(
      member => member.userId === req.user.id && Boolean(member.isAdminObserver) === monitor
    );
    if (existing) {
      existing.lastSeenAt = Date.now();
      return res.json({
        participant: publicMember(existing),
        participantToken: existing.participantId,
        room: publicRoom(room, isAdmin),
        members: visibleMembersFor(room, monitor),
        messages: room.chatHistory.slice(-100),
        lastEventId: room.eventSequence
      });
    }
    if (!monitor && studentMembers(room).length >= MAX_STUDENTS) {
      return fail(res, 409, "Phòng đã đủ 12 người.");
    }
    const participantId = crypto.randomBytes(18).toString("hex");
    const member = {
      participantId,
      userId: req.user.id,
      name: String(req.user.name || "Người học").slice(0, 80),
      isAdminObserver: monitor,
      handRaised: false,
      micOn: false,
      cameraOn: false,
      joinedAt: Date.now(),
      lastSeenAt: Date.now()
    };
    room.members.set(participantId, member);
    room.lastActivityAt = Date.now();
    // Only broadcast participant-joined for regular participants; stealth Admin joins silently.
    if (!monitor) {
      addEvent(room, "participant-joined", { member: publicMember(member) }, member);
    }
    res.json({
      participant: publicMember(member),
      participantToken: participantId,
      room: publicRoom(room, isAdmin),
      members: visibleMembersFor(room, monitor),
      messages: room.chatHistory.slice(-100),
      lastEventId: room.eventSequence
    });
  });

  app.get("/api/study-rooms/:roomId/events", sameOrigin, auth, async (req, res) => {
    pruneRooms();
    const room = requireRoom(req.params.roomId, res);
    if (!room) return;
    const member = memberFor(room, req, req.query.token, res);
    if (!member) return;
    member.lastSeenAt = Date.now();
    room.lastActivityAt = Date.now();
    const since = Math.max(0, Number(req.query.since) || 0);
    const rawEvents = room.events.filter(event => event.id > since);
    const events = filterEventsForMember(rawEvents, member);
    const viewerIsAdmin = Boolean(member.isAdminObserver) || isUserAdmin(req.user);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      room: publicRoom(room, viewerIsAdmin),
      members: visibleMembersFor(room, Boolean(member.isAdminObserver)),
      events,
      lastEventId: room.eventSequence
    });
  });

  app.post("/api/study-rooms/:roomId/events", sameOrigin, auth, async (req, res) => {
    const room = requireRoom(req.params.roomId, res);
    if (!room) return;
    const member = memberFor(room, req, req.body?.token, res);
    if (!member) return;
    member.lastSeenAt = Date.now();
    room.lastActivityAt = Date.now();
    const type = String(req.body?.type || "");
    const payload = req.body?.payload || {};
    const target = req.body?.targetParticipantId ? String(req.body.targetParticipantId) : null;
    const allowed = new Set(["chat", "hand", "emote", "media-state", "signal-offer", "signal-answer", "signal-ice"]);
    if (!allowed.has(type)) return fail(res, 400, "Loại sự kiện phòng không hợp lệ.");
    if (type.startsWith("signal-") && (!target || target === member.participantId)) {
      return fail(res, 400, "Đích tín hiệu WebRTC không hợp lệ.");
    }
    if (member.isAdminObserver && ["chat", "hand", "emote", "media-state"].includes(type)) {
      // Stealth admin observer remains completely invisible to participants in the room.
      return res.json({ ok: true, stealthIgnored: true });
    }
    if (type === "chat") {
      const text = String(payload.text || "").trim();
      const image = String(payload.image || "");
      if (!text && !image) return fail(res, 400, "Tin nhắn không được để trống.");
      if (text.length > 2000) return fail(res, 400, "Tin nhắn tối đa 2.000 ký tự.");
      if (image) {
        if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(image)) {
          return fail(res, 400, "Tệp ảnh không được hỗ trợ.");
        }
        const approximateBytes = Math.floor(image.length * 3 / 4);
        if (approximateBytes > IMAGE_MAX_BYTES) return fail(res, 413, "Ảnh tối đa 2 MB.");
      }
      const chat = {
        id: crypto.randomBytes(10).toString("hex"),
        text,
        image: image || null,
        participantId: member.participantId,
        name: member.name,
        isAdminObserver: false,
        createdAt: Date.now()
      };
      const chatBytes = Buffer.byteLength(JSON.stringify(chat));
      room.chatHistory.push(chat);
      room.chatHistoryBytes = (room.chatHistoryBytes || 0) + chatBytes;
      while (room.chatHistory.length > 100 || room.chatHistoryBytes > CHAT_HISTORY_MAX_BYTES) {
        const removed = room.chatHistory.shift();
        if (!removed) break;
        room.chatHistoryBytes -= Buffer.byteLength(JSON.stringify(removed));
      }
      const event = addEvent(room, "chat", chat, member);
      return res.json({ ok: true, eventId: event.id });
    }
    if (type === "hand") {
      member.handRaised = Boolean(payload.raised);
      addEvent(room, "hand", { participantId: member.participantId, name: member.name, raised: member.handRaised }, member);
      return res.json({ ok: true });
    }
    if (type === "emote") {
      const emoji = String(payload.emoji || "").trim();
      if (!ALLOWED_EMOTES.has(emoji)) return fail(res, 400, "Biểu cảm không hợp lệ.");
      addEvent(room, "emote", { participantId: member.participantId, name: member.name, emoji }, member);
      return res.json({ ok: true });
    }
    if (type === "media-state") {
      member.micOn = Boolean(payload.micOn);
      member.cameraOn = Boolean(payload.cameraOn);
      addEvent(room, "media-state", { participantId: member.participantId, micOn: member.micOn, cameraOn: member.cameraOn }, member);
      return res.json({ ok: true });
    }
    addEvent(room, type, payload, member, target);
    res.json({ ok: true });
  });

  app.post("/api/study-rooms/:roomId/leave", sameOrigin, auth, async (req, res) => {
    const room = rooms.get(String(req.params.roomId || "").toUpperCase());
    if (!room) return res.json({ ok: true });
    const member = memberFor(room, req, req.body?.token, res);
    if (!member) return;
    room.members.delete(member.participantId);
    if (member.isAdminObserver) {
      addEvent(room, "stealth-peer-left", { participantId: member.participantId }, member);
    } else {
      addEvent(room, "participant-left", { participantId: member.participantId }, member);
    }
    room.lastActivityAt = Date.now();
    res.json({ ok: true });
  });

  const closeRoomHandler = async (req, res) => {
    const room = rooms.get(String(req.params.roomId || "").toUpperCase());
    if (!room) return res.json({ ok: true });
    // Only the room creator may close the room. Admin observers and other participants
    // can leave the room, but they must not be able to terminate someone else's room.
    if (Number(room.creatorId) !== Number(req.user.id)) {
      return fail(res, 403, "Chỉ chủ phòng mới có quyền đóng phòng. Thành viên khác có thể rời phòng.");
    }
    addEvent(room, "room-closed", { message: "Phòng học đã được đóng." }, null);
    rooms.delete(room.id);
    res.json({ ok: true });
  };
  app.delete("/api/study-rooms/:roomId", sameOrigin, auth, closeRoomHandler);
  app.post("/api/study-rooms/:roomId/close", sameOrigin, auth, closeRoomHandler);

  console.info("Study Rooms module loaded (max 12 students per room, stealth admin monitoring enabled).");
}
