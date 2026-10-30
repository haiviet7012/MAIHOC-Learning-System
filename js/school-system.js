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
    const teacherNotice = user?.role === "teacher" ? renderTeacherMessageForm() : "";
    view.innerHTML = '<section class="school-page"><header class="school-page-header"><div><p class="eyebrow">MAI HỌC · CỘNG ĐỒNG TRƯỜNG</p><h1>Lớp của bạn</h1><p>Chọn một lớp để xem giáo viên và danh sách thành viên.</p></div></header>' +
      (cards ? '<div class="school-class-grid">' + cards + '</div>' : '<div class="empty-state"><h3>Chưa có lớp được phân công</h3><p>Bạn chưa tham gia lớp nào. Chọn “Tham gia lớp” để gửi yêu cầu đến giáo viên chủ nhiệm.</p></div>') +
      (user?.role === "student" && user.accountType === "school" ? await renderStudentJoinClasses() : "") +
      studentJoin + teacherNotice + adminTools + '</section>';
  } catch (error) {
    view.innerHTML = '<div class="empty-state"><h3>Không thể mở Lớp của bạn</h3><p>' + esc(error.message) + '</p></div>';
  }
}

async function renderStudentJoinClasses() {
  const data = await request("/api/school/available-classes");
  const choices = (data.classes || []).filter(item => !item.joined && !item.pending && item.homeroomTeacher);
  const options = choices.map(item => '<option value="' + esc(item.classCode) + '">' + esc(item.classCode) + ' · GVCN: ' + esc(item.homeroomTeacher) + ' · ' + Number(item.studentCount || 0) + ' học sinh</option>').join("");
  const pending = (data.classes || []).filter(item => item.pending).map(item => esc(item.classCode)).join(", ");
  return '<section class="school-inline-form"><h3>Tham gia lớp</h3><p class="muted">Chọn lớp phù hợp. Giáo viên chủ nhiệm sẽ duyệt yêu cầu trước khi bạn được xem danh sách lớp.</p><form id="school-join-class-form"><label>Lớp muốn tham gia<select name="classCode" required><option value="">Chọn lớp</option>' + options + '</select></label><button class="button primary" type="submit" ' + (!choices.length ? 'disabled' : '') + '>Tham gia lớp</button></form>' + (pending ? '<p class="muted tiny">Đang chờ xác nhận: ' + pending + '</p>' : '') + '</section>';
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
  const isTeacher = user?.role === "teacher";
  const canViewProgress = Boolean(data.canViewProgress) || (user?.role === "admin" && Number(user.adminLevel) >= 2);
  const studentCards = students.map(student => '<article class="school-person-card"><span class="school-person-avatar">HS</span>' +
    '<span class="school-person-info"><strong>' + esc(student.name) + '</strong><small>' + esc(student.email) + '</small></span>' +
    (canViewProgress ? '<a href="#" class="school-progress-link" data-school-progress="' + Number(student.id) + '" data-school-class="' + esc(classCode) + '">Tiến trình học tập ↗</a>' : '') +
    (data.canManageMembers ? '<button type="button" class="button secondary small" data-remove-school-student="' + Number(student.id) + '" data-class-code="' + esc(classCode) + '">Xóa khỏi lớp</button>' : '') + '</article>').join("");
  const pendingCards = (data.pendingJoinRequests || []).map(item =>
    '<article class="school-person-card"><span class="school-person-avatar">HS</span><span class="school-person-info"><strong>' + esc(item.studentName) + '</strong><small>' + esc(item.studentEmail) + ' · Xin tham gia lớp</small></span><button type="button" class="button primary small" data-review-join-request="' + esc(item.id) + '" data-class-code="' + esc(classCode) + '" data-decision="approve">Duyệt</button><button type="button" class="button secondary small" data-review-join-request="' + esc(item.id) + '" data-class-code="' + esc(classCode) + '" data-decision="reject">Từ chối</button></article>'
  ).join("");
  const membersForm = data.canManageMembers
    ? '<form id="school-add-student-form" class="school-inline-form" data-class-code="' + esc(classCode) + '"><h3>Thêm học sinh</h3><label>Email tài khoản học sinh<input name="email" type="email" required maxlength="254" placeholder="hocsinh@example.com"></label><button class="button primary" type="submit">＋ Thêm học sinh</button></form>'
    : "";
  view.innerHTML = '<section class="school-page"><div class="school-page-toolbar"><button class="button secondary" type="button" data-school-back>← Danh sách lớp</button><span class="pill">' + classLabel(classCode) + '</span></div>' +
    '<header class="school-page-header"><div><p class="eyebrow">DANH SÁCH LỚP</p><h1>' + classLabel(classCode) + '</h1><p>' + students.length + ' học sinh · ' + teachers.length + ' giáo viên</p></div></header>' +
    '<section class="school-roster-section"><h2>Giáo viên phụ trách</h2><div class="school-roster-list">' + (teacherCards || '<p class="muted">Chưa có giáo viên được phân công.</p>') + '</div></section>' +
    '<section class="school-roster-section"><div class="school-section-heading"><h2>Thành viên lớp</h2><span class="pill">' + students.length + ' học sinh</span></div><div class="school-roster-list">' + (studentCards || '<p class="muted">Lớp chưa có học sinh.</p>') + '</div></section>' +
    (data.canManageMembers ? '<section class="school-roster-section"><h2>Yêu cầu tham gia lớp</h2><div class="school-roster-list">' + (pendingCards || '<p class="muted">Không có yêu cầu đang chờ.</p>') + '</div></section>' : '') +
    '<div id="school-student-progress-panel"></div>' + membersForm + '</section>';
}

