const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));

const DEFAULT_SCHOOL_CLASSES = [
  ...Array.from({ length: 9 }, (_, i) => `10A${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `11B${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `12C${i + 1}`)
];

const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không thể tải dữ liệu lớp học.");
  return data;
};

const classLabel = code => "Lớp " + esc(code);

function showSchoolToast(message, type = "success") {
  const region = document.getElementById("toast-region");
  if (!region) {
    alert(message);
    return;
  }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  region.append(el);
  setTimeout(() => el.remove(), 3800);
}

function isUserSuperAdmin(user) {
  return Boolean(user && user.role === "admin" && Number(user.adminLevel) >= 2);
}

function isUserTeacher(user) {
  return Boolean(
    user && (
      user.isTeacher ||
      user.role === "teacher" ||
      (user.role === "admin" && Number(user.adminLevel) >= 1 && Number(user.adminLevel) < 2)
    )
  );
}

function renderTeacherCards(teachers = []) {
  if (!teachers.length) {
    return '<p class="muted">Chưa có giáo viên được phân công.</p>';
  }
  return teachers.map(teacher => {
    const label = teacher.isHomeroom ? "Giáo viên chủ nhiệm" : "Giáo viên bộ môn";
    const subjects = (teacher.subjects || []).join(", ");
    return '<article class="school-person-card school-teacher-card ' + (teacher.isHomeroom ? "is-homeroom" : "") + '">' +
      '<span class="school-person-avatar">GV</span>' +
      '<span class="school-person-info"><strong>' + esc(teacher.name) + '</strong><small>' + label + (subjects ? " · " + esc(subjects) : "") + '</small></span>' +
      (teacher.isHomeroom ? '<span class="school-homeroom-tag">Chủ nhiệm</span>' : '') +
      '</article>';
  }).join("");
}

function renderStudentCards(students = [], classCode = "", { canViewProgress = false, canRemoveStudent = false } = {}) {
  if (!students.length) {
    return '<p class="muted">Lớp chưa có học sinh nào. Giáo viên chủ nhiệm có thể nhấn “＋ Thêm học sinh” bằng email hoặc học sinh nhấn “Tham gia lớp” để vào lớp.</p>';
  }
  return students.map(student => {
    const emailText = student.email ? ' · ' + esc(student.email) : '';
    return '<article class="school-person-card">' +
      '<span class="school-person-avatar">HS</span>' +
      '<span class="school-person-info"><strong>' + esc(student.name) + '</strong><small>Học sinh lớp ' + esc(classCode) + emailText + '</small></span>' +
      '<div class="school-person-actions">' +
      (canViewProgress
        ? '<a href="#" class="school-progress-link" data-school-progress="' + Number(student.id) + '" data-school-class="' + esc(classCode) + '">Tiến trình học tập ↗</a>'
        : '') +
      (canRemoveStudent
        ? '<button type="button" class="button secondary small" data-homeroom-remove-student="' + Number(student.id) + '" data-school-class="' + esc(classCode) + '" data-student-name="' + esc(student.name) + '">Xóa khỏi lớp</button>'
        : '') +
      '</div></article>';
  }).join("");
}

function renderHomeroomAddStudentSection(classCode) {
  return '<section class="school-homeroom-add-section">' +
    '<div class="school-homeroom-add-bar">' +
      '<div>' +
        '<span class="pill">CHỨC NĂNG GIÁO VIÊN CHỦ NHIỆM · ' + classLabel(classCode) + '</span>' +
        '<h3>Quản lý học sinh ' + classLabel(classCode) + '</h3>' +
        '<p class="muted tiny">Thêm trực tiếp học sinh vào lớp bằng email tài khoản học sinh, hoặc học sinh tự đăng nhập và bấm “Tham gia lớp” vào ' + classLabel(classCode) + '.</p>' +
      '</div>' +
    '</div>' +
    '<form id="homeroom-add-student-form" class="school-inline-form homeroom-add-student-form" data-homeroom-class="' + esc(classCode) + '">' +
      '<h4>Thêm học sinh vào ' + classLabel(classCode) + ' bằng Email</h4>' +
      '<div class="homeroom-add-input-row">' +
        '<label style="flex:1;margin:0">Email tài khoản học sinh' +
          '<input name="email" type="email" required maxlength="254" placeholder="Nhập email học sinh (ví dụ: hocsinh@gmail.com)" autocomplete="email">' +
        '</label>' +
        '<button class="button primary" type="submit">＋ Thêm học sinh vào lớp</button>' +
      '</div>' +
      '<p class="muted tiny" data-homeroom-add-status hidden></p>' +
    '</form>' +
  '</section>';
}

