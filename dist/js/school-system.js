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
      '<button type="button" class="button primary" data-toggle-homeroom-add-form="' + esc(classCode) + '">＋ Thêm học sinh</button>' +
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

function renderStudentJoinClassInline(availableClasses = [], currentClassCode = "") {
  const list = availableClasses.length
    ? availableClasses
    : DEFAULT_SCHOOL_CLASSES.map(code => ({ classCode: code, studentCount: 0, homeroomTeacher: null }));
  const options = list.map(item => {
    const gvcn = item.homeroomTeacher ? ` — GVCN: ${item.homeroomTeacher}` : "";
    const count = ` (${Number(item.studentCount || 0)} học sinh)`;
    const selected = String(item.classCode).toUpperCase() === String(currentClassCode || "").toUpperCase() ? " selected" : "";
    return `<option value="${esc(item.classCode)}"${selected}>Lớp ${esc(item.classCode)}${esc(gvcn)}${esc(count)}</option>`;
  }).join("");

  return '<form id="student-join-class-inline-form" class="school-inline-form">' +
    '<h3>' + (currentClassCode ? 'Đổi lớp / Tham gia lớp học khác' : 'Tham gia lớp học của bạn') + '</h3>' +
    '<p class="muted tiny">Chọn đúng lớp của giáo viên chủ nhiệm để tham gia vào lớp và nhận bài kiểm tra, tài liệu của lớp.</p>' +
    '<div class="homeroom-add-input-row">' +
      '<label style="flex:1;margin:0">Chọn lớp học' +
        '<select name="classCode" required><option value="">-- Chọn lớp của bạn (10A1 – 12C9) --</option>' + options + '</select>' +
      '</label>' +
      '<button class="button primary" type="submit">🏫 Tham gia lớp</button>' +
    '</div>' +
  '</form>';
}

