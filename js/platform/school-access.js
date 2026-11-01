// Shared by the browser and server; access uses the authenticated account only.
export function canAccessSchool(user) {
  if (!user) return false;
  const level = Number(user.admin_level ?? user.adminLevel ?? 0);
  if (user.role === 'admin' && level >= 1) return true;
  if (user.role === 'teacher') return true;
  return user.role === 'user' && (
    (user.account_type ?? user.accountType) === 'school' ||
    Boolean(user.student_class ?? user.class_code ?? user.classCode)
  );
}

export const schoolRoutes = new Set([
  'organization', 'school', 'school-class', 'student-progress', 'question-bank',
  'admin', 'assignments', 'assignment-management', 'school-analytics', 'tests', 'timetable',
]);