function renderStudentJoinClassInline(availableClasses = []) {
  const list = availableClasses.length
    ? availableClasses
    : DEFAULT_SCHOOL_CLASSES.map(code => ({ classCode: code, studentCount: 0, homeroomTeacher: null }));
  const options = list.map(item => {
    const gvcn = item.homeroomTeacher ? ` — GVCN: ${item.homeroomTeacher}` : "";
    const count = ` (${Number(item.studentCount || 0)} học sinh)`;
    return `<option value="${esc(item.classCode)}">Lớp ${esc(item.classCode)}${esc(gvcn)}${esc(count)}</option>`;
  }).join("");

  return '<section class="school-inline-form school-join-class-panel">' +
    '<p class="eyebrow">HỌC SINH TRƯỜNG</p>' +
    '<h2>Bạn chưa tham gia lớp nào</h2>' +
    '<p class="muted tiny">Chọn lớp của bạn để tham gia. Mỗi tài khoản chỉ được chọn lớp một lần; hãy kiểm tra kỹ trước khi xác nhận.</p>' +
    '<form id="student-join-class-inline-form">' +
      '<div class="homeroom-add-input-row">' +
        '<label style="flex:1;margin:0">Chọn lớp học' +
          '<select name="classCode" required><option value="">-- Chọn lớp của bạn (10A1 – 12C9) --</option>' + options + '</select>' +
        '</label>' +
        '<button class="button primary" type="submit">🏫 Tham gia lớp</button>' +
      '</div>' +
    '</form>' +
  '</section>';
}

function renderStudentJoinLockedNotice(classCode = "") {
  return '<section class="school-inline-form school-join-class-panel">' +
    '<h2>Bạn đã sử dụng lượt tham gia lớp</h2>' +
    '<p class="muted">Tài khoản này đã từng tham gia ' + (classCode ? classLabel(classCode) : 'một lớp') +
    '. Sau khi giáo viên duyệt rời lớp, hệ thống vẫn lưu lịch sử và không cho phép đăng ký lớp khác.</p>' +
    '<p class="muted tiny">Nếu có nhầm lẫn, hãy liên hệ Quản trị viên MAI HỌC để được hỗ trợ.</p>' +
  '</section>';
}

