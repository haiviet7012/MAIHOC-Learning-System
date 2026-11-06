import { mountQuestionBank } from './question-bank.js';
import { mountSchoolManagement } from './school-management.js';
import { schoolYearOptions, schoolYearPayload } from './school-years.js';
import { mountSchoolEvidence } from './school-evidence.js';
import { mountLearningAdvisor } from './learning-advisor.js';
import { escapeHTML as e } from "../ui.js";
import { api } from "./api.js";
const id = (value) => e(String(value ?? ""));
const dt = (value) =>
  value ? new Date(value).toLocaleString("vi-VN") : "Chưa đặt";
const header = (title, sub, action = "") =>
  `<div class="portal-heading"><div><p class="eyebrow">MAIHOC · SCHOOL & LEARNING</p><h1>${title}</h1><p class="muted">${sub}</p></div>${action}</div>`;
const empty = (text) =>
  `<div class="portal-empty"><span aria-hidden="true">▤</span><p>${text}</p></div>`;
const select = (name, label, rows, key = "id", labelKey = "name") =>
  `<label>${label}<select name="${name}" required><option value="">Chọn ${label.toLowerCase()}</option>${rows.map((r) => `<option value="${id(r[key])}">${e(r[labelKey] || r.title || r.code)}</option>`).join("")}</select></label>`;
const input = (name, label, type = "text", required = true) =>
  `<label>${label}<input name="${name}" type="${type}" ${required ? "required" : ""} maxlength="500"></label>`;
const button = (label, data) =>
  `<button class="button secondary small" ${data}>${label}</button>`;

