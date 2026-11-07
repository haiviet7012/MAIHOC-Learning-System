import { formatVietnamDateTime, parseVietnamSchedule } from './vietnam-time.js';
import { mountQuestionBank } from './question-bank.js';
import { mountSchoolEvidence } from './school-evidence.js';
import { mountLearningAdvisor } from './learning-advisor.js';
import { escapeHTML as e } from "../ui.js";
import { api } from "./api.js";
const id = (value) => e(String(value ?? ""));
const dt = (value) =>
  value ? formatVietnamDateTime(value) : "Chưa đặt";
const header = (title, sub, action = "") =>
  `<div class="portal-heading"><div><p class="eyebrow">MAIHOC · SCHOOL & LEARNING</p><h1>${title}</h1><p class="muted">${sub}</p></div>${action}</div>`;
const empty = (text) =>
  `<div class="portal-empty"><span aria-hidden="true">▤</span><p>${text}</p></div>`;
const button = (label, data) =>
  `<button class="button secondary small" ${data}>${label}</button>`;

export function dashboardMarkup(user, documents, tests) {
  const pending = tests.filter(
    (t) => !t.submission && (!t.closeAt || parseVietnamSchedule(t.closeAt) > new Date()),
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
  if (route === 'assignments' && user && (user.role !== 'user' || user.isTeacher || user.isSuperAdmin)) {
    container.innerHTML = header('Không có quyền truy cập', 'Bài được giao chỉ dành cho học sinh.');
    return () => {};
  }
  const controller = new AbortController();
  let disposeAdvisor = () => {};
  let disposeEvidence = () => {};
  let context;
  let schoolId = String(target.targetSchoolId || "");
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
  const list = (rows, markup, text = "Chưa có dữ liệu.") =>
    rows.length ? rows.map(markup).join("") : empty(text);
  async function render() {
    disposeAdvisor();
    disposeEvidence();
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
          "question-bank": "Ngân hàng câu hỏi",
          assignments: "Bài được giao",
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
        );
      return;
    }
    const school = schools.find((s) => String(s.id) === schoolId),
      staff =
        ["school_admin", "teacher"].includes(school.role) || user.isSuperAdmin;
    if (route === 'assignments' && school.role !== 'student') {
      content.innerHTML = empty('Bạn không có quyền sử dụng chức năng này trong trường đã chọn.');
      return;
    }
    if (route === "assignments") {
      const data = await request(schoolUrl("/assignments"));
      if (target.assignmentId) {
        data.items = data.items.filter(a => String(a.id) === String(target.assignmentId));
        if (!data.items.length) throw new Error('Bài được giao không tồn tại hoặc bạn không thuộc nhóm nhận.');
      }
      content.innerHTML = `<section class="portal-panel"><h2>Nhiệm vụ học tập</h2>${list(data.items, (a) => `<article class="portal-record"><div><small>${e(a.subject)} · ${e(a.class_name)}</small><h3>${e(a.title)}</h3><p>${dt(a.open_at)} – ${dt(a.close_at)}</p></div>${button("Mở bài", `data-platform-start="${id(a.id)}"`)}</article>`)}</section>`;
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
        const practice = event.target.closest("[data-platform-practice]");
        if (practice) {
          const data = await request(schoolUrl("/practice"), {
            method: "POST",
            body: { topicId: practice.dataset.platformPractice },
          });
          await openAttempt(data.id);
          return;
        }
        const start = event.target.closest("[data-platform-start]");
        if (start) await openAttempt(start.dataset.platformStart);
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
          "[data-attempt-form]",
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
    clearInterval(saveTimer);
  };
}