export async function mountSchoolPage(view, user, classCode = "") {
  window.__maihocCurrentUser = user || window.maihocCurrentUser || null;
  view.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Đang tải dữ liệu lớp học…</p></div>';
  try {
    if (classCode) {
      await renderClass(view, user, String(classCode).toUpperCase());
      return;
    }
    const data = await request("/api/school/classes");
    const classes = data.classes || [];
    const availableClasses = data.availableClasses || [];
    const isSuper = isUserSuperAdmin(user);
    const isTeacher = isUserTeacher(user);
    const isStudent = Boolean(user && !isSuper && !isTeacher);

    const cards = classes.map(item => {
      const role = item.isHomeroom
        ? "Giáo viên chủ nhiệm"
        : item.role === "student"
          ? "Lớp của bạn"
          : item.role === "admin"
            ? "Toàn quyền quản lý"
            : "Giáo viên bộ môn";
      const homeroomSub = item.homeroomTeacher ? ` · GVCN: ${esc(item.homeroomTeacher)}` : "";
      return '<button type="button" class="school-class-card ' + (item.isHomeroom ? "is-homeroom-card" : "") + '" data-school-class="' + esc(item.classCode) + '">' +
        '<span class="school-class-card-main"><strong>' + classLabel(item.classCode) + '</strong><small>' + esc(role) + homeroomSub + '</small></span>' +
        '<span class="school-class-card-meta"><strong>' + Number(item.studentCount || 0) + '</strong><small>học sinh</small></span>' +
        '<span class="school-class-card-arrow">›</span></button>';
    }).join("");

    // Danh sách thành viên chỉ xuất hiện sau khi mở thẻ lớp được phân công.
    const homeroomRosterBlock = "";
    
    // Học sinh chỉ chọn lớp tại đây khi chưa từng tham gia lớp nào.
    let studentClassBlock = "";
    if (isStudent && classes.length === 0) {
      studentClassBlock = data.hasJoinedClass
        ? renderStudentJoinLockedNotice(data.joinedClassCode || "")
        : renderStudentJoinClassInline(availableClasses);
    }

    const adminTools = data.allClasses ? await renderAdminTools() : "";
    const teacherNotice = isTeacher ? renderTeacherMessageForm() : "";

    const emptyClassesHtml = isStudent
      ? ''
      : '<div class="empty-state"><h3>Chưa có lớp được phân công</h3><p>Liên hệ Quản trị viên MAI HỌC để cập nhật lớp phụ trách của tài khoản.</p></div>';

    const headerActions = '';


    view.innerHTML = '<section class="school-page">' +
      '<header class="school-page-header">' +
        '<div><p class="eyebrow">MAI HỌC · CỘNG ĐỒNG TRƯỜNG</p><h1>Lớp của bạn</h1><p>' +
          (data.homeroomDetail?.classCode
            ? 'Quản lý danh sách học sinh lớp chủ nhiệm ' + classLabel(data.homeroomDetail.classCode) + ' và các lớp được phân công.'
            : 'Chọn một lớp để xem giáo viên và danh sách học sinh trong lớp.') +
        '</p></div>' +
        (headerActions ? '<div class="school-header-actions">' + headerActions + '</div>' : '') +
      '</header>' +
      homeroomRosterBlock +
      (cards ? '<section class="school-roster-section"><h2>' + (data.homeroomDetail ? 'Các lớp được phân công' : 'Danh sách lớp của bạn') + '</h2><div class="school-class-grid">' + cards + '</div></section>' : (!homeroomRosterBlock ? emptyClassesHtml : '')) +
      studentClassBlock +
      teacherNotice +
      adminTools +
      '</section>';
  } catch (error) {
    view.innerHTML = '<div class="empty-state"><h3>Không thể mở Lớp của bạn</h3><p>' + esc(error.message) + '</p></div>';
  }
}

function renderStudentLeaveClassSection(classCode, leaveRequest) {
  if (leaveRequest?.status === "pending") {
    return '<section class="school-leave-class-section school-inline-form">' +
      '<h3>Yêu cầu rời lớp đã được gửi</h3>' +
      '<p class="muted">Giáo viên chủ nhiệm đang xem xét yêu cầu của bạn. Bạn vẫn là thành viên lớp cho đến khi được duyệt.</p>' +
      '<span class="pill">Đang chờ duyệt</span>' +
    '</section>';
  }
  const rejectedMessage = leaveRequest?.status === "rejected"
    ? '<p class="auth-error" role="status">Yêu cầu trước đó chưa được chấp thuận. Bạn vẫn ở trong lớp và có thể gửi lại yêu cầu khi cần.</p>'
    : '';
  return '<section class="school-leave-class-section school-inline-form">' +
    '<h3>Rời khỏi lớp ' + esc(classCode) + '</h3>' +
    '<p class="muted">Bạn cần gửi yêu cầu và chờ giáo viên chủ nhiệm duyệt. Lịch sử đã tham gia vẫn được lưu; sau khi rời lớp, bạn không thể tự đăng ký lớp khác.</p>' +
    rejectedMessage +
    '<button class="button secondary" type="button" data-school-request-leave="' + esc(classCode) + '">Gửi yêu cầu rời lớp</button>' +
  '</section>';
}

