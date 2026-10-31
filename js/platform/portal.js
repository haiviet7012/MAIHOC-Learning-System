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
  <div class="portal-dashboard"><div class="portal-main-column"><section class="portal-welcome"><div><span class="portal-overline">HỌC CHẮC · LUYỆN ĐỀU · HIỂU SÂU</span><h2>Kiến thức hôm nay.<br>Nền tảng ngày mai.</h2><p>Tiếp tục việc học, hoàn thành bài được giao<br>và tìm lời giải cho điều bạn đang tò mò.</p><button class="button primary" data-route="subject-picker">Khám phá môn học <span aria-hidden="true">→</span></button></div><div class="portal-book-art" aria-hidden="true"><span>∑</span><b>MAI<br>HỌC</b><small>LEARN EVERY DAY</small></div></section>
  <div class="portal-stats"><article class="portal-stat yellow"><span>Kho học liệu</span><strong>${documents.length}</strong><small>Tài liệu có thể khám phá</small></article><article class="portal-stat lavender"><span>Bài cần hoàn thành</span><strong>${user ? pending.length : "—"}</strong><small>${user ? "Trong danh sách bài kiểm tra" : "Đăng nhập để xem"}</small></article><article class="portal-stat blue"><span>Môn học có tài liệu</span><strong>${subjects.length}</strong><small>Học theo nhịp của bạn</small></article></div>
  <section class="portal-panel"><div class="portal-panel-heading"><h2>Việc học của bạn</h2><button data-route="tests" class="text-button">Xem tất cả →</button></div><div class="portal-task-list">${
    !user
      ? `<div class="portal-empty"><p>Đăng nhập để xem bài giáo viên giao và lưu tiến trình học tập.</p><button class="button primary" data-portal-login>Đăng nhập</button></div>`
      : pending.length
        ? pending
            .slice(0, 4)
            .map(
              (t, i) =>
                `<article class="portal-task tone-${i % 3}"><span class="portal-subject-icon" aria-hidden="true">${e((t.subject || "M").slice(0, 1))}</span><div><small>${e(t.subject)} · Lớp ${e(t.grade)}</small><h3>${e(t.title)}</h3><p>Hạn nộp ${dt(t.closeAt)}</p></div><button class="button secondary small" data-portal-test="${id(t.id)}">Làm bài →</button></article>`,
            )
            .join("")
        : empty(
            "Bạn đã theo kịp các bài kiểm tra hiện có. Khám phá thêm học liệu hoặc bài tập mới.",
          )
  }<button class="portal-shortcut" data-route="assignments">Bài được giao từ School <span>→</span></button></div></section>
  <section class="portal-panel"><div class="portal-panel-heading"><h2>Khám phá kiến thức</h2><button class="text-button" data-route="subject-picker">Tất cả môn học →</button></div><div class="portal-subjects">${["Toán", "Vật lý", "Hóa học", "Sinh học", "Tiếng Anh"].map((s, i) => `<button data-subject="${s}" class="portal-subject tone-${i % 3}"><span aria-hidden="true">${["∑", "⚛", "⌬", "❀", "Aa"][i]}</span><strong>${s}</strong><small>${documents.filter((d) => d.subject === s).length} tài liệu</small></button>`).join("")}</div></section></div>
  <aside class="portal-side-column"><section class="portal-panel portal-activity"><h2>Hoạt động gần đây</h2><div data-portal-activity>${user ? '<p class="muted">Đang tải hoạt động…</p>' : "<p>Đăng nhập để kết nối với lớp học và theo dõi việc học của bạn.</p>"}</div></section><section class="portal-panel"><div class="portal-panel-heading"><h2>Góc học tập</h2><span aria-hidden="true">✦</span></div><button class="portal-shortcut" data-route="ai-solver"><span><b>Gia sư AI</b><small>Gợi mở, kiểm tra và giải thích</small></span>→</button><button class="portal-shortcut" data-route="study-rooms"><span><b>Phòng tự học</b><small>Cùng nhau giữ nhịp tập trung</small></span>→</button><button class="portal-shortcut" data-route="analytics"><span><b>Tiến trình học tập</b><small>Nhìn lại điều đã học được</small></span>→</button></section><section class="portal-tip"><span class="eyebrow">MẸO HỌC HIỆU QUẢ</span><h3>Hiểu một lỗi sai,<br>tiến thêm một bước.</h3><p>Sau mỗi bài kiểm tra, dành vài phút xem lại cách làm và thử một câu tương tự.</p></section></aside></div>`;
}
export async function hydrateActivity(container, user) {
  if (!user) return;
  try {
    const data = await api("/api/notifications");
    const list = data.notifications || data.items || [];
    const target = container.querySelector("[data-portal-activity]");
    if (target)
      target.innerHTML = list.length
        ? list
            .slice(0, 4)
            .map(
              (n) =>
                `<article><span aria-hidden="true">↗</span><div><p>${e(n.title || n.message)}</p><small>${dt(n.createdAt || n.created_at)}</small></div></article>`,
            )
            .join("")
        : "<p>Chưa có thông báo mới. Mọi việc học của bạn sẽ được cập nhật tại đây.</p>";
  } catch {
    const target = container.querySelector("[data-portal-activity]");
    if (target)
      target.innerHTML =
        "<p>Chưa tải được hoạt động. Bạn có thể mở lại thông báo sau.</p>";
  }
}

export function mountPortal(container, route, user, onNavigate) {
  const controller = new AbortController();
  let context;
  let schoolId = "";
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
          assignments: "Bài được giao",
          analytics: "Tiến trình học tập",
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
    if (route === "organization") {
      const data = await request(schoolUrl("/overview"));
      content.innerHTML = `<div class="portal-stats"><article class="portal-stat yellow"><span>Lớp học</span><strong>${data.classes.length}</strong></article><article class="portal-stat lavender"><span>Năm học</span><strong>${data.years.length}</strong></article><article class="portal-stat blue"><span>Thành viên</span><strong>${data.memberCount == null ? "—" : data.memberCount}</strong></article></div><div class="portal-form-grid"><section class="portal-panel"><h2>Lớp và năm học</h2>${list(data.classes, (c) => `<div class="portal-record"><div><strong>${e(c.name)}</strong><p>${e(c.year_code)} · Khối ${e(c.grade_level)}</p></div><small>${e(c.class_code)}</small></div>`)}</section>${school.role === "school_admin" || user.isSuperAdmin ? form("class", "Thêm lớp học", select("academicYearId", "Năm học", data.years) + input("classCode", "Mã lớp") + input("name", "Tên lớp") + input("gradeLevel", "Khối lớp", "number")) : ""}</div>${school.role === "school_admin" || user.isSuperAdmin ? `<div class="portal-form-grid">${form("year", "Thêm năm học", input("code", "Năm học") + input("startDate", "Bắt đầu", "date") + input("endDate", "Kết thúc", "date"))}${form("term", "Thêm học kỳ", select("academicYearId", "Năm học", data.years) + input("name", "Tên học kỳ") + input("startDate", "Bắt đầu", "date") + input("endDate", "Kết thúc", "date"))}${form("course", "Môn học trong học kỳ", select("classId", "Lớp", data.classes) + select("termId", "Học kỳ", data.terms) + input("subject", "Môn học"))}${form("member", "Thêm thành viên đã có tài khoản", input("email", "Email", "email") + `<label>Vai trò<select name="role"><option value="student">Học sinh</option><option value="teacher">Giáo viên</option><option value="school_admin">Quản trị trường</option></select></label>`)}${form("enrollment", "Xếp hoặc chuyển lớp", input("email", "Email học sinh", "email") + select("classId", "Lớp", data.classes) + input("reason", "Lý do"))}${form("teacher", "Phân công giáo viên", input("email", "Email giáo viên", "email") + select("classId", "Lớp", data.classes) + input("subject", "Môn học") + `<label>Phân công<select name="kind"><option value="subject">Bộ môn</option><option value="homeroom">Chủ nhiệm</option></select></label>`)}</div>${form("import", "Nhập danh sách học sinh", select("classId", "Lớp", data.classes) + '<label>Danh sách email đã có tài khoản<textarea name="emails" required placeholder="Mỗi dòng một email, tối đa 200 dòng"></textarea></label><p class="muted">Hệ thống kiểm tra toàn bộ danh sách trước khi ghi dữ liệu.</p>', "Kiểm tra và nhập")}` : ""}`;
    } else if (route === "question-bank") {
      const [data, taxonomy] = await Promise.all([
        request(schoolUrl("/questions")),
        request(schoolUrl("/curriculum")),
      ]);
      content.innerHTML = `<div class="portal-form-grid"><section class="portal-panel"><h2>Câu hỏi của trường</h2>${list(data.items, (q) => `<article class="portal-record"><div><small>${e(q.subject)} · ${e(q.status)} · v${q.version}</small><h3>${e(q.stem)}</h3><p>${e(q.topic_name || "Chưa gắn chuyên đề")}</p></div>${staff && q.status === "draft" ? button("Duyệt", `data-platform-approve="${id(q.id)}"`) : ""}${staff ? button("Tạo phiên bản mới", `data-platform-revise="${id(q.id)}"`) : ""}</article>`)}</section>${staff ? form("question", "Soạn câu hỏi", '<button type="button" class="button secondary small" data-platform-ai-author>Nhờ trợ giảng AI gợi ý</button>' + input("subject", "Môn học") + input("grade", "Khối lớp", "number") + `<label>Loại câu<select name="type"><option value="multiple_choice">Trắc nghiệm</option><option value="true_false">Đúng/sai 4 mệnh đề</option><option value="short_answer">Trả lời ngắn</option><option value="essay">Tự luận</option></select></label><label>Nội dung<textarea name="stem" required maxlength="12000"></textarea></label><label>Các lựa chọn (mỗi dòng một đáp án)<textarea name="choices" placeholder="A. …&#10;B. …"></textarea></label>${input("answer", "Đáp án: vị trí 0, 1…; đúng/sai: [true,false,true,false]; hoặc rubric")}${select("curriculumNodeId", "Chuyên đề", taxonomy.nodes)}${input("source", "Nguồn học liệu")}`) : ""}</div>${staff ? form("topic", "Thêm chuyên đề", input("subject", "Môn học") + input("grade", "Khối lớp", "number") + input("name", "Tên chuyên đề") + input("version", "Phiên bản chương trình")) : ""}`;
    } else if (route === "assignments") {
      const data = await request(schoolUrl("/assignments"));
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
        `<section class="portal-panel"><p>Trạng thái: ${e(activeAttempt.status)}</p><button class="button secondary" data-route="analytics">Xem tiến trình</button></section>`;
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
      if (event.target.matches("[data-platform-school]")) {
        schoolId = event.target.value;
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
            `<section class="portal-panel"><h2>${data.status === "pending_grade" ? "Đang chờ giáo viên chấm" : `Kết quả ${data.score} / ${data.scale}`}</h2><button class="button primary" data-route="analytics">Xem tiến trình</button></section>`;
          return;
        }
        const body = Object.fromEntries(new FormData(target));
        const kind = target.dataset.platformForm;
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
    clearInterval(saveTimer);
  };
}