function renderTeacherMessageForm() {
  return '<form id="school-teacher-message-form" class="school-inline-form"><h3>Thông báo đến Admin cao nhất</h3><label>Tiêu đề<input name="title" required maxlength="120"></label><label>Nội dung<textarea name="message" required maxlength="2000" rows="3"></textarea></label><button class="button secondary" type="submit">Gửi thông báo</button></form>';
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
    const removeStudent = event.target.closest("[data-remove-school-student]");
    if (removeStudent) {
      const id = removeStudent.dataset.removeSchoolStudent;
      const code = removeStudent.dataset.classCode;
      if (!confirm("Xóa học sinh này khỏi lớp?")) return;
      removeStudent.disabled = true;
      try {
        await request("/api/school/classes/" + encodeURIComponent(code) + "/students/" + encodeURIComponent(id), { method: "DELETE" });
        await mountSchoolPage(document.getElementById("view"), window.__maihocCurrentUser || {}, code);
      } catch (error) { alert(error.message); removeStudent.disabled = false; }
      return;
    }
    const reviewJoin = event.target.closest("[data-review-join-request]");
    if (reviewJoin) {
      reviewJoin.disabled = true;
      try {
        await request("/api/school/classes/" + encodeURIComponent(reviewJoin.dataset.classCode) + "/join-requests/" + encodeURIComponent(reviewJoin.dataset.reviewJoinRequest) + "/review", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: reviewJoin.dataset.decision })
        });
        await mountSchoolPage(document.getElementById("view"), window.__maihocCurrentUser || {}, reviewJoin.dataset.classCode);
      } catch (error) { alert(error.message); reviewJoin.disabled = false; }
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
    if (event.target.id === "school-add-student-form") {
      event.preventDefault();
      const form = event.target;
      const classCode = form.dataset.classCode;
      const email = String(new FormData(form).get("email") || "").trim();
      try {
        await request("/api/school/classes/" + encodeURIComponent(classCode) + "/students", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
        });
        await mountSchoolPage(document.getElementById("view"), window.__maihocCurrentUser || {}, classCode);
      } catch (error) { alert(error.message); }
      return;
    }
    if (event.target.id === "school-join-class-form") {
      event.preventDefault();
      const form = event.target;
      const classCode = String(new FormData(form).get("classCode") || "");
      if (!classCode) return;
      try {
        const result = await request("/api/school/classes/" + encodeURIComponent(classCode) + "/join-requests", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
        });
        alert(result.message || "Đã gửi yêu cầu tham gia lớp.");
        await mountSchoolPage(document.getElementById("view"), window.__maihocCurrentUser || {}, "");
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
