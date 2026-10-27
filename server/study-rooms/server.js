import crypto from "node:crypto";

const rooms = new Map();
const MAX_STUDENTS = 12;
const ROOM_IDLE_TTL = 3 * 60 * 1000;
const MEMBER_STALE_MS = 45 * 1000;
const EVENT_LIMIT = 500;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

function fail(res, status, error) {
  return res.status(status).json({ error });
}
function makeRoomId() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}
function hashRoomPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  if (!password) return null;
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyRoomPassword(password, stored) {
  if (!stored) return true;
  if (!password) return false;
  const [salt, expectedHex] = stored.split(":");
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function studentMembers(room) {
  return [...room.members.values()].filter(member => !member.isAdminObserver);
}
function publicMember(member) {
  return {
    participantId: member.participantId,
    userId: member.userId,
    name: member.name,
    isAdminObserver: member.isAdminObserver,
    handRaised: member.handRaised,
    micOn: member.micOn,
    cameraOn: member.cameraOn,
    joinedAt: member.joinedAt
  };
}
function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash),
    participantCount: studentMembers(room).length,
    maxParticipants: MAX_STUDENTS,
    createdAt: room.createdAt,
    creatorName: room.creatorName,
    isFull: studentMembers(room).length >= MAX_STUDENTS,
    adminObserving: [...room.members.values()].some(member => member.isAdminObserver)
  };
}
function addEvent(room, type, payload, member, targetParticipantId = null) {
  const event = {
    id: ++room.eventSequence,
    type,
    payload,
    fromParticipantId: member?.participantId || null,
    fromName: member?.name || "Hệ thống",
    fromIsAdminObserver: Boolean(member?.isAdminObserver),
    targetParticipantId,
    createdAt: Date.now()
  };
  room.events.push(event);
  if (room.events.length > EVENT_LIMIT) room.events.splice(0, room.events.length - EVENT_LIMIT);
  return event;
}
function pruneRooms(now = Date.now()) {
  for (const [id, room] of rooms) {
    for (const [participantId, member] of room.members) {
      if (now - member.lastSeenAt > MEMBER_STALE_MS) {
        room.members.delete(participantId);
        addEvent(room, "participant-left", { participantId }, member);
      }
    }
    if (!room.members.size && now - room.lastActivityAt > ROOM_IDLE_TTL) rooms.delete(id);
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

  app.get("/api/study-rooms", sameOrigin, auth, (req, res) => {
    pruneRooms();
    const isAdmin = req.user.role === "admin" && Number(req.user.adminLevel) >= 1;
    res.setHeader("Cache-Control", "no-store");
    res.json({ rooms: [...rooms.values()].map(publicRoom), isAdmin });
  });

  app.post("/api/study-rooms", sameOrigin, auth, (req, res) => {
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    const password = String(req.body?.password || "");
    if (name.length < 3 || name.length > 60) return fail(res, 400, "Tên phòng phải từ 3 đến 60 ký tự.");
    if (password.length > 72) return fail(res, 400, "Mật khẩu phòng tối đa 72 ký tự.");
    pruneRooms();
    let id = makeRoomId();
    while (rooms.has(id)) id = makeRoomId();
    const now = Date.now();
    const room = {
      id, name, creatorId: req.user.id, creatorName: req.user.name,
      passwordHash: password ? hashRoomPassword(password) : null,
      createdAt: now, lastActivityAt: now, members: new Map(),
      events: [], eventSequence: 0, chatHistory: []
    };
    addEvent(room, "system", { message: `${req.user.name} đã tạo phòng học.` }, null);
    rooms.set(id, room);
    res.status(201).json({ room: publicRoom(room), roomId: id });
  });

  app.post("/api/study-rooms/:roomId/join", sameOrigin, auth, (req, res) => {
    pruneRooms();
    const room = requireRoom(req.params.roomId, res);
    if (!room) return;
    const monitor = Boolean(req.body?.monitor);
    const isAdmin = req.user.role === "admin" && Number(req.user.adminLevel) >= 1;
    if (monitor && !isAdmin) return fail(res, 403, "Chỉ Admin mới có quyền giám sát phòng.");
    if (!monitor && room.passwordHash && !verifyRoomPassword(String(req.body?.password || ""), room.passwordHash)) {
      return fail(res, 403, "Mật khẩu phòng không đúng.");
    }
    const existing = [...room.members.values()].find(member => member.userId === req.user.id && member.isAdminObserver === monitor);
    if (existing) {
      existing.lastSeenAt = Date.now();
      return res.json({ participant: publicMember(existing), participantToken: existing.participantId, room: publicRoom(room), members: [...room.members.values()].map(publicMember), messages: room.chatHistory.slice(-100), lastEventId: room.eventSequence });
    }
    if (!monitor && studentMembers(room).length >= MAX_STUDENTS) return fail(res, 409, "Phòng đã đủ 12 người.");
    if (monitor && [...room.members.values()].some(member => member.isAdminObserver && member.userId === req.user.id)) {
      return fail(res, 409, "Bạn đang giám sát phòng này ở một cửa sổ khác.");
    }
    const participantId = crypto.randomBytes(18).toString("hex");
    const member = {
      participantId, userId: req.user.id, name: String(req.user.name || "Người học").slice(0, 80),
      isAdminObserver: monitor, handRaised: false, micOn: false, cameraOn: false,
      joinedAt: Date.now(), lastSeenAt: Date.now()
    };
    room.members.set(participantId, member);
    room.lastActivityAt = Date.now();
    addEvent(room, "participant-joined", { member: publicMember(member) }, member);
    res.json({ participant: publicMember(member), participantToken: participantId, room: publicRoom(room), members: [...room.members.values()].map(publicMember), messages: room.chatHistory.slice(-100), lastEventId: room.eventSequence });
  });

  app.get("/api/study-rooms/:roomId/events", sameOrigin, auth, (req, res) => {
    pruneRooms();
    const room = requireRoom(req.params.roomId, res);
    if (!room) return;
    const member = memberFor(room, req, req.query.token, res);
    if (!member) return;
    member.lastSeenAt = Date.now();
    room.lastActivityAt = Date.now();
    const since = Math.max(0, Number(req.query.since) || 0);
    const events = room.events
      .filter(event => event.id > since && (!event.targetParticipantId || event.targetParticipantId === member.participantId))
      .map(event => ({ ...event }));
    res.setHeader("Cache-Control", "no-store");
    res.json({ room: publicRoom(room), members: [...room.members.values()].map(publicMember), events, lastEventId: room.eventSequence });
  });

  app.post("/api/study-rooms/:roomId/events", sameOrigin, auth, (req, res) => {
    const room = requireRoom(req.params.roomId, res);
    if (!room) return;
    const member = memberFor(room, req, req.body?.token, res);
    if (!member) return;
    member.lastSeenAt = Date.now();
    room.lastActivityAt = Date.now();
    const type = String(req.body?.type || "");
    const payload = req.body?.payload || {};
    const target = req.body?.targetParticipantId ? String(req.body.targetParticipantId) : null;
    const allowed = new Set(["chat", "hand", "media-state", "signal-offer", "signal-answer", "signal-ice"]);
    if (!allowed.has(type)) return fail(res, 400, "Loại sự kiện phòng không hợp lệ.");
    if (type.startsWith("signal-") && (!target || target === member.participantId)) return fail(res, 400, "Đích tín hiệu WebRTC không hợp lệ.");
    if (type === "chat") {
      const text = String(payload.text || "").trim();
      const image = String(payload.image || "");
      if (!text && !image) return fail(res, 400, "Tin nhắn không được để trống.");
      if (text.length > 2000) return fail(res, 400, "Tin nhắn tối đa 2.000 ký tự.");
      if (image) {
        if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image)) return fail(res, 400, "Tệp ảnh không được hỗ trợ.");
        const approximateBytes = Math.floor(image.length * 3 / 4);
        if (approximateBytes > IMAGE_MAX_BYTES) return fail(res, 413, "Ảnh tối đa 2 MB.");
      }
      const chat = { id: crypto.randomBytes(10).toString("hex"), text, image: image || null, participantId: member.participantId, name: member.name, isAdminObserver: member.isAdminObserver, createdAt: Date.now() };
      room.chatHistory.push(chat);
      if (room.chatHistory.length > 100) room.chatHistory.shift();
      const event = addEvent(room, "chat", chat, member);
      return res.json({ ok: true, eventId: event.id });
    }
    if (type === "hand") {
      member.handRaised = Boolean(payload.raised);
      addEvent(room, "hand", { participantId: member.participantId, raised: member.handRaised }, member);
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

  app.post("/api/study-rooms/:roomId/leave", sameOrigin, auth, (req, res) => {
    const room = rooms.get(String(req.params.roomId || "").toUpperCase());
    if (!room) return res.json({ ok: true });
    const member = memberFor(room, req, req.body?.token, res);
    if (!member) return;
    room.members.delete(member.participantId);
    addEvent(room, "participant-left", { participantId: member.participantId }, member);
    room.lastActivityAt = Date.now();
    res.json({ ok: true });
  });

  app.delete("/api/study-rooms/:roomId", sameOrigin, auth, (req, res) => {
    const room = rooms.get(String(req.params.roomId || "").toUpperCase());
    if (!room) return res.json({ ok: true });
    const member = [...room.members.values()].find(value => value.userId === req.user.id && !value.isAdminObserver);
    const isAdmin = req.user.role === "admin" && Number(req.user.adminLevel) >= 1;
    if (!isAdmin && room.creatorId !== req.user.id) return fail(res, 403, "Chỉ người tạo phòng hoặc Admin mới có thể đóng phòng.");
    addEvent(room, "room-closed", { message: "Phòng đã được đóng bởi chủ phòng hoặc Admin." }, member || null);
    rooms.delete(room.id);
    res.json({ ok: true });
  });

  console.info("Study Rooms module loaded (12 students per room).");
}