export async function openJoinClassDialog(user = window.maihocCurrentUser) {
  const dialog = document.getElementById("join-class-dialog");
  if (!dialog) return;
  const select = dialog.querySelector('select[name="classCode"]');
  const currentInfo = dialog.querySelector("[data-join-class-current]");
  const errNode = dialog.querySelector("#join-class-error");
  if (errNode) {
    errNode.hidden = true;
    errNode.textContent = "";
  }
  if (currentInfo) {
    if (user?.classCode) {
      currentInfo.hidden = false;
      currentInfo.innerHTML = `Lớp hiện tại của bạn: <strong>Lớp ${esc(user.classCode)}</strong>`;
    } else {
      currentInfo.hidden = false;
      currentInfo.textContent = "Bạn chưa tham gia lớp học nào. Hãy chọn lớp bên dưới để vào lớp.";
    }
  }
  if (select) {
    select.innerHTML = '<option value="">Đang tải danh sách lớp…</option>';
  }
  if (!dialog.open) dialog.showModal();

  try {
    const data = await request("/api/school/classes");
    const list = Array.isArray(data.availableClasses) && data.availableClasses.length
      ? data.availableClasses
      : DEFAULT_SCHOOL_CLASSES.map(code => ({ classCode: code, studentCount: 0, homeroomTeacher: null }));
    const activeClass = data.currentClassCode || user?.classCode || "";
    if (currentInfo && activeClass) {
      const found = list.find(c => c.classCode === activeClass);
      const gv = found?.homeroomTeacher ? ` · GVCN: ${esc(found.homeroomTeacher)}` : "";
      currentInfo.innerHTML = `Lớp hiện tại của bạn: <strong>Lớp ${esc(activeClass)}</strong>${gv}`;
    }
    if (select) {
      select.innerHTML = '<option value="">-- Chọn lớp học (10A1 – 12C9) --</option>' +
        list.map(item => {
          const gvcn = item.homeroomTeacher ? ` — GVCN: ${item.homeroomTeacher}` : "";
          const count = ` (${Number(item.studentCount || 0)} học sinh)`;
          const selected = item.classCode === activeClass ? " selected" : "";
          return `<option value="${esc(item.classCode)}"${selected}>Lớp ${esc(item.classCode)}${esc(gvcn)}${esc(count)}</option>`;
        }).join("");
    }
  } catch {
    if (select) {
      select.innerHTML = '<option value="">-- Chọn lớp học (10A1 – 12C9) --</option>' +
        DEFAULT_SCHOOL_CLASSES.map(code => `<option value="${esc(code)}">Lớp ${esc(code)}</option>`).join("");
    }
  }
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

    // Phần dành riêng cho Giáo viên chủ nhiệm ngay trên tab "Lớp của bạn" (Ảnh 1)
    let homeroomRosterBlock = "";
    if (data.homeroomDetail && data.homeroomDetail.classCode) {
      const hd = data.homeroomDetail;
      const hCode = hd.classCode;
      const hStudents = hd.students || [];
      const hTeachers = hd.teachers || [];
      homeroomRosterBlock =
        renderHomeroomAddStudentSection(hCode) +
        '<section class="school-roster-section school-homeroom-live-roster" data-school-class-current="' + esc(hCode) + '">' +
          '<div class="school-section-heading">' +
            '<div>' +
              '<h2>Danh sách học sinh ' + classLabel(hCode) + ' (Lớp chủ nhiệm)</h2>' +
              '<p class="muted tiny">Hiển thị tất cả học sinh bạn đã thêm bằng email hoặc học sinh đăng nhập và tham gia vào ' + classLabel(hCode) + '.</p>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<span class="pill">' + hStudents.length + ' học sinh</span>' +
              '<button type="button" class="button secondary small" data-school-refresh>↻ Làm mới</button>' +
            '</div>' +
          '</div>' +
          '<div class="school-roster-list">' +
            renderStudentCards(hStudents, hCode, { canViewProgress: true, canRemoveStudent: true }) +
          '</div>' +
          '<div id="school-student-progress-panel"></div>' +
        '</section>' +
        '<section class="school-roster-section">' +
          '<h2>Giáo viên phụ trách ' + classLabel(hCode) + '</h2>' +
          '<div class="school-roster-list">' + renderTeacherCards(hTeachers) + '</div>' +
        '</section>';
    }

    // Phần hiển thị cho Học sinh khi mở "Lớp của bạn"
    let studentClassBlock = "";
    if (isStudent) {
      if (data.studentClassDetail && data.studentClassDetail.classCode) {
        const sd = data.studentClassDetail;
        const sCode = sd.classCode;
        studentClassBlock =
          '<section class="school-roster-section">' +
            '<div class="school-section-heading">' +
              '<h2>Giáo viên phụ trách ' + classLabel(sCode) + '</h2>' +
              '<button type="button" class="button secondary small" data-open-join-class>🏫 Đổi lớp khác</button>' +
            '</div>' +
            '<div class="school-roster-list">' + renderTeacherCards(sd.teachers || []) + '</div>' +
          '</section>' +
          '<section class="school-roster-section">' +
            '<div class="school-section-heading"><h2>Thành viên ' + classLabel(sCode) + '</h2><span class="pill">' + (sd.students || []).length + ' học sinh</span></div>' +
            '<div class="school-roster-list">' + renderStudentCards(sd.students || [], sCode, { canViewProgress: false, canRemoveStudent: false }) + '</div>' +
          '</section>';
      } else {
        studentClassBlock = renderStudentJoinClassInline(availableClasses, "");
      }
    }

    const adminTools = data.allClasses ? await renderAdminTools() : "";
    const teacherNotice = isTeacher ? renderTeacherMessageForm() : "";

    const emptyClassesHtml = isStudent
      ? '<div class="empty-state"><h3>Bạn chưa tham gia lớp học nào</h3><p>Hãy chọn lớp của giáo viên chủ nhiệm bên dưới (hoặc nhấn nút “🏫 Tham gia lớp” trên thanh công cụ) để vào lớp.</p><button type="button" class="button primary" data-open-join-class>🏫 Tham gia lớp ngay</button></div>'
      : '<div class="empty-state"><h3>Chưa có lớp được phân công</h3><p>Liên hệ Quản trị viên MAI HỌC để cập nhật lớp phụ trách của tài khoản.</p></div>';

    const headerActions = isStudent
      ? '<button type="button" class="button primary" data-open-join-class>🏫 Tham gia lớp</button>'
      : data.homeroomDetail?.classCode
        ? '<button type="button" class="button primary" data-toggle-homeroom-add-form="' + esc(data.homeroomDetail.classCode) + '">＋ Thêm học sinh</button>'
        : '';

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

async function renderClass(view, user, classCode) {
  const data = await request("/api/school/classes/" + encodeURIComponent(classCode));
  const teachers = data.teachers || [];
  const students = data.students || [];
  const isSuper = isUserSuperAdmin(user);
  const isTeacher = isUserTeacher(user);
  const canViewProgress = isTeacher || isSuper;
  const canManageMembers = Boolean(data.canManageMembers);

  const teacherCards = renderTeacherCards(teachers);
  const studentCards = renderStudentCards(students, classCode, {
    canViewProgress,
    canRemoveStudent: canManageMembers
  });

  const addStudentBlock = canManageMembers ? renderHomeroomAddStudentSection(classCode) : "";

  view.innerHTML = '<section class="school-page" data-school-class-current="' + esc(classCode) + '">' +
    '<div class="school-page-toolbar">' +
      '<button class="button secondary" type="button" data-school-back>← Danh sách lớp</button>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        (canManageMembers ? '<button type="button" class="button primary small" data-toggle-homeroom-add-form="' + esc(classCode) + '">＋ Thêm học sinh</button>' : '') +
        '<button type="button" class="button secondary small" data-school-class-refresh="' + esc(classCode) + '">↻ Làm mới</button>' +
        '<span class="pill">' + classLabel(classCode) + '</span>' +
      '</div>' +
    '</div>' +
    '<header class="school-page-header"><div><p class="eyebrow">DANH SÁCH LỚP</p><h1>' + classLabel(classCode) + '</h1><p>' + students.length + ' học sinh · ' + teachers.length + ' giáo viên</p></div></header>' +
    addStudentBlock +
    '<section class="school-roster-section"><h2>Giáo viên phụ trách</h2><div class="school-roster-list">' + teacherCards + '</div></section>' +
    '<section class="school-roster-section"><div class="school-section-heading"><h2>Thành viên lớp</h2><span class="pill">' + students.length + ' học sinh</span></div><div class="school-roster-list">' + studentCards + '</div></section>' +
    '<div id="school-student-progress-panel"></div>' +
    '</section>';
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
    const openJoinBtn = event.target.closest("[data-open-join-class]");
    if (openJoinBtn) {
      event.preventDefault();
      await openJoinClassDialog(window.maihocCurrentUser || window.__maihocCurrentUser);
      return;
    }

    const toggleAddBtn = event.target.closest("[data-toggle-homeroom-add-form]");
    if (toggleAddBtn) {
      event.preventDefault();
      const form = document.getElementById("homeroom-add-student-form");
      if (form) {
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        const emailInput = form.querySelector('input[name="email"]');
        emailInput?.focus();
      }
      return;
    }

    if (event.target.closest("[data-school-refresh]")) {
      event.preventDefault();
      await mountSchoolPage(document.getElementById("view"), window.maihocCurrentUser || window.__maihocCurrentUser || {}, "");
      showSchoolToast("Đã làm mới dữ liệu lớp học.");
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
      const panel = document.getElementById("school-student-progress-panel");
      if (!panel) return;
      panel.innerHTML = '<p class="muted">Đang tải tiến trình…</p>';
      try {
        const data = await request("/api/school/classes/" + encodeURIComponent(progressLink.dataset.schoolClass) + "/students/" + encodeURIComponent(progressLink.dataset.schoolProgress) + "/progress");
        const rows = data.progress || [];
        panel.innerHTML = '<section class="school-progress-panel"><h3>Tiến trình học tập</h3>' + (rows.length
          ? '<div class="school-progress-table"><table class="admin-table"><thead><tr><th>Nội dung</th><th>Môn</th><th>Trạng thái</th><th>Tiến trình</th><th>Điểm</th><th>Cập nhật</th></tr></thead><tbody>' +
            rows.map(row => '<tr><td>' + esc(row.itemTitle || row.itemType) + '</td><td>' + esc(row.subject) + ' · ' + esc(row.grade) + '</td><td>' + esc(row.status) + '</td><td>' + Number(row.progressPercent || 0) + '%</td><td>' + esc(row.score ?? "—") + '</td><td>' + esc(row.updatedAt) + '</td></tr>').join("") +
            '</tbody></table></div>' : '<p class="muted">Học sinh chưa có dữ liệu tiến trình.</p>') + '</section>';
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        panel.innerHTML = '<p class="auth-error">' + esc(error.message) + '</p>';
      }
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
