import express from "express";
import { randomUUID } from "node:crypto";
import { canAccessSchool } from "../../js/platform/school-access.js";
import { geminiConfigured } from "../ai-provider.js";
import { integer, fail } from "../platform/policy.js";
import { upgradeAccess, upgradeEnabled } from "./policy.js";
import { installDocuments, wrap } from "./documents.js";
import {
  installSchoolRooms,
  livekitConfigured,
} from "../study-rooms/school.js";
import { installInterventions } from "./interventions.js";
export function createSchoolUpgradeRouter({
  db,
  requireAuth,
  requireSameOrigin,
  enabled = upgradeEnabled,
  ...deps
}) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.get(
    "/capabilities",
    wrap(async (req, res) => {
      if (!canAccessSchool(req.user))
        return res.status(403).json({ error: "Cần tài khoản School." });
      if (!enabled()) return res.json({ enabled: false, schools: [] });
      const all = (
        await db.query(
          `SELECT s.id,s.name FROM schools s JOIN school_upgrade_access a ON a.school_id=s.id WHERE s.status='active' AND a.enabled AND (a.expires_at IS NULL OR a.expires_at>now()) ORDER BY s.name`,
        )
      ).rows;
      const schools = [];
      for (const s of all) {
        try {
          await upgradeAccess(db, req.user, s.id);
          schools.push(s);
        } catch (e) {
          if (e.status !== 403) throw e;
        }
      }
      res.json({
        enabled: true,
        schools,
        video: livekitConfigured(),
        roomAi: geminiConfigured("room"),
        documentAi: geminiConfigured("document"),
        recording: process.env.MAIHOC_SCHOOL_RECORDING_ENABLED === "1",
        maxParticipants: 50,
      });
    }),
  );
  router.use((req, res, next) =>
    enabled()
      ? next()
      : res.status(503).json({ error: "Bản thử nghiệm School chưa được bật." }),
  );
  router.use((req, res, next) =>
    ["GET", "HEAD", "OPTIONS"].includes(req.method)
      ? next()
      : requireSameOrigin(req, res, next),
  );
  installDocuments(router, { db, ...deps });
  installSchoolRooms(router, { db, ...deps });
  installInterventions(router, { db });
  router.get(
    "/lab/catalog",
    wrap(async (req, res) => {
      const sid = integer(req.query.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      res.json({
        experiments: [
          {
            id: "helix",
            name: "Điện tích trong từ trường đều",
            description: "Lực Lorentz; bỏ qua bức xạ và va chạm.",
          },
          {
            id: "projectile",
            name: "Ném xiên trong không gian",
            description: "Trọng trường đều; bỏ qua lực cản.",
          },
          {
            id: "field",
            name: "Đường sức từ dây thẳng dài",
            description: "Dây vô hạn; môi trường chân không.",
          },
        ],
      });
    }),
  );
  router.post(
    "/lab/sessions",
    wrap(async (req, res) => {
      const sid = integer(req.body.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      if (!["helix", "projectile", "field"].includes(req.body.experiment))
        fail("Thí nghiệm không hợp lệ.");
      const params = req.body.parameters,
        measurements = req.body.measurements;
      if (
        !params ||
        !Array.isArray(measurements) ||
        measurements.length > 100 ||
        JSON.stringify({ params, measurements }).length > 20000
      )
        fail("Phiên thí nghiệm không hợp lệ.");
      const id = randomUUID();
      await db.query(
        "INSERT INTO school_lab_sessions(id,school_id,user_id,experiment,parameters,measurements) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          sid,
          req.user.id,
          req.body.experiment,
          JSON.stringify(params),
          JSON.stringify(measurements),
        ],
      );
      res.status(201).json({ id });
    }),
  );
  router.get(
    "/lab/sessions",
    wrap(async (req, res) => {
      const sid = integer(req.query.schoolId, "Trường");
      await upgradeAccess(db, req.user, sid);
      res.json({
        sessions: (
          await db.query(
            "SELECT * FROM school_lab_sessions WHERE school_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 30",
            [sid, req.user.id],
          )
        ).rows,
      });
    }),
  );
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const safe = error.safeAiError || Number.isInteger(error.status);
    res
      .status(
        safe
          ? error.status || 400
          : error.code === "LIMIT_FILE_SIZE"
            ? 413
            : 503,
      )
      .json({
        error: safe
          ? error.message
          : error.code === "LIMIT_FILE_SIZE"
            ? "Tệp vượt quá 10 MB."
            : "Chưa thực hiện được thao tác School. Kiểm tra migration, dịch vụ và thử lại.",
        ...(error.safeAiError ? { code: error.code } : {}),
      });
  });
  return router;
}