function renderTeacherLeaveRequests(requests = [], classCode = "") {
  if (!requests.length) return "";
  return '<section class="school-roster-section school-leave-requests">' +
    '<h2>Yêu cầu rời lớp cần duyệt</h2>' +
    '<div class="school-roster-list">' +
      requests.map(item => '<article class="school-person-card school-leave-request-card">' +
        '<span class="school-person-avatar">HS</span>' +
        '<span class="school-person-info"><strong>' + esc(item.studentName) + '</strong><small>' + esc(item.studentEmail) + ' · Gửi lúc ' + esc(item.createdAt || "—") + '</small></span>' +
        '<div class="school-person-actions">' +
          '<button type="button" class="button primary small" data-school-review-leave-request="' + esc(item.id) + '" data-school-class="' + esc(classCode) + '" data-decision="approve">Duyệt rời lớp</button>' +
          '<button type="button" class="button secondary small" data-school-review-leave-request="' + esc(item.id) + '" data-school-class="' + esc(classCode) + '" data-decision="reject">Từ chối</button>' +
        '</div>' +
      '</article>').join("") +
    '</div>' +
  '</section>';
}

async function renderClass(view, user, classCode) {
  const data = await request("/api/school/classes/" + encodeURIComponent(classCode));
  const teachers = data.teachers || [];
  const students = data.students || [];
  const isSuper = isUserSuperAdmin(user);
  const isTeacher = isUserTeacher(user);
  const canViewProgress = isTeacher || isSuper;
  const canManageMembers = Boolean(data.canManageMembers);
  const isStudent = Boolean(user && !isUserTeacher(user) && !isUserSuperAdmin(user));

  const teacherCards = renderTeacherCards(teachers);
  const studentCards = renderStudentCards(students, classCode, {
    canViewProgress,
    canRemoveStudent: canManageMembers
  });

  const addStudentBlock = canManageMembers ? renderHomeroomAddStudentSection(classCode) : "";
  const teacherLeaveRequests = canManageMembers ? renderTeacherLeaveRequests(data.leaveRequests || [], classCode) : "";
  const studentLeaveSection = isStudent ? renderStudentLeaveClassSection(classCode, data.leaveRequest) : "";

  view.innerHTML = '<section class="school-page" data-school-class-current="' + esc(classCode) + '">' +
    '<div class="school-page-toolbar">' +
      '<button class="button secondary" type="button" data-school-back>← Danh sách lớp</button>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<button type="button" class="button secondary small" data-school-class-refresh="' + esc(classCode) + '">↻ Làm mới</button>' +
        '<span class="pill">' + classLabel(classCode) + '</span>' +
      '</div>' +
    '</div>' +
    '<header class="school-page-header"><div><p class="eyebrow">DANH SÁCH LỚP</p><h1>' + classLabel(classCode) + '</h1><p>' + students.length + ' học sinh · ' + teachers.length + ' giáo viên</p></div></header>' +
    addStudentBlock +
    '<section class="school-roster-section"><h2>Giáo viên phụ trách</h2><div class="school-roster-list">' + teacherCards + '</div></section>' +
    teacherLeaveRequests +
    '<section class="school-roster-section"><div class="school-section-heading"><h2>Thành viên lớp</h2><span class="pill">' + students.length + ' học sinh</span></div><div class="school-roster-list">' + studentCards + '</div></section>' +
    '<div id="school-student-progress-panel"></div>' +
    studentLeaveSection +
    '</section>';
}