export function dashboardMarkup(user, documents, tests) {
  const pending = tests.filter(
    (t) => !t.submission && (!t.closeAt || new Date(t.closeAt) > new Date()),
  );
  const subjects = [...new Set(documents.map((d) => d.subject))];
  return `${header(user ? `Chào ${e(user.name.split(" ").slice(-1)[0])}, hôm nay học gì?` : "Mỗi ngày, tiến bộ một chút.", "Một không gian cho lớp học, kiến thức và hành trình của bạn.", `<span class="portal-date">${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}</span>`)}
  <div class="portal-dashboard"><div class="portal-main-column"><section class="portal-welcome"><div><span class="portal-overline">HỌC CHẮC · LUYỆN ĐỀU · HIỂU SÂU</span><h2>Kiến thức hôm nay.<br>Nền tảng ngày mai.</h2><p>Tiếp tục việc học, hoàn thành bài được giao<br>và tìm lời giải cho điều bạn đang tò mò.</p><button class="button primary" data-route="subject-picker">Khám phá môn học <span aria-hidden="true">→</span></button></div></section>
  <div class="portal-stats"><article class="portal-stat yellow"><span>Kho học liệu</span><strong>${documents.length}</strong><small>Tài liệu có thể khám phá</small></article><article class="portal-stat lavender"><span>Bài cần hoàn thành</span><strong>${user ? pending.length : "—"}</strong><small>${user ? "Trong danh sách bài kiểm tra" : "Đăng nhập để xem"}</small></article><article class="portal-stat blue"><span>Môn học có tài liệu</span><strong>${subjects.length}</strong><small>Học theo nhịp của bạn</small></article></div>
  <section class="portal-panel"><div class="portal-panel-heading"><h2>Thời khóa biểu</h2></div><div data-personal-timetable><p role="status">Đang tải thời khóa biểu…</p></div></section>
  <section class="portal-panel"><div class="portal-panel-heading"><h2>Khám phá kiến thức</h2><button class="text-button" data-route="subject-picker">Tất cả môn học →</button></div><div class="portal-subjects">${["Toán", "Vật lý", "Hóa học", "Sinh học", "Tiếng Anh", "Ngữ văn"].map((s, i) => `<button data-subject="${s}" class="portal-subject tone-${i % 3}"><span aria-hidden="true">${["∑", "⚛", "⌬", "❀", "Aa", "✎"][i]}</span><strong>${s}</strong><small>${documents.filter((d) => d.subject === s).length} tài liệu</small></button>`).join("")}</div></section></div>
  <aside class="portal-side-column"><section class="portal-panel portal-activity"><h2>Hoạt động gần đây</h2><div data-portal-activity>${user ? '<p class="muted">Đang tải hoạt động…</p>' : "<p>Đăng nhập để kết nối với lớp học và theo dõi việc học của bạn.</p>"}</div></section><section class="portal-tip"><span class="eyebrow">MẸO HỌC HIỆU QUẢ</span><h3>Hiểu một lỗi sai,<br>tiến thêm một bước.</h3><p>Sau mỗi bài kiểm tra, dành vài phút xem lại cách làm và thử một câu tương tự.</p></section></aside></div>
  <section class="portal-panel learning-school-invitation" aria-labelledby="learning-school-invitation-title">
    <h2 id="learning-school-invitation-title">Bạn muốn trở thành một thành viên của MAIHOC School?</h2>
    <a class="button primary" href="/school/plans" data-route="school-plans">Đăng ký</a>
  </section>`;
}
export function hydrateActivity(container, user) {
  if (!user) return () => {};
  const target = container.querySelector('[data-portal-activity]');
  if (!target) return () => {};
  let disposed = false, timer, items = [], clockOffset = 0;
  const resize = new ResizeObserver(() => sizeList());
  function sizeList() {
    const rows = [...target.querySelectorAll('article')];
    target.style.maxHeight = rows.length > 5
      ? `${rows[4].offsetTop + rows[4].offsetHeight - rows[0].offsetTop}px` : '';
  }
  function render() {
    if (disposed) return;
    clearTimeout(timer);
    const now = Date.now() + clockOffset;
    items = items.filter(item => item.expiresAt > now);
    target.innerHTML = items.length ? items.map(n =>
      `<article><span aria-hidden="true">↗</span><div><p>${e(n.title || n.message)}</p><small>${dt(new Date(n.expiresAt - 86400000).toISOString())}</small>${/^\/learning\/national-exams\/results\/\d+$/.test(n.link || '') ? `<button class="button secondary small" type="button" data-action="view-exam-result" data-id="${e(n.link.split('/').at(-1))}">Xem kết quả</button>` : ''}</div></article>`
    ).join('') : '<p>Chưa có hoạt động trong 24 giờ qua.</p>';
    sizeList();
    if (items.length) timer = setTimeout(render, Math.max(1, Math.min(...items.map(n => n.expiresAt)) - now));
  }
  resize.observe(target);
  document.addEventListener('visibilitychange', render);
  api('/api/learning/recent-activity').then(data => {
    if (disposed) return;
    clockOffset = data.serverTime - Date.now();
    items = data.items || [];
    render();
  }).catch(() => {
    if (!disposed) target.innerHTML = '<p>Chưa tải được hoạt động. Vui lòng thử lại sau.</p>';
  });
  return () => {
    disposed = true;
    clearTimeout(timer);
    resize.disconnect();
    document.removeEventListener('visibilitychange', render);
  };
}

