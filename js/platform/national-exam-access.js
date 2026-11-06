export const nationalSubjects = ['Toán', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Ngữ văn', 'Sinh học'];
export const cognitionLevels = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
export function canManageNationalExams(user) {
  return Boolean(user && (user.role === 'teacher' || user.isTeacher || (user.role === 'admin' && Number(user.adminLevel ?? user.admin_level) >= 1)));
}
export const isNationalAdmin = user => Boolean(user?.role === 'admin' && Number(user.adminLevel ?? user.admin_level) >= 2);