async function renderStudentProgressPage(view, classCode, studentId) {
  view.innerHTML = '<section class="school-page"><div class="empty-state"><span class="spinner"></span><p>Đang tải tiến trình học tập…</p></div></section>';
  try {
    if (!classCode || !/^\d+$/.test(String(studentId || ""))) throw new Error("Liên kết tiến trình không hợp lệ.");
    const [progressData, classData] = await Promise.all([
      request("/api/school/classes/" + encodeURIComponent(classCode) + "/students/" + encodeURIComponent(studentId) + "/progress"),
      request("/api/school/classes/" + encodeURIComponent(classCode))
    ]);
    const student = (classData.students || []).find(item => Number(item.id) === Number(studentId));
    if (!student) throw new Error("Không tìm thấy học sinh trong lớp này.");
    const rows = progressData.progress || [];
    const completed = rows.filter(row => ["completed", "done", "finished"].includes(String(row.status || "").toLowerCase())).length;
    const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + (Number(row.progressPercent) || 0), 0) / rows.length) : 0;
    view.innerHTML = '<section class="school-page school-progress-page">' +
      '<div class="school-page-toolbar"><div><p class="eyebrow">MAI HỌC · HỒ SƠ HỌC TẬP</p><h1>Tiến trình học tập</h1></div><button class="button secondary" type="button" data-progress-close>← Quay lại lớp</button></div>' +
      '<section class="school-progress-student-summary"><div><span class="school-person-avatar">HS</span><div><h2>' + esc(student.name) + '</h2><p>' + esc(student.email || "") + ' · Lớp ' + esc(classCode) + '</p></div></div>' +
      '<div class="school-progress-summary-stats"><article><strong>' + rows.length + '</strong><span>Hoạt động ghi nhận</span></article><article><strong>' + completed + '</strong><span>Đã hoàn thành</span></article><article><strong>' + average + '%</strong><span>Tiến độ trung bình</span></article></div></section>' +
      '<section class="school-roster-section"><div class="school-section-heading"><h2>Chi tiết hoạt động học tập</h2><span class="pill">' + rows.length + ' bản ghi</span></div>' +
      (rows.length
        ? '<div class="school-progress-table school-progress-page-table"><table class="admin-table"><thead><tr><th>Nội dung</th><th>Môn học</th><th>Khối</th><th>Trạng thái</th><th>Tiến độ</th><th>Điểm</th><th>Cập nhật gần nhất</th></tr></thead><tbody>' +
          rows.map(row => '<tr><td><strong>' + esc(row.itemTitle || row.itemType || "Hoạt động") + '</strong></td><td>' + esc(row.subject || "—") + '</td><td>' + esc(row.grade || "—") + '</td><td>' + esc(row.status || "—") + '</td><td><div class="school-progress-value"><span>' + Math.max(0, Math.min(100, Number(row.progressPercent) || 0)) + '%</span><div><i style="width:' + Math.max(0, Math.min(100, Number(row.progressPercent) || 0)) + '%"></i></div></div></td><td>' + esc(row.score ?? "—") + '</td><td>' + esc(row.updatedAt || "—") + '</td></tr>').join("") +
          '</tbody></table></div>'
        : '<div class="empty-state"><h3>Chưa có dữ liệu tiến trình</h3><p>Hoạt động học tập của học sinh sẽ xuất hiện tại đây khi hệ thống ghi nhận dữ liệu.</p></div>') +
      '</section></section>';
  } catch (error) {
    view.innerHTML = '<section class="school-page"><div class="empty-state"><h3>Không thể tải tiến trình</h3><p>' + esc(error.message) + '</p><button class="button secondary" type="button" data-progress-close>Đóng tab</button></div></section>';
  }
}

export async function mountStudentProgressPage(view, classCode, studentId) {
  await renderStudentProgressPage(view, classCode, studentId);
}

function renderTeacherMessageForm() {
  return '<form id="school-teacher-message-form" class="school-inline-form"><h3>Thông báo đến Quản trị viên MAI HỌC</h3><label>Tiêu đề<input name="title" required maxlength="120" placeholder="Nhập tiêu đề thông báo"></label><label>Nội dung<textarea name="message" required maxlength="2000" rows="3" placeholder="Nội dung cần gửi đến Quản trị viên..."></textarea></label><button class="button secondary" type="submit">Gửi thông báo</button></form>';
}

