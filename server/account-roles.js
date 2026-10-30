export const ACCOUNT_ROLES = Object.freeze({ ADMIN: "admin", TEACHER: "teacher", STUDENT: "student" });
export function normalizeAccountRole(role, adminLevel = 0) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "admin") {
    const level = Number(adminLevel) || 0;
    return level >= 2 ? "admin" : level >= 1 ? "teacher" : "student";
  }
  return value === "teacher" ? "teacher" : "student";
}
export function isStaffRole(role) { return role === "admin" || role === "teacher"; }
