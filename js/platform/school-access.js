// Shared by the browser and server; access uses the authenticated account only.
export function canAccessSchool(user) {
  if (!user) return false;
  const level = Number(user.admin_level ?? user.adminLevel ?? 0);
  if (user.role === 'admin' && level >= 1) return true;
  if (user.role === 'teacher') return true;
  // "premium" is retained only so historical accounts are not locked out.
  // The current public catalog and admin grant API expose Standard only.
  return user.role === 'user' && ['legacy','standard','premium'].includes(user.schoolPlan ?? user.school_plan);
}

export const schoolRoutes = new Set([
  "school-tutor",
  'school-lab', 'school-rooms', 'school-digitize', 'school-notebook',
  'school-plans', 'school-advisor', 'school-ielts', 'school-announcements', 'organization', 'school', 'school-class', 'student-progress', 'question-bank',
  'admin', 'assignments', 'assignment-management', 'school-analytics', 'tests', 'timetable',
]);