async function renderAdminTools() {
  const results = await Promise.allSettled([
    request("/api/school/admin/class-change-requests"),
    request("/api/school/admin/teacher-messages")
  ]);
  const requestsData = results[0].status === "fulfilled" ? results[0].value : { requests: [] };
  const messagesData = results[1].status === "fulfilled" ? results[1].value : { messages: [] };
  const requests = (requestsData.requests || []).map(item =>
    '<article class="school-admin-request"><div><strong>' + esc(item.action === "add" ? "Thêm học sinh" : "Xóa học sinh") + " · " + classLabel(item.classCode) + '</strong><small>' + esc(item.studentName) + " (" + esc(item.studentEmail) + ") · Giáo viên: " + esc(item.teacherName) + '</small></div><div class="school-request-actions"><button class="button primary small" data-school-review-request="' + esc(item.id) + '" data-decision="approve">Duyệt</button><button class="button secondary small" data-school-review-request="' + esc(item.id) + '" data-decision="reject">Từ chối</button></div></article>'
  ).join("");
  const messages = (messagesData.messages || []).map(item =>
    '<article class="school-admin-request"><div><strong>' + esc(item.title) + '</strong><small>' + esc(item.teacherName) + " · " + esc(item.createdAt) + '<br>' + esc(item.message) + '</small></div><span class="role-chip">' + esc(item.status === "read" ? "Đã đọc" : "Mới") + '</span></article>'
  ).join("");
  const reqError = results[0].status === "rejected" ? '<p class="muted tiny">Không tải được yêu cầu: ' + esc(results[0].reason?.message || "Lỗi API") + '</p>' : "";
  const msgError = results[1].status === "rejected" ? '<p class="muted tiny">Không tải được thông báo: ' + esc(results[1].reason?.message || "Lỗi API") + '</p>' : "";
  return '<section class="school-admin-tools"><h2>Yêu cầu thay đổi thành viên chờ duyệt</h2><div class="school-admin-list">' + (requests || '<p class="muted">Không có yêu cầu đang chờ.</p>') + '</div>' + reqError + '<h2>Thông báo từ giáo viên</h2><div class="school-admin-list">' + (messages || '<p class="muted">Chưa có thông báo từ giáo viên.</p>') + '</div>' + msgError + '</section>';
}

