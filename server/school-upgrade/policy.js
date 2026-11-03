import { canAccessSchool } from "../../js/platform/school-access.js";
import { membership, fail } from "../platform/policy.js";
export const upgradeEnabled = () =>
  process.env.MAIHOC_PLATFORM_ENABLED === "1" &&
  process.env.MAIHOC_SCHOOL_UPGRADE_ENABLED === "1";
export async function upgradeAccess(db, user, schoolId, roles = []) {
  if (!canAccessSchool(user)) fail("Cần tài khoản MAIHOC School.", 403);
  const member = await membership(db, user, schoolId, roles);
  const access = (
    await db.query("SELECT * FROM school_upgrade_access WHERE school_id=$1", [
      schoolId,
    ])
  ).rows[0];
  // Pilot enrollment is explicit and does not change existing entitlements. The old premium value remains accepted only for backward compatibility.
  if (
    !access?.enabled ||
    (access.expires_at && new Date(access.expires_at) <= new Date())
  )
    fail(
      "Trường chưa được bật bản thử nghiệm School hoặc đã hết hạn thử nghiệm.",
      403,
    );
  return { ...member, dailyAiCalls: access.daily_ai_calls };
}
export async function chargeAi(db, user, schoolId) {
  const access = await upgradeAccess(db, user, schoolId);
  const r = await db.query(
    `INSERT INTO school_upgrade_usage(user_id,school_id,calls) VALUES($1,$2,1)
    ON CONFLICT(user_id,school_id,day) DO UPDATE SET calls=school_upgrade_usage.calls+1
    WHERE school_upgrade_usage.calls<$3 RETURNING calls`,
    [user.id, schoolId, access.dailyAiCalls],
  );
  if (!r.rows.length)
    fail("Đã đạt hạn mức AI thử nghiệm trong ngày (UTC).", 429);
}
export function uuid(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(value),
    )
  )
    fail("Mã tài nguyên không hợp lệ.");
  return value;
}
