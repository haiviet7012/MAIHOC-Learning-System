import { randomUUID } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  TrackSource,
} from "livekit-server-sdk";
import { fail, text, integer, classPermission } from "../platform/policy.js";
import { upgradeAccess, chargeAi, uuid } from "../school-upgrade/policy.js";
import { wrap, assertNoExam } from "../school-upgrade/documents.js";
import { generateSchool } from "../school-upgrade/ai.js";
export const livekitConfigured = () =>
  ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].every((k) =>
    process.env[k]?.trim(),
  );
const roomName = (r) => `maihoc-school-${r.id}`;
export function livekitServices() {
  if (!livekitConfigured())
    fail(
      "Chưa cấu hình dịch vụ video School (LIVEKIT_URL/API_KEY/API_SECRET).",
      503,
    );
  const url = process.env.LIVEKIT_URL.trim();
  if (!/^wss:\/\//.test(url)) fail("LIVEKIT_URL phải dùng wss://.", 503);
  const host = url.replace(/^wss:/, "https:");
  return {
    rooms: new RoomServiceClient(
      host,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { requestTimeout: 10000 },
    ),
    egress: new EgressClient(
      host,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { requestTimeout: 15000 },
    ),
  };
}
export async function reserveSeat(db, room, user, participants) {
  const identities = new Set(
    participants.filter((p) => !p.permission?.hidden).map((p) => p.identity),
  );
  const reservations = (
    await db.query(
      "SELECT user_id FROM school_room_members WHERE room_id=$1 AND lease_until>now()",
      [room.id],
    )
  ).rows;
  reservations.forEach((m) => identities.add(String(m.user_id)));
  if (!identities.has(String(user.id)) && identities.size >= 50)
    fail("Phòng School đã đủ 50 người.", 409);
  await db.query(
    `INSERT INTO school_room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT(room_id,user_id) DO UPDATE SET lease_until=now()+interval '90 seconds',consent_at=now()`,
    [room.id, user.id],
  );
}
export function installSchoolRooms(
  router,
  { db, services = livekitServices, generate = generateSchool },
) {
  const roomFor = async (req, live = false, allowClosed = false) => {
    const room = (
      await db.query("SELECT * FROM school_room_sessions WHERE id=$1", [
        uuid(req.params.id),
      ])
    ).rows[0];
    if (!room || (!allowClosed && room.closed_at))
      fail("Phòng không tồn tại hoặc đã đóng.", 404);
    await upgradeAccess(db, req.user, room.school_id);
    if (room.class_id)
      await classPermission(db, req.user, room.school_id, room.class_id);
    if (live) {
      const m = (
        await db.query(
          "SELECT user_id FROM school_room_members WHERE room_id=$1 AND user_id=$2 AND lease_until>now()",
          [room.id, req.user.id],
        )
      ).rows[0];
      if (!m) fail("Tham gia phòng trước khi sử dụng.", 403);
    }
    return room;
  };
  const host = (r, u) => {
    if (String(r.owner_id) !== String(u.id))
      fail("Chỉ chủ phòng được thực hiện thao tác này.", 403);
  };
  router.get(
    "/rooms",
    wrap(async (req, res) => {
      const sid = integer(req.query.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      const all = (
        await db.query(
          `SELECT r.*,u.name AS owner_name FROM school_room_sessions r JOIN users u ON u.id=r.owner_id WHERE r.school_id=$1 AND r.closed_at IS NULL ORDER BY r.created_at DESC LIMIT 100`,
          [sid],
        )
      ).rows;
      const rooms = [];
      for (const r of all) {
        try {
          if (r.class_id) await classPermission(db, req.user, sid, r.class_id);
          rooms.push(r);
        } catch (e) {
          if (e.status !== 403) throw e;
        }
      }
      res.json({ rooms, configured: livekitConfigured(), maxParticipants: 50 });
    }),
  );
  router.post(
    "/rooms",
    wrap(async (req, res) => {
      const sid = integer(req.body.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      const classId = req.body.classId
        ? integer(req.body.classId, "Lớp")
        : null;
      if (classId) await classPermission(db, req.user, sid, classId);
      const svc = services(),
        id = randomUUID();
      await db.transaction(async () => {
        await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const active = (
          await db.query(
            "SELECT id FROM school_room_sessions WHERE owner_id=$1 AND closed_at IS NULL",
            [req.user.id],
          )
        ).rows;
        if (active.length >= 3)
          fail("Đóng bớt phòng trước khi tạo phòng mới.", 409);
        // SFU limit includes a recording bot; the application reserves exactly 50 human seats.
        await svc.rooms.createRoom({
          name: roomName({ id }),
          maxParticipants: 51,
          emptyTimeout: 300,
          departureTimeout: 60,
        });
        await db.query(
          "INSERT INTO school_room_sessions(id,school_id,class_id,owner_id,title) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            sid,
            classId,
            req.user.id,
            text(req.body.title, "Tên phòng", 200),
          ],
        );
      })();
      res.status(201).json({ id });
    }),
  );
  router.post(
    "/rooms/:id/token",
    wrap(async (req, res) => {
      const room = await roomFor(req);
      if (room.locked && String(room.owner_id) !== String(req.user.id))
        fail("Chủ phòng đã khóa phòng.", 403);
      if (req.body.consent !== true)
        fail("Xác nhận phòng có thể được ghi hình trước khi tham gia.");
      const svc = services();
      await db.transaction(async () => {
        await db.query(
          "SELECT id FROM school_room_sessions WHERE id=$1 FOR UPDATE",
          [room.id],
        );
        const still = (
          await db.query(
            "SELECT closed_at FROM school_room_sessions WHERE id=$1",
            [room.id],
          )
        ).rows[0];
        if (still.closed_at) fail("Phòng đã đóng.", 409);
        // Recreate an empty expired SFU room with the same name and bounded capacity.
        await svc.rooms.createRoom({
          name: roomName(room),
          maxParticipants: 51,
          emptyTimeout: 300,
          departureTimeout: 60,
        });
        await reserveSeat(
          db,
          room,
          req.user,
          await svc.rooms.listParticipants(roomName(room)),
        );
      })();
      const token = new AccessToken(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
        { identity: String(req.user.id), name: req.user.name, ttl: 60 },
      );
      token.addGrant({
        roomJoin: true,
        room: roomName(room),
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
      });
      res.json({
        token: await token.toJwt(),
        url: process.env.LIVEKIT_URL,
        room,
        owner: String(room.owner_id) === String(req.user.id),
      });
    }),
  );
  router.post(
    "/rooms/:id/heartbeat",
    wrap(async (req, res) => {
      const room = await roomFor(req);
      const participant = (
        await services().rooms.listParticipants(roomName(room))
      ).find((x) => x.identity === String(req.user.id));
      if (!participant) fail("Bạn không còn kết nối trong phòng.", 403);
      await db.query(
        `UPDATE school_room_members SET lease_until=now()+interval '90 seconds' WHERE room_id=$1 AND user_id=$2`,
        [room.id, req.user.id],
      );
      res.json({ ok: true });
    }),
  );
  router.post(
    "/rooms/:id/leave",
    wrap(async (req, res) => {
      const room = await roomFor(req);
      await services()
        .rooms.removeParticipant(roomName(room), String(req.user.id))
        .catch(() => {});
      await db.query(
        "UPDATE school_room_members SET lease_until=now() WHERE room_id=$1 AND user_id=$2",
        [room.id, req.user.id],
      );
      await db.query(
        "UPDATE school_room_sessions SET presenter_id=NULL WHERE id=$1 AND presenter_id=$2",
        [room.id, req.user.id],
      );
      res.json({ ok: true });
    }),
  );
  router.post(
    "/rooms/:id/lock",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      host(room, req.user);
      await db.query("UPDATE school_room_sessions SET locked=$2 WHERE id=$1", [
        room.id,
        req.body.locked === true,
      ]);
      res.json({ ok: true });
    }),
  );
  router.post(
    "/rooms/:id/remove",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      host(room, req.user);
      const id = integer(req.body.userId, "Thành viên");
      if (id === Number(room.owner_id)) fail("Không thể tự mời ra.");
      await services().rooms.removeParticipant(roomName(room), String(id));
      await db.query(
        "UPDATE school_room_members SET lease_until=now() WHERE room_id=$1 AND user_id=$2",
        [room.id, id],
      );
      res.json({ ok: true });
    }),
  );
  router.delete(
    "/rooms/:id",
    wrap(async (req, res) => {
      const room = await roomFor(req);
      host(room, req.user);
      await services().rooms.deleteRoom(roomName(room));
      await db.query(
        "UPDATE school_room_sessions SET closed_at=now() WHERE id=$1",
        [room.id],
      );
      res.json({ closed: true });
    }),
  );
  router.post(
    "/rooms/:id/screen",
    wrap(async (req, res) => {
      const room = await roomFor(req, true),
        svc = services();
      await db.transaction(async () => {
        const current = (
          await db.query(
            "SELECT * FROM school_room_sessions WHERE id=$1 FOR UPDATE",
            [room.id],
          )
        ).rows[0];
        const participants = await svc.rooms.listParticipants(roomName(room));
        if (
          req.body.enabled === true &&
          current.presenter_id &&
          String(current.presenter_id) !== String(req.user.id)
        ) {
          if (
            participants.some(
              (p) => p.identity === String(current.presenter_id),
            )
          )
            fail("Đang có người trình bày. Chờ họ dừng chia sẻ.", 409);
        }
        const sources = [
          TrackSource.CAMERA,
          TrackSource.MICROPHONE,
          ...(req.body.enabled === true
            ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
            : []),
        ];
        await svc.rooms.updateParticipant(roomName(room), String(req.user.id), {
          permission: {
            canPublish: true,
            canSubscribe: true,
            canPublishData: false,
            canPublishSources: sources,
          },
        });
        if (req.body.enabled === true)
          await db.query(
            "UPDATE school_room_sessions SET presenter_id=$2 WHERE id=$1",
            [room.id, req.user.id],
          );
        else
          await db.query(
            "UPDATE school_room_sessions SET presenter_id=NULL WHERE id=$1 AND presenter_id=$2",
            [room.id, req.user.id],
          );
      })();
      res.json({ ok: true });
    }),
  );
  router.get(
    "/rooms/:id/state",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      const records = (
        await db.query(
          "SELECT id,status,error,created_at,expires_at,egress_id FROM school_room_recordings WHERE room_id=$1 ORDER BY created_at DESC LIMIT 20",
          [room.id],
        )
      ).rows;
      for (const r of records)
        if (
          r.egress_id &&
          ["starting", "recording", "stopping", "processing"].includes(r.status)
        ) {
          const info = (
            await services().egress.listEgress({ egressId: r.egress_id })
          )[0];
          if (info) {
            const status =
              info.status === 3
                ? "ready"
                : info.status >= 4
                  ? "failed"
                  : info.status === 1
                    ? "recording"
                    : info.status === 2
                      ? "processing"
                      : "starting";
            await db.query(
              "UPDATE school_room_recordings SET status=$2,error=$3 WHERE id=$1",
              [
                r.id,
                status,
                status === "failed"
                  ? "Dịch vụ ghi hình chưa tạo được MP4."
                  : null,
              ],
            );
            r.status = status;
          }
        }
      const messages = (
        await db.query(
          `SELECT m.id,m.content,m.created_at,u.name FROM school_room_messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.id DESC LIMIT 100`,
          [room.id],
        )
      ).rows.reverse();
      res.json({
        room,
        recordings: records.map(({ egress_id, ...r }) => r),
        messages,
      });
    }),
  );
  router.post(
    "/rooms/:id/messages",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      await db.query(
        "INSERT INTO school_room_messages(room_id,user_id,content) VALUES($1,$2,$3)",
        [room.id, req.user.id, text(req.body.message, "Tin nhắn", 4000)],
      );
      res.status(201).json({ ok: true });
    }),
  );
  router.post(
    "/rooms/:id/ai/messages",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      await assertNoExam(db, req.user.id);
      const key = uuid(req.body.requestKey),
        message = text(req.body.message, "Câu hỏi", 8000);
      const prior = (
        await db.query("SELECT * FROM school_room_ai_requests WHERE id=$1", [
          key,
        ])
      ).rows[0];
      if (prior) {
        if (
          String(prior.user_id) !== String(req.user.id) ||
          prior.room_id !== room.id
        )
          fail("Mã yêu cầu đã được sử dụng.", 409);
        if (prior.status !== "done")
          fail("Yêu cầu đang xử lý hoặc đã lỗi. Gửi lại với mã mới.", 409);
        return res.json(prior.result);
      }
      await chargeAi(db, req.user, room.school_id);
      await db.query(
        "INSERT INTO school_room_ai_requests(id,room_id,user_id) VALUES($1,$2,$3)",
        [key, room.id, req.user.id],
      );
      try {
        const result = await generate({ kind: "room", payload: { message } });
        await assertNoExam(db, req.user.id);
        await db.query(
          "UPDATE school_room_ai_requests SET result=$2,status='done' WHERE id=$1",
          [key, JSON.stringify(result)],
        );
        res.json(result);
      } catch (error) {
        await db.query(
          "UPDATE school_room_ai_requests SET status='failed' WHERE id=$1",
          [key],
        );
        throw error;
      }
    }),
  );
  router.post(
    "/rooms/:id/recordings",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      host(room, req.user);
      if (process.env.MAIHOC_SCHOOL_RECORDING_ENABLED !== "1")
        fail("Ghi MP4 chưa được quản trị viên bật.", 503);
      const fields = [
        "R2_BUCKET_NAME",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
      ];
      if (
        fields.some((x) => !process.env[x]) ||
        (!process.env.R2_ENDPOINT && !process.env.R2_ACCOUNT_ID)
      )
        fail("Chưa cấu hình kho ghi hình R2.", 503);
      const id = randomUUID(),
        objectKey = `school-private/recordings/${room.school_id}/${room.id}/${id}.mp4`;
      try {
        await db.query(
          "INSERT INTO school_room_recordings(id,room_id,object_key) VALUES($1,$2,$3)",
          [id, room.id, objectKey],
        );
      } catch (e) {
        if (e.code === "23505")
          fail("Phòng đã có tác vụ ghi hình đang chạy.", 409);
        throw e;
      }
      try {
        const output = new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: objectKey,
          output: {
            case: "s3",
            value: new S3Upload({
              accessKey: process.env.R2_ACCESS_KEY_ID,
              secret: process.env.R2_SECRET_ACCESS_KEY,
              bucket: process.env.R2_BUCKET_NAME,
              region: "auto",
              endpoint:
                process.env.R2_ENDPOINT ||
                `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              forcePathStyle: true,
            }),
          },
        });
        const info = await services().egress.startRoomCompositeEgress(
          roomName(room),
          output,
          { layout: "speaker" },
        );
        await db.query(
          "UPDATE school_room_recordings SET egress_id=$2,status='recording' WHERE id=$1",
          [id, info.egressId],
        );
        res.status(201).json({ id });
      } catch (error) {
        await db.query(
          "UPDATE school_room_recordings SET status='failed',error='Không khởi động được dịch vụ ghi hình.' WHERE id=$1",
          [id],
        );
        fail(
          "Không khởi động được dịch vụ ghi hình. Kiểm tra cấu hình Egress và R2.",
          502,
        );
      }
    }),
  );
  router.post(
    "/rooms/:id/recordings/:recordingId/stop",
    wrap(async (req, res) => {
      const room = await roomFor(req, true);
      host(room, req.user);
      const r = (
        await db.query(
          "SELECT * FROM school_room_recordings WHERE id=$1 AND room_id=$2",
          [uuid(req.params.recordingId), room.id],
        )
      ).rows[0];
      if (!r?.egress_id) fail("Không tìm thấy bản ghi.", 404);
      if (["starting", "recording"].includes(r.status)) {
        await services().egress.stopEgress(r.egress_id);
        await db.query(
          "UPDATE school_room_recordings SET status='processing' WHERE id=$1",
          [r.id],
        );
      }
      res.json({ ok: true });
    }),
  );
  router.get(
    "/rooms/:id/recordings/:recordingId/file",
    wrap(async (req, res) => {
      const room = await roomFor(req, false, true);
      const member = (
        await db.query(
          "SELECT user_id FROM school_room_members WHERE room_id=$1 AND user_id=$2",
          [room.id, req.user.id],
        )
      ).rows[0];
      if (!member) fail("Bản ghi chỉ dành cho người đã tham gia.", 403);
      const r = (
        await db.query(
          "SELECT * FROM school_room_recordings WHERE id=$1 AND room_id=$2 AND status='ready' AND expires_at>now()",
          [uuid(req.params.recordingId), room.id],
        )
      ).rows[0];
      if (!r) fail("Bản ghi chưa sẵn sàng hoặc đã hết hạn.", 404);
      const { readFromR2 } = await import("../r2-storage.js");
      const file = await readFromR2(r.object_key);
      if (!file.ContentLength) fail("MP4 chưa được lưu thành công.", 409);
      res
        .type("video/mp4")
        .set(
          "Content-Disposition",
          `attachment; filename="maihoc-${r.id}.mp4"`,
        );
      file.Body.on("error", () => res.destroy()).pipe(res);
    }),
  );
}

// Periodic reconciliation also revokes media access after school/class membership changes.
export async function reconcileSchoolRoomAccess(
  db,
  services = livekitServices,
) {
  if (!livekitConfigured()) return;
  const sessions = (
    await db.query(
      "SELECT * FROM school_room_sessions WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 100",
    )
  ).rows;
  const svc = services();
  for (const room of sessions) {
    const active = await svc.rooms.listParticipants(roomName(room));
    for (const participant of active) {
      if (participant.permission?.hidden) continue;
      const user = /^\d+$/.test(participant.identity)
        ? (
            await db.query("SELECT * FROM users WHERE id=$1", [
              participant.identity,
            ])
          ).rows[0]
        : null;
      try {
        await upgradeAccess(db, user, room.school_id);
        if (room.class_id)
          await classPermission(db, user, room.school_id, room.class_id);
      } catch (error) {
        if (![403, 404].includes(error.status)) throw error;
        await svc.rooms.removeParticipant(roomName(room), participant.identity);
        await db.query(
          "UPDATE school_room_members SET lease_until=now() WHERE room_id=$1 AND user_id=$2",
          [room.id, user?.id || 0],
        );
      }
    }
  }
}
