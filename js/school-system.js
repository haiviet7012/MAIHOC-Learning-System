const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không thể tải dữ liệu lớp học.");
  return data;
};
const classLabel = code => "Lớp " + esc(code);

export async function mountSchoolPage(view, user, classCode = "") {
  view.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Đang tải dữ liệu lớp học…</p></div>';
  try {
    if (classCode) {
      await renderClass(view, user, String(classCode).toUpperCase());
      return;
    }
    const data = await request("/api/school/classes");
    const classes = data.classes || [];
    const cards = classes.map(item => {
      const role = item.isHomeroom ? "Giáo viên chủ nhiệm" : item.role === "student" ? "Lớp của bạn" : item.role === "admin" ? "Toàn quyền xem" : "Giáo viên bộ môn";
      return '<button type="button" class="school-class-card" data-school-class="' + esc(item.classCode) + '">' +
        '<span class="school-class-card-main"><strong>' + classLabel(item.classCode) + '</strong><small>' + esc(role) + '</small></span>' +
        '<span class="school-class-card-meta"><strong>' + Number(item.studentCount || 0) + '</strong><small>học sinh</small></span>' +
        '<span class="school-class-card-arrow">›</span></button>';
    }).join("");
    const adminTools = data.allClasses ? await renderAdminTools() : "";
    const teacherNotice = user?.role === "admin" && Number(user.adminLevel) < 2 ? renderTeacherMessageForm() : "";
    view.innerHTML = '<section class="school-page"><header class="school-page-header"><div><p class="eyebrow">MAI HỌC · CỘNG ĐỒNG TRƯỜNG</p><h1>Lớp của bạn</h1><p>Chọn một lớp để xem giáo viên và danh sách thành viên.</p></div></header>' +
      (cards ? '<div class="school-class-grid">' + cards + '</div>' : '<div class="empty-state"><h3>Chưa có lớp được phân công</h3><p>Liên hệ Admin cao nhất để cập nhật lớp học của tài khoản.</p></div>') +
      teacherNotice + adminTools + '</section>';
  } catch (error) {
    view.innerHTML = '<div class="empty-state"><h3>Không thể mở Lớp của bạn</h3><p>' + esc(error.message) + '</p></div>';
  }
}

async function renderClass(view, user, classCode) {
  const data = await request("/api/school/classes/" + encodeURIComponent(classCode));
  const teachers = data.teachers || [];
  const students = data.students || [];
  const teacherCards = teachers.map(teacher => {
    const label = teacher.isHomeroom ? "Giáo viên chủ nhiệm" : "Giáo viên bộ môn";
    const subjects = (teacher.subjects || []).join(", ");
    return '<article class="school-person-card school-teacher-card ' + (teacher.isHomeroom ? "is-homeroom" : "") + '">' +
      '<span class="school-person-avatar">GV</span><span class="school-person-info"><strong>' + esc(teacher.name) + '</strong><small>' + label + (subjects ? " · " + esc(subjects) : "") + '</small></span>' +
      (teacher.isHomeroom ? '<span class="school-homeroom-tag">Chủ nhiệm</span>' : '') + '</article>';
  }).join("");
  const isTeacher = user?.role === "admin" && Number(user.adminLevel) < 2;
  const canViewProgress = isTeacher || (user?.role === "admin" && Number(user.adminLevel) >= 2);
  const studentCards = students.map(student => '<article class="school-person-card"><span class="school-person-avatar">HS</span>' +
    '<span class="school-person-info"><strong>' + esc(student.name) + '</strong><small>Học sinh</small></span>' +
    (canViewProgress
      ? '<a href="#" class="school-progress-link" data-school-progress="' + Number(student.id) + '" data-school-class="' + esc(classCode) + '">Tiến trình học tập ↗</a>'
      : '') + '</article>').join("");
  const membersForm = data.canManageMembers
    ? '<form id="school-member-request-form" class="school-inline-form"><h3>Đề nghị thay đổi thành viên</h3><label>Email tài khoản học sinh<input name="email" type="email" required placeholder="hoc sinh@example.com"></label><label>Thao tác<select name="action"><option value="add">Đề nghị thêm vào lớp</option><option value="remove">Đề nghị xóa khỏi lớp</option></select></label><label>Ghi chú (không bắt buộc)<input name="note" maxlength="500"></label><button class="button primary" type="submit">Gửi Admin cao nhất duyệt</button></form>'
    : "";
  view.innerHTML = '<section class="school-page"><div class="school-page-toolbar"><button class="button secondary" type="button" data-school-back>← Danh sách lớp</button><span class="pill">' + classLabel(classCode) + '</span></div>' +
    '<header class="school-page-header"><div><p class="eyebrow">DANH SÁCH LỚP</p><h1>' + classLabel(classCode) + '</h1><p>' + students.length + ' học sinh · ' + teachers.length + ' giáo viên</p></div></header>' +
    '<section class="school-roster-section"><h2>Giáo viên phụ trách</h2><div class="school-roster-list">' + (teacherCards || '<p class="muted">Chưa có giáo viên được phân công.</p>') + '</div></section>' +
    '<section class="school-roster-section"><div class="school-section-heading"><h2>Thành viên lớp</h2><span class="pill">' + students.length + ' học sinh</span></div><div class="school-roster-list">' + (studentCards || '<p class="muted">Lớp chưa có học sinh.</p>') + '</div></section>' +
    '<div id="school-student-progress-panel"></div>' + membersForm + '</section>';
}

