import { escapeHTML, toast, openDialog, closeDialog } from "../ui.js";

let cachedTests = [];
let cachedSummary = { total: 0, incompleteCount: 0, completedCount: 0, pendingGradingTotal: 0 };
let queueFilterStatus = "all";
let queueFilterSubject = "all";
let activeGradingContext = null;

export function getCachedTests() {
  return cachedTests;
}

export function findCachedTest(id) {
  return cachedTests.find(t => String(t.id) === String(id)) || null;
}

export async function refreshTestsQueue() {
  try {
    const response = await fetch("/api/tests", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    cachedTests = Array.isArray(data.tests) ? data.tests : [];
    cachedSummary = data.summary || {
      total: cachedTests.length,
      incompleteCount: cachedTests.filter(t => !t.completed).length,
      completedCount: cachedTests.filter(t => t.completed).length,
      pendingGradingTotal: 0
    };
    return cachedTests;
  } catch (error) {
    console.warn("Could not fetch tests queue:", error.message);
    return cachedTests;
  }
}

export function formatTestDateTime(value) {
  if (!value) return "—";
  const raw = String(value).trim();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function defaultDateTimeInputs() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const toLocalInput = d =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const close = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { openAt: toLocalInput(now), closeAt: toLocalInput(close) };
}

export function openCreateTestDialog() {
  const dialog = document.getElementById("create-test-dialog");
  if (!dialog) return;
  const form = dialog.querySelector("#create-test-form");
  if (form) {
    const defaults = defaultDateTimeInputs();
    if (!form.elements.openAt.value) form.elements.openAt.value = defaults.openAt;
    if (!form.elements.closeAt.value) form.elements.closeAt.value = defaults.closeAt;
  }
  openDialog("create-test-dialog");
}

export function renderTestsQueuePage(currentUser) {
  const isAdmin = currentUser?.role === "admin";
  const filtered = cachedTests.filter(t => {
    if (queueFilterStatus === "incomplete" && t.completed) return false;
    if (queueFilterStatus === "completed" && !t.completed) return false;
    if (queueFilterSubject !== "all" && t.subject !== queueFilterSubject) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return 0;
  });

  const subjects = ["Toán", "Tiếng Anh", "Vật lý", "Hóa học", "Ngữ văn", "Sinh học", "Đề thi THPT quốc gia", "IELTS"];
  for (const t of cachedTests) {
    if (t.subject && !subjects.includes(t.subject)) subjects.push(t.subject);
  }

  const cellsHtml = filtered.length
    ? filtered
        .map((test, index) => {
          const isCompleted = Boolean(test.completed);
          const durationText = test.durationMinutes ? `${test.durationMinutes} phút` : "Không giới hạn";
          const openText = formatTestDateTime(test.openAt);
          const closeText = formatTestDateTime(test.closeAt);

          let scoreOrPendingHtml = "";
          if (isCompleted && test.submission) {
            if (test.submission.gradingStatus === "pending_grade" || !test.submission.graded) {
              scoreOrPendingHtml = `<span class="test-score-tag is-pending-grade">⏳ Đang chờ chấm</span>`;
            } else if (test.submission.score != null) {
              scoreOrPendingHtml = `<span class="test-score-tag">Điểm: ${Number(test.submission.score).toFixed(2)}/${test.submission.scale || 10}</span>`;
            }
          } else if (!isCompleted) {
            if (test.availability === "upcoming") {
              scoreOrPendingHtml = `<span class="muted tiny">Chưa đến giờ mở đề</span>`;
            } else if (test.availability === "closed") {
              scoreOrPendingHtml = `<span class="muted tiny" style="color:var(--danger)">Đã hết hạn nộp bài</span>`;
            } else if (test.answerMode === "deferred" && !test.hasApprovedAnswers) {
              scoreOrPendingHtml = `<span class="muted tiny">Giảng viên chấm sau khi nộp</span>`;
            }
          }

          let primaryActionHtml = "";
          if (isCompleted && test.submission) {
            primaryActionHtml = `
              <button type="button" class="button secondary small" data-action="view-test-submission" data-id="${escapeHTML(test.submission.id)}">Xem kết quả</button>
              ${isAdmin ? `<button type="button" class="button ghost small" data-action="start-test" data-id="${escapeHTML(test.id)}" title="Admin làm thử lại">Làm thử</button>` : ""}
            `;
          } else {
            const canStart = test.availability === "open" || isAdmin;
            const btnLabel =
              test.availability === "upcoming" && !isAdmin
                ? "Chưa mở đề"
                : test.availability === "closed" && !isAdmin
                  ? "Đã đóng đề"
                  : "Làm bài →";
            primaryActionHtml = `
              <button type="button" class="button primary small" data-action="start-test" data-id="${escapeHTML(test.id)}" ${canStart ? "" : "disabled"}>
                ${escapeHTML(btnLabel)}
              </button>
            `;
          }

          const adminControlsHtml = isAdmin
            ? `
              <button type="button" class="button secondary small" data-test-answer-pipeline="${escapeHTML(test.id)}" title="Nhập hoặc duyệt đáp án theo pipeline">
                ${test.hasApprovedAnswers ? "✓ Đáp án" : "＋ Nhập đáp án"}
              </button>
              <button type="button" class="button danger small" data-delete-test="${escapeHTML(test.id)}" title="Xóa bài kiểm tra">Xóa</button>
            `
            : "";

          const adminSubMeta = isAdmin
            ? ` · <strong>${test.totalSubmissionsCount || 0}</strong> đã nộp${
                test.pendingGradingCount > 0
                  ? ` · <strong style="color:#d97706">${test.pendingGradingCount} chờ chấm</strong>`
                  : ""
              }`
            : "";

          return `
            <article class="test-queue-cell ${isCompleted ? "is-completed" : "is-incomplete"}" data-test-cell="${escapeHTML(test.id)}">
              <div class="test-cell-main">
                <div class="test-cell-title-row">
                  <span class="test-queue-order">#${index + 1}</span>
                  <strong>${escapeHTML(test.title)}</strong>
                </div>
                <div class="test-cell-meta">
                  <span class="pill">${escapeHTML(test.subject)} · Lớp ${escapeHTML(test.grade)}</span>
                  <span>${test.hasApprovedAnswers ? "Chấm tự động" : "Giảng viên chấm"}${adminSubMeta}</span>
                </div>
              </div>

              <div class="test-cell-field">
                <span class="test-cell-field-label">Ngày mở</span>
                <strong>${escapeHTML(openText)}</strong>
              </div>

              <div class="test-cell-field">
                <span class="test-cell-field-label">Ngày đóng (Hạn cuối)</span>
                <strong>${escapeHTML(closeText)}</strong>
              </div>

              <div class="test-cell-field">
                <span class="test-cell-field-label">Thời gian làm bài</span>
                <span class="test-cell-duration">◷ ${escapeHTML(durationText)}</span>
              </div>

              <div class="test-status-col">
                <span class="test-status-badge ${isCompleted ? "is-completed" : "is-incomplete"}">
                  ${isCompleted ? "● Đã hoàn thành" : "● Chưa hoàn thành"}
                </span>
                ${scoreOrPendingHtml}
              </div>

              <div class="test-cell-actions">
                ${primaryActionHtml}
                ${adminControlsHtml}
              </div>
            </article>
          `;
        })
        .join("")
    : `
      <div class="empty-state">
        <h3>Chưa có bài kiểm tra nào trong hàng đợi</h3>
        <p>${isAdmin ? "Nhấn “＋ Thêm bài kiểm tra” để tải đề lên, thiết lập ngày mở, hạn nộp và thời gian làm bài." : "Hiện chưa có bài kiểm tra nào khớp bộ lọc của bạn."}</p>
        ${isAdmin ? '<button type="button" class="button primary" data-open-create-test>＋ Thêm bài kiểm tra</button>' : ""}
      </div>
    `;

  return `
    <section class="tests-page">
      <header class="tests-page-header">
        <div>
          <p class="eyebrow">HỆ THỐNG ĐÁNH GIÁ & KIỂM TRA ĐỊNH KỲ</p>
          <h1>Bài kiểm tra</h1>
          <p>Các bài kiểm tra được sắp xếp theo hàng đợi (Queue) từ <strong>Chưa hoàn thành</strong> đến <strong>Đã hoàn thành</strong>. Khi vào làm bài sẽ tự động phóng toàn màn hình và tự động nộp bài nếu thoát màn hình.</p>
        </div>
        <div class="tests-header-actions">
          ${
            currentUser
              ? `<button type="button" class="button secondary" data-export-user-sheets="xlsx">⬇ Xuất Sheets kết quả học tập (.xlsx)</button>`
              : ""
          }
          ${
            isAdmin
              ? `
                <button type="button" class="button secondary" data-export-teacher-sheets="xlsx">📊 Xuất bảng điểm giảng viên (.xlsx)</button>
                <button type="button" class="button secondary" data-route="admin">📋 Bài chờ chấm (${cachedSummary.pendingGradingTotal || 0})</button>
                <button type="button" class="button primary" data-open-create-test>＋ Thêm bài kiểm tra</button>
              `
              : ""
          }
        </div>
      </header>

      <div class="test-queue-window" role="region" aria-label="Cửa sổ hàng đợi bài kiểm tra">
        <div class="test-queue-window-head">
          <div class="test-queue-window-title">
            <h2>Danh sách Bài kiểm tra (Queue)</h2>
            <div class="test-queue-counters">
              <span class="test-queue-counter-pill is-incomplete">● Chưa hoàn thành: ${cachedSummary.incompleteCount}</span>
              <span class="test-queue-counter-pill is-completed">● Đã hoàn thành: ${cachedSummary.completedCount}</span>
            </div>
          </div>

          <div class="test-queue-filters">
            <select data-test-filter-status aria-label="Lọc theo trạng thái hoàn thành">
              <option value="all" ${queueFilterStatus === "all" ? "selected" : ""}>Tất cả trạng thái (${cachedSummary.total})</option>
              <option value="incomplete" ${queueFilterStatus === "incomplete" ? "selected" : ""}>Chưa hoàn thành (${cachedSummary.incompleteCount})</option>
              <option value="completed" ${queueFilterStatus === "completed" ? "selected" : ""}>Đã hoàn thành (${cachedSummary.completedCount})</option>
            </select>
            <select data-test-filter-subject aria-label="Lọc theo môn học">
              <option value="all" ${queueFilterSubject === "all" ? "selected" : ""}>Tất cả môn học</option>
              ${subjects.map(s => `<option value="${escapeHTML(s)}" ${queueFilterSubject === s ? "selected" : ""}>Môn ${escapeHTML(s)}</option>`).join("")}
            </select>
            <button type="button" class="button secondary small" data-test-queue-refresh>↻ Làm mới</button>
          </div>
        </div>

        <div class="test-queue-col-head" aria-hidden="true">
          <span>TÊN BÀI KIỂM TRA</span>
          <span>NGÀY MỞ</span>
          <span>NGÀY ĐÓNG</span>
          <span>THỜI GIAN LÀM BÀI</span>
          <span>TRẠNG THÁI HOÀN THÀNH</span>
          <span style="text-align:right">THAO TÁC</span>
        </div>

        <div class="test-queue-list" id="test-queue-list">
          ${cellsHtml}
        </div>
      </div>
    </section>
  `;
}

export async function openTestGradingDialog(submissionId) {
  const dialog = document.getElementById("test-grading-dialog");
  if (!dialog) return;

  const titleEl = dialog.querySelector("[data-grading-title]");
  const metaEl = dialog.querySelector("[data-grading-meta]");
  const contentEl = dialog.querySelector("[data-grading-content]");
  const errorEl = dialog.querySelector("[data-grading-error]");
  const saveBtn = dialog.querySelector("[data-grading-save]");
  const previewBox = dialog.querySelector("[data-grading-paper-preview]");

  if (titleEl) titleEl.textContent = "Đang tải bài làm của học viên…";
  if (metaEl) metaEl.textContent = "Đang kết nối hệ thống…";
  if (contentEl) contentEl.innerHTML = '<p class="muted">Đang tải đề bài và bài làm…</p>';
  if (errorEl) errorEl.hidden = true;
  if (previewBox) {
    previewBox.hidden = true;
    previewBox.innerHTML = "";
  }
  if (!dialog.open) dialog.showModal();

  try {
    const response = await fetch(`/api/admin/test-submissions/${encodeURIComponent(submissionId)}/grading-context`, {
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Không tải được bài làm cần chấm.");

    activeGradingContext = data;

    if (titleEl) {
      titleEl.textContent = `${data.title} — Học viên: ${data.userName}`;
    }
    if (metaEl) {
      metaEl.innerHTML = `Email: <strong>${escapeHTML(data.userEmail)}</strong> · Môn ${escapeHTML(data.subject)} · Lớp ${escapeHTML(data.grade)} · Nộp lúc: <strong>${escapeHTML(formatTestDateTime(data.submittedAt))}</strong>${
        data.autoSubmittedFullscreen ? ' · <span style="color:var(--orange)">Tự động nộp khi thoát toàn màn hình</span>' : ""
      }`;
    }

    const noteInput = dialog.querySelector("[data-grading-teacher-note]");
    if (noteInput) noteInput.value = data.teacherNote || "";

    renderGradingQuestions(data);
    recalculateLiveGradingScore();
    if (saveBtn) saveBtn.disabled = false;
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message || "Lỗi khi tải bài nộp.";
      errorEl.hidden = false;
    }
    if (contentEl) contentEl.innerHTML = "";
  }
}

function renderGradingQuestions(data) {
  const contentEl = document.querySelector("#test-grading-dialog [data-grading-content]");
  if (!contentEl) return;

  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (!questions.length) {
    contentEl.innerHTML = '<p class="muted">Không có câu hỏi nào trong bài nộp này.</p>';
    return;
  }

  contentEl.innerHTML = questions
    .map(item => {
      const type = String(item.type || "multiple_choice").toLowerCase();
      const targetId = String(item.targetId);
      const studentAnswer = String(item.studentAnswer || "").trim();
      const currentAnswer = String(item.answer || (type === "multiple_choice" ? "A" : type === "true_false" ? "true" : "")).trim();
      const maxPts = Number(item.maximumPoints) || 0.25;
      const rubric = Array.isArray(item.rubric) && item.rubric.length
        ? item.rubric
        : [{ criterion: `Chọn đúng đáp án ${currentAnswer || "chuẩn"} (${maxPts} điểm)`, points: maxPts }];
      const rubricSummaryText = rubric.map(r => `${r.criterion} (${r.points} điểm)`).join("\n");

      const displayStudentAnswer =
        type === "true_false"
          ? studentAnswer === "true"
            ? "Đúng"
            : studentAnswer === "false"
              ? "Sai"
              : studentAnswer || "Bỏ trống"
          : studentAnswer || "Bỏ trống";

      let answerEditorHtml = "";
      if (type === "multiple_choice") {
        const selected = ["A", "B", "C", "D"].includes(currentAnswer.toUpperCase()) ? currentAnswer.toUpperCase() : "A";
        answerEditorHtml = `
          <input data-grading-answer type="hidden" value="${escapeHTML(selected)}">
          <div class="solution-answer-choice-group solution-answer-choice-group-four" role="group" aria-label="Chọn đáp án chuẩn A, B, C hoặc D">
            ${["A", "B", "C", "D"]
              .map(
                opt => `
              <button type="button" class="solution-answer-choice ${selected === opt ? "is-selected" : ""}" data-grading-option="${opt}" aria-pressed="${selected === opt}">
                ${opt}
              </button>`
              )
              .join("")}
          </div>
        `;
      } else if (type === "true_false") {
        const norm = currentAnswer.toLowerCase();
        const selected = ["false", "sai", "s", "f"].includes(norm) ? "false" : "true";
        answerEditorHtml = `
          <input data-grading-answer type="hidden" value="${escapeHTML(selected)}">
          <div class="solution-answer-choice-group solution-answer-choice-group-two" role="group" aria-label="Chọn Đúng hoặc Sai">
            ${[
              ["true", "Đúng"],
              ["false", "Sai"]
            ]
              .map(
                ([opt, label]) => `
              <button type="button" class="solution-answer-choice ${selected === opt ? "is-selected" : ""}" data-grading-option="${opt}" aria-pressed="${selected === opt}">
                ${label}
              </button>`
              )
              .join("")}
          </div>
        `;
      } else {
        answerEditorHtml = `
          <input data-grading-answer type="text" value="${escapeHTML(currentAnswer)}" placeholder="Nhập đáp án đúng chuẩn...">
          <label style="margin-top:8px">
            Điểm chấm trực tiếp cho câu này (Tối đa ${maxPts} điểm — để trống sẽ tự khớp đáp án)
            <input data-grading-points-override type="number" step="0.05" min="0" max="${maxPts}" value="${item.earnedPoints != null ? escapeHTML(item.earnedPoints) : ""}" placeholder="Tự động theo đáp án đúng (${maxPts}đ)">
          </label>
        `;
      }

      return `
        <article class="solution-review-item" data-grading-item="${escapeHTML(targetId)}" data-grading-type="${escapeHTML(type)}" data-grading-max-points="${maxPts}" data-student-answer="${escapeHTML(studentAnswer)}">
          <div class="solution-review-head">
            <h3>${escapeHTML(targetId)} · ${escapeHTML(type)}</h3>
            <span class="grading-match-chip" data-grading-item-status>Đang đối chiếu…</span>
          </div>
          <div class="solution-review-grid">
            <section class="solution-review-pane">
              <h4>ĐỀ BÀI VÀ BÀI LÀM HỌC VIÊN</h4>
              <p><strong>${escapeHTML(item.questionText || `Câu ${targetId}`)}</strong></p>
              <div class="student-answer-highlight">
                <strong>Học viên chọn / trả lời:</strong> <span>${escapeHTML(displayStudentAnswer)}</span>
              </div>
              <p class="muted">${escapeHTML(item.explanation || "Đối chiếu đề bài bên trên với câu trả lời của học viên và chọn đáp án đúng ở khung bên phải.")}</p>
              <p class="muted tiny"><strong>Rubric chấm điểm:</strong><br>${escapeHTML(rubricSummaryText)}</p>
            </section>
            <section class="solution-review-pane">
              <h4>ĐÁP ÁN ĐÚNG (GIẢNG VIÊN CHẤM)</h4>
              <label>
                Đáp án chuẩn
                ${answerEditorHtml}
              </label>
              <label>
                Lời giải / ghi chú
                <textarea data-grading-explanation placeholder="Nhập lời giải chi tiết hoặc nhận xét cho câu này...">${escapeHTML(item.explanation || "")}</textarea>
              </label>
              <label>
                Rubric theo tiêu chí (JSON)
                <textarea data-grading-rubric>${escapeHTML(JSON.stringify(rubric, null, 2))}</textarea>
              </label>
            </section>
          </div>
        </article>
      `;
    })
    .join("");
}

function recalculateLiveGradingScore() {
  const dialog = document.getElementById("test-grading-dialog");
  if (!dialog) return;
  const items = [...dialog.querySelectorAll("[data-grading-item]")];
  if (!items.length) return;

  let totalMax = 0;
  let totalEarned = 0;
  const tfGroups = new Map();

  for (const item of items) {
    const targetId = item.dataset.gradingItem;
    const type = item.dataset.gradingType;
    const maxPts = Number(item.dataset.gradingMaxPoints) || 0.25;
    const studentAns = String(item.dataset.studentAnswer || "").trim().toLowerCase();
    const correctAns = String(item.querySelector("[data-grading-answer]")?.value || "").trim().toLowerCase();
    const overrideInput = item.querySelector("[data-grading-points-override]");
    const overrideVal = overrideInput && overrideInput.value.trim() !== "" ? Number(overrideInput.value) : null;
    const statusChip = item.querySelector("[data-grading-item-status]");

    let isMatch = false;
    if (type === "multiple_choice") {
      isMatch = correctAns !== "" && studentAns === correctAns;
    } else if (type === "true_false") {
      const normTf = v => (["true", "dung", "đúng", "d", "t"].includes(v) ? "true" : ["false", "sai", "s", "f"].includes(v) ? "false" : v);
      isMatch = normTf(correctAns) !== "" && normTf(studentAns) === normTf(correctAns);
    } else {
      isMatch = correctAns !== "" && studentAns.replace(/\s+/g, "") === correctAns.replace(/\s+/g, "");
    }

    if (type === "true_false" && /^[ivx]+-\d+[a-d]$/i.test(targetId)) {
      const qId = targetId.slice(0, -1);
      if (!tfGroups.has(qId)) tfGroups.set(qId, { correctCount: 0, total: 0 });
      const g = tfGroups.get(qId);
      g.total++;
      if (isMatch) g.correctCount++;
      if (statusChip) {
        statusChip.textContent = isMatch ? "✓ Học viên làm Đúng ý này" : "✗ Học viên làm Sai / Chưa khớp";
        statusChip.className = `grading-match-chip ${isMatch ? "is-correct" : "is-wrong"}`;
      }
      continue;
    }

    const earned = overrideVal != null && Number.isFinite(overrideVal)
      ? Math.max(0, Math.min(maxPts, overrideVal))
      : (isMatch ? maxPts : 0);

    totalMax += maxPts;
    totalEarned += earned;

    if (statusChip) {
      const ok = earned > 0;
      statusChip.textContent = `${ok ? "✓ Đúng" : "✗ Chưa đúng"} · +${earned.toFixed(2)}/${maxPts}đ`;
      statusChip.className = `grading-match-chip ${ok ? "is-correct" : "is-wrong"}`;
    }
  }

  for (const g of tfGroups.values()) {
    const weights = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };
    totalMax += 1.0;
    totalEarned += weights[g.correctCount] ?? 0;
  }

  const scaled = totalMax > 0 && Math.abs(totalMax - 10) > 0.01
    ? (totalEarned / totalMax) * 10
    : totalEarned;

  const scoreNode = dialog.querySelector("[data-grading-live-score]");
  if (scoreNode) {
    scoreNode.textContent = `Điểm chấm dự kiến: ${scaled.toFixed(2)} / 10.00`;
  }
}

export async function loadAdminTestsAndPendingGrading() {
  const reviewPanel = document.getElementById("admin-review-panel");
  if (!reviewPanel) return;

  let section = document.getElementById("admin-tests-grading-panel");
  if (!section) {
    section = document.createElement("div");
    section.id = "admin-tests-grading-panel";
    section.innerHTML = `
      <div class="section-head" style="margin-top:28px">
        <div>
          <span class="pill">GIẢNG VIÊN & ADMIN · QUẢN LÝ KIỂM TRA & CHẤM ĐIỂM</span>
          <h2>Bài kiểm tra chờ chấm</h2>
          <p class="muted">Khi giảng viên chọn chưa nhập đáp án ngay lúc đăng đề, bài làm của học viên sẽ xuất hiện tại đây với trạng thái “Đang chờ chấm”. Nhấn vào từng bài để mở khung đối chiếu đề bài (trái) và đáp án đúng (phải).</p>
        </div>
        <div class="tests-header-actions">
          <button type="button" class="button secondary small" data-export-teacher-sheets="xlsx">📊 Xuất điểm ra Sheets (.xlsx)</button>
          <button type="button" class="button secondary small" data-export-teacher-sheets="csv">📄 Xuất CSV (.csv)</button>
          <button type="button" class="button primary small" data-open-create-test>＋ Thêm bài kiểm tra</button>
        </div>
      </div>
      <div id="admin-pending-test-submissions-box"><p class="muted">Đang tải danh sách bài chờ chấm…</p></div>

      <div class="section-head" style="margin-top:28px">
        <div>
          <h2>Danh sách Bài kiểm tra trên hệ thống</h2>
          <p class="muted">Quản lý đề kiểm tra, thời gian đóng/mở, nhập/duyệt đáp án chuẩn và xuất bảng điểm theo từng đề.</p>
        </div>
      </div>
      <div id="admin-tests-table-box"><p class="muted">Đang tải danh sách bài kiểm tra…</p></div>
    `;
    reviewPanel.prepend(section);
  }

  const pendingBox = document.getElementById("admin-pending-test-submissions-box");
  if (pendingBox) {
    try {
      const res = await fetch("/api/admin/pending-test-submissions", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.submissions) ? data.submissions : [];
      if (!list.length) {
        pendingBox.innerHTML = '<p class="muted">Hiện chưa có bài nộp kiểm tra nào.</p>';
      } else {
        pendingBox.innerHTML = `
          <div class="admin-table-wrap admin-progress-scroll" role="region" aria-label="Danh sách bài kiểm tra chờ chấm">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Học viên</th>
                  <th>Bài kiểm tra</th>
                  <th>Môn / Lớp</th>
                  <th>Thời gian nộp</th>
                  <th>Trạng thái chấm</th>
                  <th>Điểm số</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${list
                  .map(sub => {
                    const isPending = sub.gradingStatus === "pending_grade" || !sub.graded;
                    return `
                      <tr>
                        <td>
                          <strong>${escapeHTML(sub.userName)}</strong><br>
                          <span class="muted tiny">${escapeHTML(sub.userEmail)}</span>
                        </td>
                        <td>
                          <strong>${escapeHTML(sub.title)}</strong>
                          ${sub.autoSubmittedFullscreen ? '<br><span class="muted tiny" style="color:var(--orange)">Thoát toàn màn hình (Tự động nộp)</span>' : ""}
                        </td>
                        <td>${escapeHTML(sub.subject)} · Lớp ${escapeHTML(sub.grade)}</td>
                        <td>${escapeHTML(formatTestDateTime(sub.submittedAt))}</td>
                        <td>
                          <span class="test-status-badge ${isPending ? "is-incomplete" : "is-completed"}">
                            ${isPending ? "● Đang chờ chấm" : "● Đã chấm"}
                          </span>
                        </td>
                        <td>
                          <strong>${isPending ? "Đang chờ chấm" : `${Number(sub.score ?? 0).toFixed(2)}/${sub.scale || 10}`}</strong>
                        </td>
                        <td>
                          <button type="button" class="button ${isPending ? "primary" : "secondary"} small" data-open-grade-submission="${sub.id}">
                            ${isPending ? "✎ Chấm bài" : "Xem / Chấm lại"}
                          </button>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (error) {
      pendingBox.innerHTML = `<p class="auth-error">${escapeHTML(error.message)}</p>`;
    }
  }

  const testsBox = document.getElementById("admin-tests-table-box");
  if (testsBox) {
    try {
      await refreshTestsQueue();
      if (!cachedTests.length) {
        testsBox.innerHTML = '<p class="muted">Chưa có bài kiểm tra nào.</p>';
      } else {
        testsBox.innerHTML = `
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Tên bài kiểm tra</th>
                  <th>Môn / Lớp</th>
                  <th>Ngày mở — Hạn cuối</th>
                  <th>Thời gian làm</th>
                  <th>Cơ chế đáp án</th>
                  <th>Lượt nộp</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${cachedTests
                  .map(
                    t => `
                  <tr>
                    <td>
                      <strong>${escapeHTML(t.title)}</strong><br>
                      <span class="muted tiny">${escapeHTML(t.originalName || t.filename || "")}</span>
                    </td>
                    <td>${escapeHTML(t.subject)} · Lớp ${escapeHTML(t.grade)}</td>
                    <td>
                      <span class="tiny">Mở: <strong>${escapeHTML(formatTestDateTime(t.openAt))}</strong></span><br>
                      <span class="tiny">Đóng: <strong>${escapeHTML(formatTestDateTime(t.closeAt))}</strong></span>
                    </td>
                    <td>${t.durationMinutes ? `${t.durationMinutes} phút` : "Không giới hạn"}</td>
                    <td>
                      <span class="answer-key-status ${t.hasApprovedAnswers ? "is-ready" : ""}">
                        ${t.hasApprovedAnswers ? "Đã có đáp án chuẩn" : "Chưa nhập đáp án (Chờ chấm)"}
                      </span>
                    </td>
                    <td>
                      ${t.totalSubmissionsCount || 0} bài nộp
                      ${t.pendingGradingCount > 0 ? `<br><strong style="color:#d97706">${t.pendingGradingCount} chờ chấm</strong>` : ""}
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button type="button" class="button secondary small" data-test-answer-pipeline="${escapeHTML(t.id)}">
                          ${t.hasApprovedAnswers ? "Xem / Sửa đáp án" : "Nhập đáp án"}
                        </button>
                        <a class="button secondary small" href="/api/admin/tests/export-sheets?testId=${encodeURIComponent(t.id)}&format=xlsx" target="_blank" rel="noopener">Xuất điểm</a>
                        <button type="button" class="button danger small" data-delete-test="${escapeHTML(t.id)}">Xóa</button>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (error) {
      testsBox.innerHTML = `<p class="auth-error">${escapeHTML(error.message)}</p>`;
    }
  }
}

export function wireTestsEvents({ onNavigate, onStartTest, onOpenSavedTestSubmission }) {
  document.addEventListener("change", event => {
    const statusSelect = event.target.closest("[data-test-filter-status]");
    if (statusSelect) {
      queueFilterStatus = statusSelect.value || "all";
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      return;
    }
    const subjectSelect = event.target.closest("[data-test-filter-subject]");
    if (subjectSelect) {
      queueFilterSubject = subjectSelect.value || "all";
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      return;
    }
    const answerModeRadio = event.target.closest('input[name="answerMode"]');
    if (answerModeRadio) {
      const form = answerModeRadio.closest("form");
      const immediateBox = form?.querySelector("[data-immediate-answer-options]");
      if (immediateBox) {
        immediateBox.hidden = answerModeRadio.value === "deferred";
      }
    }
  });

  document.addEventListener("input", event => {
    if (event.target.closest("#test-grading-dialog")) {
      recalculateLiveGradingScore();
    }
  });

  document.addEventListener("click", async event => {
    if (event.target.closest("[data-open-create-test]")) {
      event.preventDefault();
      openCreateTestDialog();
      return;
    }

    if (event.target.closest("[data-test-queue-refresh]")) {
      event.preventDefault();
      await refreshTestsQueue();
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      toast("Đã làm mới danh sách bài kiểm tra.", "success");
      return;
    }

    const startBtn = event.target.closest('[data-action="start-test"]');
    if (startBtn) {
      event.preventDefault();
      const testId = startBtn.dataset.id;
      if (onStartTest) onStartTest(testId);
      return;
    }

    const viewSubBtn = event.target.closest('[data-action="view-test-submission"]');
    if (viewSubBtn) {
      event.preventDefault();
      const subId = viewSubBtn.dataset.id;
      if (onOpenSavedTestSubmission) onOpenSavedTestSubmission(subId);
      return;
    }

    const pipelineBtn = event.target.closest("[data-test-answer-pipeline]");
    if (pipelineBtn) {
      event.preventDefault();
      const testId = pipelineBtn.dataset.testAnswerPipeline;
      try {
        await fetch(`/api/admin/documents/${encodeURIComponent(testId)}/solution/manual`, {
          method: "POST",
          credentials: "same-origin"
        });
        window.dispatchEvent(new CustomEvent("maihoc-exam-solution-job", { detail: { id: testId } }));
      } catch (error) {
        toast(error.message || "Không thể mở trình quản lý đáp án.", "error");
      }
      return;
    }

    const deleteBtn = event.target.closest("[data-delete-test]");
    if (deleteBtn) {
      event.preventDefault();
      const testId = deleteBtn.dataset.deleteTest;
      const testObj = findCachedTest(testId);
      if (!confirm(`Bạn có chắc chắn muốn xóa bài kiểm tra "${testObj?.title || testId}"?`)) return;
      deleteBtn.disabled = true;
      try {
        const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}`, {
          method: "DELETE",
          credentials: "same-origin"
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Không thể xóa bài kiểm tra.");
        toast(data.message || "Đã xóa bài kiểm tra.", "success");
        await refreshTestsQueue();
        window.dispatchEvent(new Event("maihoc-documents-changed"));
        window.dispatchEvent(new Event("maihoc-tests-rerender"));
        loadAdminTestsAndPendingGrading();
      } catch (error) {
        toast(error.message || "Lỗi khi xóa bài kiểm tra.", "error");
        deleteBtn.disabled = false;
      }
      return;
    }

    const gradeSubBtn = event.target.closest("[data-open-grade-submission]");
    if (gradeSubBtn) {
      event.preventDefault();
      openTestGradingDialog(gradeSubBtn.dataset.openGradeSubmission);
      return;
    }

    const gradingOpt = event.target.closest("[data-grading-option]");
    if (gradingOpt) {
      event.preventDefault();
      const item = gradingOpt.closest("[data-grading-item]");
      const input = item?.querySelector("[data-grading-answer]");
      if (!item || !input) return;
      const val = gradingOpt.dataset.gradingOption;
      input.value = val;
      item.querySelectorAll("[data-grading-option]").forEach(btn => {
        const selected = btn === gradingOpt;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      });
      const maxPts = Number(item.dataset.gradingMaxPoints) || 0.25;
      const rubricArea = item.querySelector("[data-grading-rubric]");
      if (rubricArea) {
        const label = val === "true" ? "Đúng" : val === "false" ? "Sai" : `phương án ${val}`;
        rubricArea.value = JSON.stringify([{ criterion: `Chọn đúng ${label}`, points: maxPts }], null, 2);
      }
      recalculateLiveGradingScore();
      return;
    }

    const togglePaperBtn = event.target.closest("[data-grading-toggle-paper]");
    if (togglePaperBtn) {
      event.preventDefault();
      const box = document.querySelector("#test-grading-dialog [data-grading-paper-preview]");
      if (!box || !activeGradingContext) return;
      if (box.hidden) {
        box.hidden = false;
        box.innerHTML = `<iframe src="${escapeHTML(activeGradingContext.fileUrl)}" title="Đề bài gốc"></iframe>`;
      } else {
        box.hidden = true;
      }
      return;
    }

    const saveGradeBtn = event.target.closest("[data-grading-save]");
    if (saveGradeBtn) {
      event.preventDefault();
      if (!activeGradingContext) return;
      const dialog = document.getElementById("test-grading-dialog");
      const errorEl = dialog?.querySelector("[data-grading-error]");
      if (errorEl) errorEl.hidden = true;

      try {
        const items = [...dialog.querySelectorAll("[data-grading-item]")];
        const questions = items.map(item => {
          const targetId = item.dataset.gradingItem;
          const type = item.dataset.gradingType;
          const maximumPoints = Number(item.dataset.gradingMaxPoints) || 0.25;
          const answer = String(item.querySelector("[data-grading-answer]")?.value || "").trim();
          if (!answer) {
            throw new Error(`Vui lòng chọn hoặc nhập đáp án đúng cho câu ${targetId}.`);
          }
          const explanation = String(item.querySelector("[data-grading-explanation]")?.value || "").trim();
          const rubricText = String(item.querySelector("[data-grading-rubric]")?.value || "[]").trim();
          let rubric = [];
          try {
            rubric = JSON.parse(rubricText);
          } catch {
            throw new Error(`Rubric câu ${targetId} phải là JSON hợp lệ.`);
          }
          const overrideEl = item.querySelector("[data-grading-points-override]");
          const pointsAwarded = overrideEl && overrideEl.value.trim() !== "" ? Number(overrideEl.value) : undefined;
          return {
            targetId,
            type,
            maximumPoints,
            answer,
            explanation,
            rubric,
            pointsAwarded
          };
        });

        const saveAsKey = Boolean(dialog.querySelector("[data-grading-save-as-key]")?.checked);
        const teacherNote = String(dialog.querySelector("[data-grading-teacher-note]")?.value || "").trim();

        saveGradeBtn.disabled = true;
        const response = await fetch(`/api/admin/test-submissions/${encodeURIComponent(activeGradingContext.submissionId)}/grade`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions, saveAsTestAnswerKey: saveAsKey, teacherNote })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Không thể lưu kết quả chấm bài.");

        closeDialog("test-grading-dialog");
        toast(result.message || "Đã lưu điểm trên hệ thống.", "success");
        await refreshTestsQueue();
        loadAdminTestsAndPendingGrading();
        window.dispatchEvent(new Event("maihoc-tests-rerender"));
      } catch (error) {
        if (errorEl) {
          errorEl.textContent = error.message;
          errorEl.hidden = false;
        }
      } finally {
        saveGradeBtn.disabled = false;
      }
      return;
    }

    const exportUserBtn = event.target.closest("[data-export-user-sheets]");
    if (exportUserBtn) {
      event.preventDefault();
      const fmt = exportUserBtn.dataset.exportUserSheets || "xlsx";
      window.location.href = `/api/learning-results/export-sheets?format=${encodeURIComponent(fmt)}`;
      toast("Đang tải xuống tệp Sheets kết quả học tập của bạn…", "success");
      return;
    }

    const exportTeacherBtn = event.target.closest("[data-export-teacher-sheets]");
    if (exportTeacherBtn) {
      event.preventDefault();
      const fmt = exportTeacherBtn.dataset.exportTeacherSheets || "xlsx";
      const subj = queueFilterSubject !== "all" ? `&subject=${encodeURIComponent(queueFilterSubject)}` : "";
      window.location.href = `/api/admin/tests/export-sheets?format=${encodeURIComponent(fmt)}${subj}`;
      toast("Đang xuất bảng điểm Bài kiểm tra ra tệp Sheets…", "success");
      return;
    }
  });

  const createForm = document.getElementById("create-test-form");
  createForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const submitBtn = createForm.querySelector('button[type="submit"]');
    const origText = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Đang tải lên…";
    }
    try {
      const fd = new FormData(createForm);
      const response = await fetch("/api/admin/tests", {
        method: "POST",
        credentials: "same-origin",
        body: fd
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thể tạo bài kiểm tra.");

      closeDialog("create-test-dialog");
      createForm.reset();
      await refreshTestsQueue();
      window.dispatchEvent(new Event("maihoc-documents-changed"));
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      loadAdminTestsAndPendingGrading();
      toast(result.message || "Đã tạo bài kiểm tra mới.", "success");

      if (result.solutionJob?.id) {
        window.dispatchEvent(new CustomEvent("maihoc-exam-solution-job", { detail: result.solutionJob }));
      }
    } catch (error) {
      toast(error.message || "Không thể tạo bài kiểm tra.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (origText) submitBtn.textContent = origText;
      }
    }
  });
}