export function mountPortal(container, route, user, onNavigate, target = {}) {
  if (route === 'question-bank' && user) return mountQuestionBank(container, user, onNavigate);
  if (route === "school-analytics") route = "analytics";
  const management = route === 'assignment-management';
  if (management) route = 'assignments';
  if (route === 'assignments' && user) {
    const student = user.role === 'user' && !user.isTeacher && !user.isSuperAdmin;
    if (management ? student : !student) {
      container.innerHTML = header('Không có quyền truy cập', management ? 'Chức năng này dành cho người quản lý bài.' : 'Bài được giao chỉ dành cho học sinh.');
      return () => {};
    }
  }
  const controller = new AbortController();
  let disposeAdvisor = () => {};
  let disposeEvidence = () => {};
  let disposeManagement = () => {};
  let context;
  let schoolId = String(target.targetSchoolId || "");
  let selectedYear = "";
  let activeAttempt = null;
  let saveTimer;
  let version = 0;
  let saving = false;
  let dirty = false;
  const request = (url, options = {}) =>
    api(url, { ...options, signal: controller.signal });
  const status = (text) => {
    const el = container.querySelector("[data-platform-status]");
    if (el) el.textContent = text;
  };
  const schoolUrl = (path) =>
    `/api/platform/schools/${encodeURIComponent(schoolId)}${path}`;
  const renderError = (error) => {
    if (!controller.signal.aborted)
      container.innerHTML =
        header(
          "Không gian MAIHOC",
          "Dữ liệu luôn được kiểm tra quyền tại máy chủ.",
        ) +
        `<div class="portal-panel" role="alert"><p>${e(error.message)}</p><button class="button secondary" data-route="home">Về tổng quan</button></div>`;
  };
  const form = (kind, title, fields, submit = "Lưu") =>
    `<form data-platform-form="${kind}" class="portal-panel portal-form"><h2>${title}</h2>${fields}<button class="button primary" type="submit">${submit}</button></form>`;
  const list = (rows, markup, text = "Chưa có dữ liệu.") =>
    rows.length ? rows.map(markup).join("") : empty(text);
  async function render() {
    disposeAdvisor();
    disposeEvidence();
    disposeManagement();
    if (!user) {
      container.innerHTML =
        header(
          "Không gian của bạn",
          "Đăng nhập để mở lớp học, bài được giao và tiến trình.",
        ) +
        `<button class="button primary" data-portal-login>Đăng nhập</button>`;
      return;
    }
    context = await request("/api/platform/context");
    if (!context.enabled && route === 'organization' && (user.isTeacher || user.isSuperAdmin || user.role === 'teacher' || user.role === 'admin')) {
      container.innerHTML = header('Quản lý nhà trường', 'Backend chưa bật nền tảng quản lý School.') +
        `<section class="portal-panel"><h2>Cần quản trị viên kích hoạt</h2><p>PR đã bổ sung chức năng, nhưng môi trường backend hiện trả về enabled=false. Các mục bên dưới sẽ dùng được khi nền tảng được bật và tài khoản được phân công vào trường.</p><div class="grid three">${['Thời khóa biểu & Lịch sự kiện','Sổ điểm điện tử','Theo dõi chuyên cần'].map(title => `<article class="card"><h3>${title}</h3><p class="muted">Chờ kích hoạt nền tảng</p></article>`).join('')}</div><details><summary>Hướng dẫn cho quản trị viên triển khai</summary><ol><li>Chạy migration School trên backend theo quy trình sao lưu hiện có: <code>npm run db:migrate</code>.</li><li>Nếu lớp hiện tại chưa ánh xạ vào trường/năm học, cấu hình LEGACY_SCHOOL_* / LEGACY_YEAR_* / LEGACY_ADMIN_ID và chạy <code>npm run db:bootstrap</code> để xem trước; kiểm tra rồi mới dùng <code>npm run db:bootstrap -- --apply</code>. Không chạy lại nếu đã ánh xạ.</li><li>Trong Environment của backend Render, đặt <code>MAIHOC_PLATFORM_ENABLED=1</code>, lưu và deploy lại backend.</li><li>Đảm bảo tài khoản giáo viên có phân công trong trường. Cấu hình email và mail worker để gửi thông báo phụ huynh.</li></ol><p>Merge code hoặc deploy frontend không tự thay đổi biến môi trường backend.</p></details><button class="button secondary" data-route="school">Lớp của bạn</button></section>`;
      return;
    }
    if (!context.enabled) {
      container.innerHTML =
        header(
          "Không gian đang được nâng cấp",
          "Các chức năng hiện tại của bạn vẫn sẵn sàng.",
        ) +
        `<div class="portal-panel"><p>Nền tảng School mới chưa được bật trên môi trường này. Bạn vẫn có thể sử dụng lớp và bài kiểm tra hiện tại.</p><div class="inline-actions"><button class="button primary" data-route="school">Lớp của bạn</button><button class="button secondary" data-route="tests">Bài kiểm tra</button></div></div>`;
      return;
    }
    const schools = context.schools || [];
    schoolId = schools.some((s) => String(s.id) === String(schoolId))
      ? schoolId
      : String(schools[0]?.id || "");
    const schoolPicker = schools.length
      ? `<label class="portal-school-picker">Trường học<select data-platform-school>${schools.map((s) => `<option value="${id(s.id)}" ${String(s.id) === schoolId ? "selected" : ""}>${e(s.name)}</option>`).join("")}</select></label>`
      : "";
    container.innerHTML =
      header(
        {
          organization: "Quản lý nhà trường",
          "question-bank": "Ngân hàng câu hỏi",
          assignments: management ? "Giao và quản lý bài" : "Bài được giao",
          analytics: "Kết quả học tập School",
        }[route],
        "Kết nối việc dạy, việc học và phản hồi trong cùng một nền tảng.",
        schoolPicker,
      ) +
      '<p data-platform-status role="status" aria-live="polite"></p><div data-platform-content></div>';
    const content = container.querySelector("[data-platform-content]");
    if (!schoolId) {
      content.innerHTML =
        empty(
          "Bạn chưa thuộc trường học nào. Liên hệ quản trị trường để được thêm vào.",
        ) +
        (user.isSuperAdmin
          ? form(
              "school",
              "Tạo trường học",
              input("code", "Mã trường") + input("name", "Tên trường"),
            )
          : "");
      return;
    }
    const school = schools.find((s) => String(s.id) === schoolId),
      staff =
        ["school_admin", "teacher"].includes(school.role) || user.isSuperAdmin;
    if (route === 'assignments' && (management ? !staff : school.role !== 'student')) {
      content.innerHTML = empty('Bạn không có quyền sử dụng chức năng này trong trường đã chọn.');
      return;
    }
    if (route === "organization") {
      const data = await request(schoolUrl("/overview"));
      const admin=school.role==='school_admin'||user.isSuperAdmin;
      const yearOptions=schoolYearOptions();
      if(!yearOptions.some(y=>y.code===selectedYear)) selectedYear=yearOptions.find(y=>data.years.some(r=>String(r.code).replace(/\s/g,'')===y.code.replace(/\s/g,'')))?.code||yearOptions[0].code;
      const year=data.years.find(r=>String(r.code).replace(/\s/g,'')===selectedYear.replace(/\s/g,''));
      const classes=data.classes.filter(c=>String(c.academic_year_id)===String(year?.id));
      const homeroomIds=data.homeroomClassIds||[];
      const transferClasses=admin?classes:classes.filter(c=>homeroomIds.some(id=>String(id)===String(c.id)));
      content.className='school-management-stack';
      content.innerHTML=`<section class="portal-panel"><h2>Năm học</h2><label>Năm học<select data-management-year>${yearOptions.map(y=>`<option value="${e(y.code)}" ${selectedYear===y.code?'selected':''}>${e(y.code)}</option>`).join('')}</select></label>${!year?`<p class="muted">Năm học này chưa được tạo trong trường.</p>${admin?`<form data-platform-form="year"><input type="hidden" name="code" value="${e(selectedYear)}"><button class="button primary">Tạo năm học đã chọn</button></form><p class="muted">Năm học bắt đầu từ 05/09 và kết thúc vào 30/06 năm sau.</p>`:''}`:''}</section><div data-management-modules></div>`;
      disposeManagement=mountSchoolManagement(content.querySelector('[data-management-modules]'),{schoolId,classes,admin,homeroomClassIds:homeroomIds});
      if(year&&admin)content.insertAdjacentHTML('beforeend',form('term','Thêm học kỳ',`<input type="hidden" name="academicYearId" value="${id(year.id)}">`+`<label>Học kỳ (năm.kỳ)<input name="name" required pattern="${yearOptions.find(y=>y.code===selectedYear).start}\\.[12]" placeholder="${yearOptions.find(y=>y.code===selectedYear).start}.1"></label>`+input('startDate','Bắt đầu','date')+input('endDate','Kết thúc','date')));
      if(admin&&!year)content.insertAdjacentHTML('beforeend','<section class="portal-panel"><h2>Thêm học kỳ</h2><p>Tạo năm học đã chọn trước khi thêm học kỳ.</p></section>');
      if(admin&&!transferClasses.length)content.insertAdjacentHTML('beforeend','<section class="portal-panel"><h2>Xếp hoặc chuyển lớp</h2><p>Chưa có lớp trong năm học đã chọn.</p></section>');
      if(year&&transferClasses.length)content.insertAdjacentHTML('beforeend',form('enrollment','Xếp hoặc chuyển lớp',input('email','Email học sinh','email')+select('classId','Lớp',transferClasses)+input('reason','Lý do')));
    } else if (route === "assignments") {
      const data = await request(schoolUrl("/assignments"));
      if (target.assignmentId) {
        data.items = data.items.filter(a => String(a.id) === String(target.assignmentId));
        if (!data.items.length) throw new Error('Bài được giao không tồn tại hoặc bạn không thuộc nhóm nhận.');
      }
      content.innerHTML = `<section class="portal-panel"><h2>Nhiệm vụ học tập</h2>${list(data.items, (a) => `<article class="portal-record"><div><small>${e(a.subject)} · ${e(a.class_name)}</small><h3>${e(a.title)}</h3><p>${dt(a.open_at)} – ${dt(a.close_at)}</p></div>${button(staff ? "Kết quả" : "Mở bài", staff ? `data-platform-results="${id(a.id)}"` : `data-platform-start="${id(a.id)}"`)}</article>`)}</section>`;
      if (staff) {
        const [q, o] = await Promise.all([
          request(schoolUrl("/questions")),
          request(schoolUrl("/overview")),
        ]);
        content.innerHTML += form(
          "assignment",
          "Giao đề từ ngân hàng câu hỏi",
          input("title", "Tên bài") +
            select("classId", "Lớp", o.classes) +
            input("openAt", "Mở bài", "datetime-local") +
            input("closeAt", "Đóng bài", "datetime-local") +
            input("durationMinutes", "Thời lượng phút", "number") +
            `<fieldset><legend>Câu hỏi đã duyệt</legend>${
              q.items
                .filter((q) => q.status === "approved")
                .map(
                  (q) =>
                    `<label class="portal-check"><input type="checkbox" name="questionIds" value="${id(q.id)}">${e(q.stem)}<span>Điểm</span><input type="number" name="points_${id(q.id)}" min="0.25" max="100" step="0.25" value="1" style="width:80px"></label>`,
                )
                .join("") || "<p>Hãy thêm và duyệt câu hỏi trước.</p>"
            }</fieldset>`,
          "Phát hành bài",
        );
      }
    } else {
      const data = await request(schoolUrl("/analytics"));
      content.innerHTML = `<section class="portal-panel"><h2>${staff ? "Kết quả trong phạm vi phụ trách" : "Nhìn lại hành trình học tập"}</h2><p class="muted">Tỷ lệ đúng được tính từ các câu đã chấm. Đây là tín hiệu luyện tập, chưa phải kết luận năng lực.</p>${list(data.topics, (t) => `<article class="portal-record"><div><strong>${e(t.name)}</strong><p>${t.observations} câu đã chấm · ${t.correct} câu đúng</p><p>${Number(t.observations) < 5 ? "Chưa đủ dữ liệu để nhận định." : Number(t.correct) / Number(t.observations) < 0.7 ? "Nên ôn lại chuyên đề và luyện thêm." : "Tiếp tục ôn tập để củng cố kiến thức."}</p></div><strong>${Math.round((Number(t.correct) / Math.max(1, Number(t.observations))) * 100)}%</strong>${!staff ? button("Luyện chuyên đề", `data-platform-practice="${id(t.id)}"`) : ""}</article>`, "Chưa có dữ liệu từng câu hỏi. Kết quả cũ vẫn xem được trong tài khoản và bài kiểm tra.")}<button class="button secondary" data-route="account-center">Mở lịch sử học tập hiện có</button></section>`;
      const evidence = document.createElement('div'); content.append(evidence);
      const overview = await request(schoolUrl('/overview'));
      disposeEvidence = mountSchoolEvidence(evidence, { schoolId, classes: overview.classes });
      if (!staff && !user.isTeacher) {
        const advisor = document.createElement('div'); content.append(advisor);
        disposeAdvisor = mountLearningAdvisor(advisor, { scope: 'school', schoolId });
      }
    }
  }
  async function saveDraft() {
    if (!activeAttempt || saving || !dirty) return;
    saving = true;
    dirty = false;
    const answers = Object.fromEntries(
      new FormData(container.querySelector("[data-attempt-form]")),
    );
    try {
      const data = await request(`/api/platform/attempts/${activeAttempt.id}`, {
        method: "PATCH",
        body: { answers, version },
      });
      version = data.version;
      try {
        localStorage.setItem(
          `maihoc:attempt:${user.id}:${activeAttempt.id}`,
          JSON.stringify({
            version,
            answers: Object.fromEntries(
              new FormData(container.querySelector("[data-attempt-form]")),
            ),
          }),
        );
      } catch {}
      status("Đã đồng bộ bài làm với máy chủ.");
    } catch (err) {
      dirty = true;
      status(`Chưa đồng bộ: ${err.message} Bản nháp vẫn được giữ trên máy.`);
    } finally {
      saving = false;
    }
  }
  async function openAttempt(assignmentId) {
    const data = await request(
      `/api/platform/assignments/${assignmentId}/start`,
      { method: "POST", body: {} },
    );
    activeAttempt = data.attempt;
    version = activeAttempt.version;
    if (activeAttempt.status !== "in_progress") {
      container.innerHTML =
        header("Bài đã nộp", "Kết quả được lưu tại máy chủ.") +
        `<section class="portal-panel"><p>Trạng thái: ${e(activeAttempt.status)}</p><button class="button secondary" data-route="school-analytics">Xem kết quả theo chuyên đề</button></section>`;
      return;
    }
    let answers = activeAttempt.answers || {};
    const draftKey = `maihoc:attempt:${user.id}:${activeAttempt.id}`;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft && draft.version === version) {
        answers = draft.answers;
        dirty = true;
      }
    } catch {}
    container.innerHTML =
      header(
        e(data.title),
        `Hạn nộp theo máy chủ: ${dt(activeAttempt.deadline_at)}`,
      ) +
      `<p role="status" data-platform-status>Đã khôi phục bài làm.</p><form class="portal-panel portal-form" data-attempt-form>${data.items.map((q, i) => `<fieldset><legend>Câu ${i + 1} · ${e(q.stem)}</legend>${q.type === "multiple_choice" ? (q.choices || []).map((c, j) => `<label class="portal-check"><input type="radio" name="${id(q.id)}" value="${j}" ${String(answers[q.id]) === String(j) ? "checked" : ""}>${e(c)}</label>`).join("") : q.type === "true_false" ? (q.choices || []).map((statement, j) => `<label>${e(statement)}<select name="${id(q.id)}_${j}"><option value="">Chưa chọn</option><option value="true" ${answers[`${q.id}_${j}`] === "true" ? "selected" : ""}>Đúng</option><option value="false" ${answers[`${q.id}_${j}`] === "false" ? "selected" : ""}>Sai</option></select></label>`).join("") : `<textarea name="${id(q.id)}" maxlength="5000">${e(answers[q.id] || "")}</textarea>`}</fieldset>`).join("")}<button class="button primary" type="submit">Nộp bài</button></form>`;
    container.querySelector("form").addEventListener("input", () => {
      dirty = true;
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            version,
            answers: Object.fromEntries(
              new FormData(container.querySelector("form")),
            ),
          }),
        );
        status("Đã lưu trên máy · đang chờ đồng bộ.");
      } catch {
        status("Không thể lưu trên máy; đang chờ đồng bộ máy chủ.");
      }
    });
    clearInterval(saveTimer);
    saveTimer = setInterval(saveDraft, 10000);
  }
  container.addEventListener(
    "change",
    (event) => {
      if(event.target.matches("[data-management-year]")){selectedYear=event.target.value;render().catch(renderError);}
      if (event.target.matches("[data-platform-school]")) {
        schoolId = event.target.value;
        selectedYear="";
        render().catch(renderError);
      }
    },
    { signal: controller.signal },
  );
  container.addEventListener(
    "click",
    async (event) => {
      try {
        const author = event.target.closest("[data-platform-ai-author]");
        if (author) {
          sessionStorage.setItem(
            "maihoc:ai-author-draft",
            "Tôi là giáo viên. Hãy gợi ý một câu hỏi THPT, nêu chuyên đề, yêu cầu cần đạt, đáp án, giải thích và các điểm cần giáo viên kiểm tra trước khi duyệt. Nội dung chỉ là bản nháp. Chủ đề: ",
          );
          onNavigate("ai-solver");
          return;
        }
        const revise = event.target.closest("[data-platform-revise]");
        if (revise) {
          const data = await request(schoolUrl("/questions"));
          const q = data.items.find(
            (q) => String(q.id) === revise.dataset.platformRevise,
          );
          const target = container.querySelector(
            "[data-platform-form=question]",
          );
          for (const [name, value] of Object.entries({
            subject: q.subject,
            grade: q.grade,
            type: q.type,
            stem: q.stem,
            choices: q.choices.join("\n"),
            answer: q.answer,
            curriculumNodeId: q.curriculum_node_id,
            source: q.source,
          })) {
            if (target.elements[name]) target.elements[name].value = value;
          }
          let previous = target.elements.previousVersionId;
          if (!previous) {
            previous = document.createElement("input");
            previous.type = "hidden";
            previous.name = "previousVersionId";
            target.append(previous);
          }
          previous.value = q.id;
          target.scrollIntoView({ behavior: "smooth" });
          status(
            "Đang soạn phiên bản mới; nội dung đã phát hành được giữ nguyên.",
          );
          return;
        }
        const practice = event.target.closest("[data-platform-practice]");
        if (practice) {
          const data = await request(schoolUrl("/practice"), {
            method: "POST",
            body: { topicId: practice.dataset.platformPractice },
          });
          await openAttempt(data.id);
          return;
        }
        const approve = event.target.closest("[data-platform-approve]");
        if (approve) {
          await request(
            schoolUrl(`/questions/${approve.dataset.platformApprove}/approve`),
            { method: "POST", body: {} },
          );
          await render();
        }
        const start = event.target.closest("[data-platform-start]");
        if (start) await openAttempt(start.dataset.platformStart);
        const results = event.target.closest("[data-platform-results]");
        if (results) {
          const data = await request(
            schoolUrl(
              `/assignments/${results.dataset.platformResults}/results`,
            ),
          );
          container.querySelector("[data-platform-content]").innerHTML =
            `<section class="portal-panel"><h2>Kết quả bài được giao</h2><a class="button secondary small" href="${schoolUrl(`/assignments/${results.dataset.platformResults}/export`)}">Xuất bảng điểm CSV</a>${list(data.items, (r) => `<article class="portal-record"><div><strong>${e(r.student_name)}</strong><p>${e(r.status)} · ${dt(r.submitted_at)}</p></div><strong>${r.score == null ? "Chờ chấm" : e(r.score) + " / " + e(r.scale)}</strong>${r.status === "pending_grade" ? `<form data-platform-grade="${id(r.id)}">${input("score", "Điểm tổng", "number")}${input("feedback", "Nhận xét")}<button class="button secondary small">Lưu điểm</button></form>` : ""}</article>`)}</section>`;
        }
      } catch (err) {
        status(err.message);
      }
    },
    { signal: controller.signal },
  );
  container.addEventListener(
    "submit",
    async (event) => {
      const target = event.target;
      if (
        !target.matches(
          "[data-platform-form], [data-attempt-form], [data-platform-grade]",
        )
      )
        return;
      event.preventDefault();
      const submit = target.querySelector('[type="submit"],button');
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        if (target.matches("[data-attempt-form]")) {
          const data = await request(
            `/api/platform/attempts/${activeAttempt.id}/submit`,
            {
              method: "POST",
              body: {
                answers: Object.fromEntries(new FormData(target)),
                idempotencyKey: `attempt:${activeAttempt.id}`,
              },
            },
          );
          clearInterval(saveTimer);
          localStorage.removeItem(
            `maihoc:attempt:${user.id}:${activeAttempt.id}`,
          );
          activeAttempt = null;
          container.innerHTML =
            header(
              "Đã nộp bài thành công",
              "Bài làm đã được lưu tại máy chủ.",
            ) +
            `<section class="portal-panel"><h2>${data.status === "pending_grade" ? "Đang chờ giáo viên chấm" : `Kết quả ${data.score} / ${data.scale}`}</h2><button class="button primary" data-route="school-analytics">Xem kết quả theo chuyên đề</button></section>`;
          return;
        }
        const body = Object.fromEntries(new FormData(target));
        const kind = target.dataset.platformForm;
        if(kind==='year')Object.assign(body,schoolYearPayload(body.code));
        if (target.dataset.platformGrade) {
          await request(
            schoolUrl(`/attempts/${target.dataset.platformGrade}/grade`),
            { method: "POST", body },
          );
          status("Đã lưu điểm và nhật ký chỉnh sửa.");
          return;
        }
        const paths = {
          school: "/api/platform/schools",
          year: schoolUrl("/years"),
          class: schoolUrl("/classes"),
          member: schoolUrl("/members"),
          enrollment: schoolUrl("/enrollments"),
          teacher: schoolUrl("/teachers"),
          term: schoolUrl("/terms"),
          course: schoolUrl("/courses"),
          import: schoolUrl("/import"),
          question: schoolUrl("/questions"),
          topic: schoolUrl("/curriculum"),
          assignment: schoolUrl("/assignments"),
        };
        if (kind === "assignment") {
          body.questionIds = new FormData(target).getAll("questionIds");
          body.points = Object.fromEntries(
            body.questionIds.map((id) => [id, body[`points_${id}`] || 1]),
          );
        }
        if (kind === "question")
          body.choices = body.choices
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);
        if (kind === "import")
          body.emails = body.emails
            .split(/[\n,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
        if (body.openAt) body.openAt = new Date(body.openAt).toISOString();
        if (body.closeAt) body.closeAt = new Date(body.closeAt).toISOString();
        await request(paths[kind], { method: "POST", body });
        await render();
        status("Đã lưu thành công.");
      } catch (err) {
        status(err.message);
      } finally {
        submit.disabled = false;
      }
    },
    { signal: controller.signal },
  );
  render().catch(renderError);
  return () => {
    controller.abort();
    disposeAdvisor();
    disposeEvidence();
    disposeManagement();
    clearInterval(saveTimer);
  };
}