function renderTeacherMessageForm() {
  return '<form id="school-teacher-message-form" class="school-inline-form"><h3>Thông báo đến Admin cao nhất</h3><label>Tiêu đề<input name="title" required maxlength="120"></label><label>Nội dung<textarea name="message" required maxlength="2000" rows="3"></textarea></label><button class="button secondary" type="submit">Gửi thông báo</button></form>';
}

async function renderAdminTools() {
  try {
    const [requestsData, messagesData] = await Promise.all([
      request("/api/school/admin/class-change-requests"),
      request("/api/school/admin/teacher-messages")
    ]);
    const requests = (requestsData.requests || []).map(item =>
      '<article class="school-admin-request"><div><strong>' + esc(item.action === "add" ? "Thêm học sinh" : "Xóa học sinh") + ' · ' + classLabel(item.classCode) + '</strong><small>' + esc(item.studentName) + ' (' + esc(item.studentEmail) + ') · Giáo viên: ' + esc(item.teacherName) + '</small></div><div class="school-request-actions"><button class="button primary small" data-school-review-request="' + esc(item.id) + '" data-decision="approve">Duyệt</button><button class="button secondary small" data-school-review-request="' + esc(item.id) + '" data-decision="reject">Từ chối</button></div></article>'
    ).join("");
    const messages = (messagesData.messages || []).map(item =>
      '<article class="school-admin-request"><div><strong>' + esc(item.title) + '</strong><small>' + esc(item.teacherName) + ' · ' + esc(item.createdAt) + '<br>' + esc(item.message) + '</small></div><span class="role-chip">' + esc(item.status === "read" ? "Đã đọc" : "Mới") + '</span></article>'
    ).join("");
    return '<section class="school-admin-tools"><h2>Yêu cầu thay đổi thành viên chờ duyệt</h2><div class="school-admin-list">' + (requests || '<p class="muted">Không có yêu cầu đang chờ.</p>') + '</div><h2>Thông báo từ giáo viên</h2><div class="school-admin-list">' + (messages || '<p class="muted">Chưa có thông báo từ giáo viên.</p>') + '</div></section>';
  } catch (error) {
    return '<p class="auth-error">Không tải được công cụ quản trị lớp: ' + esc(error.message) + '</p>';
  }
}

export function wireSchoolEvents(onNavigate) {
  document.addEventListener("click", async event => {
    const classButton = event.target.closest("[data-school-class]");
    if (classButton) {
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
        await mountSchoolPage(document.getElementById("view"), window.__maihocCurrentUser || {}, "");
      } catch (error) {
        alert(error.message);
        review.disabled = false;
      }
    }
  });

  document.addEventListener("submit", async event => {
    if (event.target.id === "school-member-request-form") {
      event.preventDefault();
      const form = event.target;
      const classCode = document.querySelector("[data-school-class-current]")?.dataset.schoolClassCurrent;
      const page = document.querySelector(".school-page .school-page-toolbar .pill");
      const code = page?.textContent.replace(/^Lớp\s*/i, "").trim();
      if (!code) return;
      const body = Object.fromEntries(new FormData(form).entries());
      try {
        await request("/api/school/classes/" + encodeURIComponent(code) + "/change-requests", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        form.reset();
        alert("Đã gửi yêu cầu đến Admin cao nhất.");
      } catch (error) { alert(error.message); }
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
        alert("Đã gửi thông báo đến Admin cao nhất.");
      } catch (error) { alert(error.message); }
    }
  });
}