export function wireSchoolEvents(onNavigate) {
  document.addEventListener("click", async event => {
    if (event.target.closest("[data-progress-close]")) {
      event.preventDefault();
      if (window.opener) window.close();
      else window.history.back();
      return;
    }

    if (event.target.closest("[data-school-refresh]")) {
      event.preventDefault();
      await mountSchoolPage(document.getElementById("view"), window.maihocCurrentUser || window.__maihocCurrentUser || {}, "");
      showSchoolToast("Đã làm mới dữ liệu lớp học.");
      return;
    }

    const leaveRequestBtn = event.target.closest("[data-school-request-leave]");
    if (leaveRequestBtn) {
      event.preventDefault();
      const classCode = leaveRequestBtn.dataset.schoolRequestLeave;
      if (!confirm(`Gửi yêu cầu rời Lớp ${classCode}? Bạn vẫn ở trong lớp cho đến khi giáo viên chủ nhiệm duyệt.`)) return;
      leaveRequestBtn.disabled = true;
      try {
        const result = await request("/api/school/classes/" + encodeURIComponent(classCode) + "/leave-requests", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
        });
        showSchoolToast(result.message || "Đã gửi yêu cầu rời lớp.", "success");
        await mountSchoolPage(document.getElementById("view"), window.maihocCurrentUser || window.__maihocCurrentUser || {}, classCode);
      } catch (error) {
        showSchoolToast(error.message || "Không gửi được yêu cầu rời lớp.", "error");
        leaveRequestBtn.disabled = false;
      }
      return;
    }

    const reviewLeaveBtn = event.target.closest("[data-school-review-leave-request]");
    if (reviewLeaveBtn) {
      event.preventDefault();
      const decision = reviewLeaveBtn.dataset.decision;
      const classCode = reviewLeaveBtn.dataset.schoolClass;
      if (decision === "approve" && !confirm("Duyệt yêu cầu sẽ xóa học sinh khỏi danh sách lớp. Lịch sử tham gia vẫn được giữ và học sinh không thể tự tham gia lớp khác. Tiếp tục?")) return;
      reviewLeaveBtn.disabled = true;
      try {
        await request("/api/school/classes/" + encodeURIComponent(classCode) + "/leave-requests/" + encodeURIComponent(reviewLeaveBtn.dataset.schoolReviewLeaveRequest) + "/review", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision })
        });
        showSchoolToast(decision === "approve" ? "Đã duyệt học sinh rời lớp." : "Đã từ chối yêu cầu rời lớp.", "success");
        await mountSchoolPage(document.getElementById("view"), window.maihocCurrentUser || window.__maihocCurrentUser || {}, classCode);
      } catch (error) {
        showSchoolToast(error.message || "Không xử lý được yêu cầu rời lớp.", "error");
        reviewLeaveBtn.disabled = false;
      }
      return;
    }

    const classRefreshBtn = event.target.closest("[data-school-class-refresh]");
    if (classRefreshBtn) {
      event.preventDefault();
      await mountSchoolPage(
        document.getElementById("view"),
        window.maihocCurrentUser || window.__maihocCurrentUser || {},
        classRefreshBtn.dataset.schoolClassRefresh
      );
      showSchoolToast("Đã làm mới danh sách lớp.");
      return;
    }

    const removeStudentBtn = event.target.closest("[data-homeroom-remove-student]");
    if (removeStudentBtn) {
      event.preventDefault();
      const studentId = removeStudentBtn.dataset.homeroomRemoveStudent;
      const classCode = removeStudentBtn.dataset.schoolClass;
      const studentName = removeStudentBtn.dataset.studentName || "học sinh này";
      if (!confirm(`Xóa ${studentName} khỏi danh sách Lớp ${classCode}?`)) return;
      removeStudentBtn.disabled = true;
      try {
        await request(`/api/school/classes/${encodeURIComponent(classCode)}/students/${encodeURIComponent(studentId)}`, {
          method: "DELETE"
        });
        showSchoolToast(`Đã xóa ${studentName} khỏi Lớp ${classCode}.`);
        const currentView = document.getElementById("view");
        const inSingleClassView = Boolean(document.querySelector(".school-page .school-page-toolbar [data-school-back]"));
        await mountSchoolPage(
          currentView,
          window.maihocCurrentUser || window.__maihocCurrentUser || {},
          inSingleClassView ? classCode : ""
        );
      } catch (error) {
        showSchoolToast(error.message || "Không thể xóa học sinh khỏi lớp.", "error");
        removeStudentBtn.disabled = false;
      }
      return;
    }

    const classButton = event.target.closest("[data-school-class]");
    if (classButton && !classButton.hasAttribute("data-school-progress") && !classButton.hasAttribute("data-homeroom-remove-student")) {
      onNavigate("school-class", { classCode: classButton.dataset.schoolClass });
      return;
    }
    if (event.target.closest("[data-school-back]")) {
      onNavigate("school");
      return;
    }
    const progressLink = event.target.closest("[data-school-progress]");
    if (progressLink) {
      event.preventDefault();
      const progressUrl = new URL(window.location.href);
      progressUrl.searchParams.set("maihoc-view", "student-progress");
      progressUrl.searchParams.set("classCode", progressLink.dataset.schoolClass);
      progressUrl.searchParams.set("studentId", progressLink.dataset.schoolProgress);
      // Open synchronously inside the click gesture to avoid popup blocking.
      const opened = window.open(progressUrl.toString(), "_blank", "noopener");
      if (!opened) showSchoolToast("Trình duyệt đã chặn tab mới. Hãy cho phép cửa sổ bật lên của MAI HỌC.", "error");
      return;
    }
    const review = event.target.closest("[data-school-review-request]");
    if (review) {
      review.disabled = true;
      try {
        await request("/api/school/admin/class-change-requests/" + encodeURIComponent(review.dataset.schoolReviewRequest) + "/review", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: review.dataset.decision })
        });
        await mountSchoolPage(document.getElementById("view"), window.maihocCurrentUser || window.__maihocCurrentUser || {}, "");
      } catch (error) {
        showSchoolToast(error.message, "error");
        review.disabled = false;
      }
    }
  });

  document.addEventListener("submit", async event => {
    // Giáo viên chủ nhiệm thêm học sinh vào lớp bằng email (Ảnh 1)
    if (event.target.id === "homeroom-add-student-form") {
      event.preventDefault();
      const form = event.target;
      const classCode = form.dataset.homeroomClass || "";
      if (!classCode) return;
      const submitBtn = form.querySelector('button[type="submit"]');
      const statusNode = form.querySelector("[data-homeroom-add-status]");
      const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
      if (!email) return;
      if (submitBtn) submitBtn.disabled = true;
      if (statusNode) {
        statusNode.hidden = true;
        statusNode.classList.remove("auth-error");
      }
      try {
        const res = await request("/api/school/classes/" + encodeURIComponent(classCode) + "/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        form.reset();
        showSchoolToast(res.message || `Đã thêm học sinh vào Lớp ${classCode}.`, "success");
        const inSingleClassView = Boolean(document.querySelector(".school-page .school-page-toolbar [data-school-back]"));
        await mountSchoolPage(
          document.getElementById("view"),
          window.maihocCurrentUser || window.__maihocCurrentUser || {},
          inSingleClassView ? classCode : ""
        );
      } catch (error) {
        if (statusNode) {
          statusNode.textContent = error.message || "Không thể thêm học sinh.";
          statusNode.classList.add("auth-error");
          statusNode.hidden = false;
        }
        showSchoolToast(error.message || "Không thể thêm học sinh.", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
      return;
    }

    // Học sinh tham gia lớp từ hộp thoại "Tham gia lớp" (Ảnh 2) hoặc biểu mẫu trực tiếp
    if (event.target.id === "join-class-form" || event.target.id === "student-join-class-inline-form") {
      event.preventDefault();
      const form = event.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      const errNode = document.getElementById("join-class-error");
      const classCode = String(new FormData(form).get("classCode") || "").trim().toUpperCase();
      if (!classCode) {
        if (errNode && form.id === "join-class-form") {
          errNode.textContent = "Vui lòng chọn lớp học để tham gia.";
          errNode.hidden = false;
        } else {
          showSchoolToast("Vui lòng chọn lớp học để tham gia.", "error");
        }
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      if (errNode) errNode.hidden = true;
      try {
        const res = await request("/api/school/join-class", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classCode })
        });
        if (res.user) {
          window.maihocCurrentUser = res.user;
          window.__maihocCurrentUser = res.user;
          window.dispatchEvent(new CustomEvent("maihoc-user-updated", { detail: { user: res.user } }));
        }
        const dialog = document.getElementById("join-class-dialog");
        if (dialog?.open) dialog.close();
        showSchoolToast(res.message || `Đã tham gia Lớp ${classCode} thành công!`, "success");
        onNavigate("school");
      } catch (error) {
        if (errNode && form.id === "join-class-form") {
          errNode.textContent = error.message || "Không thể tham gia lớp học.";
          errNode.hidden = false;
        } else {
          showSchoolToast(error.message || "Không thể tham gia lớp học.", "error");
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
      return;
    }

    if (event.target.id === "school-teacher-message-form") {
      event.preventDefault();
      const form = event.target;
      const body = Object.fromEntries(new FormData(form).entries());
      try {
        await request("/api/school/teacher-messages", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        form.reset();
        showSchoolToast("Đã gửi thông báo đến Quản trị viên MAI HỌC.", "success");
      } catch (error) {
        showSchoolToast(error.message, "error");
      }
    }
  });
}
