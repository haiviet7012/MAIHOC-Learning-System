// Shared by the browser and server; access uses the authenticated account only.
export function canAccessSchool(user) {
  if (!user) return false;
  const level = Number(user.admin_level ?? user.adminLevel ?? 0);
  if (user.role === 'admin' && level >= 1) return true;
  if (user.role === 'teacher') return true;
  const plan = user.schoolPlan ?? user.school_plan ?? 'none';
  if (user.role !== 'user') return false;
  // Historical Premium rows remain grandfathered until migration 008 maps them to Legacy.
  // Premium is not a purchasable or grantable plan in the current catalog.
  if (plan === 'legacy' || plan === 'premium') return true;
  if (plan !== 'standard') return false;
  const expiresAt = user.schoolExpiresAt ?? user.school_expires_at ?? null;
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

export const schoolRoutes = new Set([
  "school-tutor",
  'school-lab', 'school-rooms', 'school-digitize', 'school-notebook',
  'school-plans', 'school-advisor', 'school-ielts', 'ielts-skill', 'school-announcements', 'organization', 'school', 'school-class', 'student-progress', 'question-bank',
  'admin', 'assignments', 'assignment-management', 'school-analytics', 'tests', 'timetable',
]);
