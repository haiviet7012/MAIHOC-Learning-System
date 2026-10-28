import { SUBJECTS, CATEGORIES } from "./data.js";
import { initTheme } from "./theme.js";
import { $, $$, escapeHTML, toast, openDialog, closeDialog, pageHeading } from "./ui.js";
import {
    getDocuments,
    refreshDocuments,
    uploadDocument
} from "./documents.js";
import { evaluateDifficulty } from "./ai.js";
import { mountPdfReader } from "./pdf-reader.js";
import { applyQuestionLayout, extractDocxText, parseQuestionText, questionSummary } from "./question-parser.js";
import "./account-features.js";
const view = $("#view");
const state = { route: "home", subject: "Toán", grade: "10", category: "theory", docId: null, examDocId: null, answers: {}, gradeResult: null, savedExamResult: null, timer: null, remaining: 5400, warningShown: false, examStarted: false, examFinished: false };
let currentUser = null;
let activeExamQuestions = [];
let activeExamQuestionsFor = null;
let examLayoutConfig = null;
const gradeLabel = g => `Lớp ${g}`;
try {
    const response = await fetch("/configs/exam-layouts.json", { cache: "no-store" });
    if (response.ok) examLayoutConfig = await response.json();
} catch (error) {
    console.warn("Could not load assessment layout config:", error.message);
}
await refreshDocuments();
// Luôn đọc danh sách mới nhất từ documents.js.
const docs = () => getDocuments();
const findDoc = id =>
    docs().find(d => String(d.id) === String(id));
const by = (grade, category) =>
    docs().filter(
        d =>
            d.subject === "Toán" &&
            String(d.grade) === String(grade) &&
            d.category === category
    );
const categoryName = k => CATEGORIES[k]?.label || k;
const currentDocumentCategory = () => state.route === "reader"
    ? findDoc(state.docId)?.category
    : ({
        theory: "theory",
        "theory-list": "theory",
        practice: "practice",
        "practice-list": "practice",
        "exam-select": "exam",
        "exam-list": "exam",
        "exercise-list": "exercise",
    })[state.route];
function setUploadCategory(category) {
    const select = $("#upload-form").elements.category;
    if (category && [...select.options].some(option => option.value === category)) select.value = category;
    select.dispatchEvent(new Event("change"));
}
function saveRouteHistory() {
    const savedState = { ...state, timer: null };
    // Sao lưu đáp án để có thể khôi phục khi quay lại.
    savedState.answers = { ...state.answers };
    return {
        maihoc: true,
        appState: savedState
    };
}
function go(route, params = {}) {
    if (state.route === "reader" && (route !== "reader" || String(params.docId ?? state.docId) !== String(state.docId))) {
        window.dispatchEvent(new Event("maihoc-reader-leaving"));
    }
    stopTimerIfLeaving(route);
    Object.assign(state, params);
    state.route = route;
    // Ghi trang mới vào lịch sử điều hướng của Chrome.
    history.pushState(saveRouteHistory(), "", window.location.href);
    render();
    if (route === "exam") window.scrollTo(0, 0);
}
// Khởi tạo lịch sử cho trang MAI HỌC hiện tại.
history.replaceState(saveRouteHistory(), "", window.location.href);
// Khôi phục trang khi nhấn Back hoặc Forward.
window.addEventListener("popstate", function (event) {
    const saved = event.state;
    // Nếu trạng thái trước đó thuộc MAI HỌC,
    // khôi phục trang đó và không chuyển sang Google.
    if (saved?.maihoc && saved.appState) {
        const previousRoute = saved.appState.route;
        if (state.route === "reader" && (previousRoute !== "reader" || String(saved.appState.docId) !== String(state.docId))) {
            window.dispatchEvent(new Event("maihoc-reader-leaving"));
        }
        stopTimerIfLeaving(previousRoute);
        Object.assign(state, saved.appState);
        state.timer = null;
        render();
        if (state.route === "exam") window.scrollTo(0, 0);
        return;
    }
    // Không tự chuyển hướng khi gặp trạng thái không xác định.
    // Để Chrome xử lý lịch sử điều hướng bình thường.
});
function stopTimerIfLeaving(route) { if (state.route === "exam" && route !== "exam" && state.timer) {
    clearInterval(state.timer);
    state.timer = null;
} }
function breadcrumb(title) { return `<div class="breadcrumb"><button data-route="home">Trang chủ</button><span>/</span><button data-route="subject">Toán</button><span>/</span><span>${escapeHTML(title)}</span></div>`; }
function homePage() {
    return `<section class="hero">
    <div class="hero-bg" aria-hidden="true"></div><div class="hero-copy"><p class="eyebrow">KHÔNG GIAN HỌC TẬP CỦA BẠN</p><h1>Học chắc nền tảng.<br>Vững vàng bứt phá.</h1><p>Ôn tập lý thuyết, luyện bài tập và thử sức với phòng thi mô phỏng — bắt đầu với môn Toán.</p><div class="hero-actions"><button class="button secondary" data-route="subject">Khám phá môn Toán →</button><button class="button secondary" data-action="browse-subjects">Chọn môn học</button></div></div><div class="hero-art"><img class="hero-logo" src="/images/mai-hoc-logo.jpg" alt="Logo MAI HỌC"></div></section>
<section class="section-head"><div><h2>Bắt đầu hành trình</h2><p>Chọn cách học phù hợp với bạn.</p></div><span class="pill">MÔN TOÁN ĐANG HOẠT ĐỘNG</span></section>
<div class="grid three">
 <article class="card clickable resource-card" data-route="theory"><div class="card-icon">▤</div><span class="pill">NẮM VỮNG KIẾN THỨC</span><h3>Ôn tập lý thuyết</h3><p>Hệ thống kiến thức theo lớp, đọc tài liệu trực tiếp trên trang.</p></article>
 <article class="card clickable resource-card" data-route="practice"><div class="card-icon">✎</div><span class="pill">LUYỆN TẬP</span><h3>Ôn tập theo đề</h3><p>Thực hành câu hỏi, tự kiểm tra và xem đáp án khi có dữ liệu.</p></article>
 <article class="card clickable resource-card" data-route="exam-select"><div class="card-icon">◷</div><span class="pill">90 PHÚT</span><h3>Phòng thi thử</h3><p>Làm bài với đồng hồ đếm ngược và xác nhận trước khi nộp.</p></article>
</div>
<section class="section-head"><div><h2>Chọn lớp để học</h2><p>Nội dung được tổ chức theo chương trình THPT.</p></div></section>
<div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="choose-grade" data-grade="${g}"><div><span class="pill">TOÁN HỌC</span><div class="grade">${gradeLabel(g)}</div><p>Ôn tập · Bài tập · Đề thi thử</p></div><span class="arrow">↗</span></article>`).join("")}</div>
<p class="footer-note">MAI HỌC · Học tập theo nhịp độ của riêng bạn.</p>`;
}
function subjectPickerPage() {
    const subjects = [
        { name: "Toán", icon: "∑", active: true, items: ["Ôn tập lý thuyết", "Làm đề ôn tập", "Phòng thi thử (có tính giờ)"] },
        { name: "Vật lý", icon: "⚛", items: ["Ôn tập lý thuyết", "Làm đề ôn tập", "Phòng thi thử (có tính giờ)"] },
        { name: "Hóa học", icon: "⚗", items: ["Ôn tập lý thuyết", "Làm đề ôn tập", "Phòng thi thử (có tính giờ)"] },
        { name: "Sinh học", icon: "❧", items: ["Ôn tập lý thuyết", "Làm đề ôn tập", "Phòng thi thử (có tính giờ)"] },
        { name: "Tiếng Anh", icon: "A", items: ["Ôn tập lý thuyết", "Làm đề ôn tập", "Phòng thi thử (có tính giờ)"] },
        { name: "Ngữ văn", icon: "文", items: ["Ôn tập lý thuyết", "Làm đề ôn tập", "Phòng thi thử (có tính giờ)"] },
        { name: "IELTS", icon: "✦", items: ["Ôn tập theo kỹ năng", "Thư viện tài liệu", "Phòng thi thử (có tính giờ)"] },
        { name: "Đề thi THPT quốc gia", icon: "▤", items: ["Đề thi các năm trước", "Đề thi thử trường / sở", "Phòng thi thử có tính giờ"] }
    ];
    return `<section class="subject-picker"><div class="subject-picker-bar"><span>KHÁM PHÁ CÁC MÔN HỌC</span><button class="button secondary small" data-route="home">← Trang chủ</button></div><div class="subject-picker-intro"><div><p class="eyebrow">MAI HỌC · LEARN · PRACTICE · GROW</p><h1>Chọn môn học</h1><p>Chọn môn để khám phá tài liệu, luyện tập và phòng thi thử.</p></div><span class="pill">TOÁN ĐANG HOẠT ĐỘNG</span></div><div class="subject-picker-grid">${subjects.map(x => `<article class="subject-tile ${x.active ? "is-active" : "is-coming"}" ${x.active ? 'data-action="open-math" role="button" tabindex="0"' : 'data-action="coming-subject" data-name="' + x.name + '" role="button" tabindex="0"'}><div class="subject-tile-head"><span class="subject-tile-icon">${x.icon}</span><div><h2>${escapeHTML(x.name)}</h2><span class="subject-status">${x.active ? "ĐANG HOẠT ĐỘNG" : "SẮP RA MẮT"}</span></div></div><ul>${x.items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul><div class="subject-tile-footer">${x.active ? "Khám phá môn học" : "Đang phát triển"} <span>→</span></div></article>`).join("")}</div></section>`;
}
function subjectPage() {
    return `${pageHeading("Môn Toán", "Chọn một khu vực học tập để tiếp tục.")}<div class="grid three">
${[{ r: "theory", i: "▤", t: "Ôn tập lý thuyết", d: "Đọc tài liệu và hệ thống kiến thức theo từng lớp." }, { r: "practice", i: "✎", t: "Đề thi ôn tập", d: "Luyện tập theo bộ đề và chủ đề." }, { r: "exam-select", i: "◷", t: "Phòng thi thử", d: "Thi mô phỏng có giới hạn thời gian 90 phút." }].map(x => `<article class="card clickable resource-card" data-route="${x.r}"><div class="card-icon">${x.i}</div><h3>${x.t}</h3><p>${x.d}</p><p style="margin-top:18px;color:var(--primary);font-weight:600">Mở mục →</p></article>`).join("")}</div><section class="section-head"><div><h2>Thư viện tài liệu</h2><p>${docs().filter(d => d.subject === "Toán").length} tài liệu mẫu và tài liệu đã tải lên trong phiên này.</p></div></section><div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="choose-grade" data-grade="${g}"><div><div class="grade">${gradeLabel(g)}</div><p>${docs().filter(d => d.subject === "Toán" && d.grade === g).length} tài liệu</p></div><span class="arrow">↗</span></article>`).join("")}</div>`;
}
function gradePicker(route, category) { return `${pageHeading(category ? categoryName(category) : "Chọn lớp", "Chọn khối lớp để xem tài liệu môn Toán.")}<div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="select-grade-route" data-grade="${g}" data-next="${route}" data-category="${category || ""}"><div><span class="pill">MÔN TOÁN</span><div class="grade">${gradeLabel(g)}</div><p>${category ? by(g, category).length + " tài liệu" : "Chọn nội dung học"}</p></div><span class="arrow">→</span></article>`).join("")}</div>`; }
function resourceListPage(category, grade) {
    const list = by(grade, category);
    const isAssessment = category === "practice" || category === "exam";
    return `${pageHeading(`${categoryName(category)} \u2014 ${gradeLabel(grade)}`, `T\u00e0i li\u1ec7u m\u00f4n To\u00e1n ${gradeLabel(grade).toLowerCase()}.`)}<div class="stat-row"><div class="stat"><span class="muted">T\u00e0i li\u1ec7u</span><strong>${list.length}</strong></div><div class="stat"><span class="muted">M\u00f4n h\u1ecdc</span><strong>To\u00e1n</strong></div><div class="stat"><span class="muted">Kh\u1ed1i l\u1edbp</span><strong>${grade}</strong></div></div>${list.length ? `<div class="resource-list">${list.map(d => `<div class="resource-row"><div class="card-icon">${CATEGORIES[d.category]?.icon || "\u25a7"}</div><div class="resource-main"><h3>${escapeHTML(d.title)}</h3><p>${escapeHTML(d.description || "T\u00e0i li\u1ec7u m\u00f4n To\u00e1n")} \u00b7 ${d.sample ? "T\u00e0i li\u1ec7u m\u1eabu" : d.localOnly ? "L\u01b0u trong tr\u00ecnh duy\u1ec7t" : "\u0110\u00e3 t\u1ea3i l\u00ean"}</p></div><div class="resource-actions"><button class="button secondary small" data-action="read-doc" data-id="${escapeHTML(d.id)}">M\u1edf t\u00e0i li\u1ec7u</button>${isAssessment ? `<button class="button primary small" data-action="start-exam" data-id="${escapeHTML(d.id)}">${category === "practice" ? "L\u00e0m b\u00e0i c\u00f3 ch\u1ea5m \u0111i\u1ec3m" : "B\u1eaft \u0111\u1ea7u thi"}</button>` : ""}</div></div>`).join("")}</div>` : `<div class="empty-state"><h3>Ch\u01b0a c\u00f3 t\u00e0i li\u1ec7u cho m\u1ee5c n\u00e0y</h3><p>H\u00e3y upload t\u00e0i li\u1ec7u b\u1eb1ng n\u00fat \u1edf thanh tr\u00ean ho\u1eb7c ch\u1ecdn l\u1edbp kh\u00e1c.</p><button class="button primary" data-action="open-upload" data-category="${category}">Upload t\u00e0i li\u1ec7u</button></div>`}`;
}
function examSelectPage() { return `${pageHeading("Phòng thi thử", "Chọn khối lớp và đề thi. Mỗi lượt thi có thời gian tối đa 90 phút.")}<div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="select-grade-route" data-grade="${g}" data-next="exam-list" data-category="exam"><div><span class="pill">THI THỬ · 90 PHÚT</span><div class="grade">${gradeLabel(g)}</div><p>${by(g, "exam").length} đề thi có sẵn</p></div><span class="arrow">→</span></article>`).join("")}</div>`; }
function examListPage(grade) { const list = by(grade, "exam"); return `${pageHeading(`Chọn đề thi — ${gradeLabel(grade)}`, "Mỗi đề có thời gian 90 phút. Độ khó được AI đánh giá khi backend Gemini đã được cấu hình.")}${list.length ? `<div class="exam-list">${list.map((d, i) => `<article class="exam-card"><span class="pill">ĐỀ ${String(i + 1).padStart(2, "0")}</span><h3>${escapeHTML(d.title)}</h3><div class="exam-meta"><span>◷ Thời gian: 90 phút</span><span>✦ Độ khó: AI đánh giá</span><span>▤ ${gradeLabel(d.grade)}</span></div><button class="button secondary" data-action="evaluate" data-id="${d.id}">Đánh giá độ khó bằng AI</button><button class="button primary" data-action="start-exam" data-id="${d.id}">Vào phòng thi →</button></article>`).join("")}</div>` : `<div class="empty-state"><h3>Chưa có đề thi cho lớp ${grade}</h3><p>Upload đề thi thử để bắt đầu.</p><button class="button primary" data-action="open-upload">Upload đề thi</button></div>`}<p class="footer-note">Đề thi mẫu là dữ liệu minh họa; nội dung và thang điểm cần được quản trị viên bổ sung.</p>`; }
function readerPage() {
    const d = findDoc(state.docId);
    if (!d) return subjectPage();

    const related = docs().filter(item => item.subject === d.subject
        && String(item.grade) === String(d.grade)
        && item.category === d.category
        && String(item.id) !== String(d.id));
    const candidateUrl = d.fileUrl || d.fileURL || d.url || d.downloadUrl || d.downloadURL || "";
    let fileUrl = "";
    try {
        const parsedUrl = new URL(candidateUrl, window.location.origin);
        if (parsedUrl.origin === window.location.origin) {
            fileUrl = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
        }
    } catch { /* Keep the document unavailable when it has no safe local URL. */ }

    const filename = d.originalName || d.filename || "";
    const extension = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
    let documentContent;
    if (d.content) {
        documentContent = `<pre class="document-text">${escapeHTML(d.content)}</pre>`;
    } else if (fileUrl && extension === "pdf") {
        documentContent = `<div class="document-viewer pdf-reader" data-pdf-reader data-pdf-url="${escapeHTML(fileUrl)}"></div>`;
    } else if (fileUrl && extension === "txt") {
        documentContent = `<div class="document-viewer"><iframe src="${escapeHTML(fileUrl)}" title="${escapeHTML(d.title)}" loading="eager"></iframe><p><a href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">Mở tài liệu trong tab mới</a></p></div>`;
    } else if (fileUrl && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) {
        documentContent = `<div class="document-viewer"><img src="${escapeHTML(fileUrl)}" alt="${escapeHTML(d.title)}"><p><a href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">Mở ảnh trong tab mới</a></p></div>`;
    } else if (fileUrl) {
        documentContent = `<div class="empty-state"><h3>${escapeHTML(d.title)}</h3><p>Trình duyệt chưa hỗ trợ xem trực tiếp định dạng này. Bạn có thể tải tệp về để mở.</p><a class="button primary" href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">Tải tài liệu</a></div>`;
    } else {
        documentContent = `<div class="empty-state"><h3>${escapeHTML(d.title)}</h3><p>Tệp chưa có đường dẫn xem. Hãy tải lại danh sách tài liệu hoặc nhờ quản trị viên kiểm tra tệp đã tải lên.</p></div>`;
    }

    const backRoute = d.category === "exam" ? "exam-select" : d.category === "practice" ? "practice" : "theory";
    return `${pageHeading(d.title, `${escapeHTML(d.subject)} · ${gradeLabel(d.grade)} · ${categoryName(d.category)}`)}
      <div class="reader-layout" id="reader-layout" data-reader-id="${escapeHTML(d.id)}" data-reader-title="${escapeHTML(d.title)}" data-reader-subject="${escapeHTML(d.subject)}" data-reader-grade="${escapeHTML(d.grade)}">
        <section class="reader-main">
          <div class="reading-progress"><div class="reading-progress-label"><span>Tiến trình đọc</span><strong data-reading-percent>0%</strong></div><div class="reading-progress-track"><span data-reading-bar></span></div></div>
          ${documentContent}
          <div class="modal-actions"><button class="button secondary" data-route="${backRoute}">← Quay lại danh sách</button>${d.category === "exam" ? `<button class="button primary" data-action="start-exam" data-id="${escapeHTML(d.id)}">Bắt đầu thi thử</button>` : ""}</div>
        </section>
        <aside class="reader-side"><h3>Tài liệu cùng lớp</h3>${related.length ? related.map(item => `<button class="button ghost small" data-action="read-doc" data-id="${escapeHTML(item.id)}">${escapeHTML(item.title)}</button>`).join("") : `<p class="muted">Chưa có tài liệu liên quan.</p>`}</aside>
      </div>`;
}
function questionsFor(doc) {
    if (activeExamQuestionsFor === String(doc?.id)) return activeExamQuestions;
    const layout = assessmentLayoutFor(doc);
    const isInlineSample = Boolean(doc?.sample && doc?.content);
    const parsedSource = parseQuestionText(doc?.content || "");
    if (parsedSource.length) {
        return applyQuestionLayout(parsedSource, layout, { fillMissing: !isInlineSample });
    }
    if (Array.isArray(doc?.questionIds) && doc.questionIds.length) {
        const fromIds = doc.questionIds.map((id, index) => ({ id: String(id), number: String(id), documentOrder: index, type: "essay", text: `Câu ${id}`, options: [], statements: [] }));
        return applyQuestionLayout(fromIds, layout, { fillMissing: !isInlineSample });
    }
    if (layout && !doc?.content) {
        return applyQuestionLayout([], layout, { fillMissing: true });
    }
    return [];
}
function assessmentLayoutFor(doc) {
    if (!doc || !["practice", "exam"].includes(doc.category)) return null;
    const normalizeKey = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").replace(/[^a-z0-9]/g, "");
    const subjectKey = Object.keys(examLayoutConfig?.subjects || {}).find(key => normalizeKey(key) === normalizeKey(doc.subject));
    const subjectConfig = subjectKey ? examLayoutConfig.subjects[subjectKey] : null;
    return subjectConfig?.[doc.category] || subjectConfig?.assessment || null;
}
function gradingScaleFor(doc) {
    const normalizeKey=value=>String(value||"").normalize("NFD").replace(/\p{M}/gu,"").replace(/[Ä‘Ä]/g,"d").toLocaleLowerCase("vi").replace(/[^a-z0-9]/g,"");
    const subjectKey=Object.keys(examLayoutConfig?.subjects||{}).find(key=>normalizeKey(key)===normalizeKey(doc?.subject));
    const scale=Number(examLayoutConfig?.subjects?.[subjectKey]?.grading?.scale);
    return scale>0?scale:10;
}
function answerFields(questions, waitingForSource = false, layout = null) {
    if (!questions.length) {
        return `<p class="muted">${waitingForSource ? "\u0110ang \u0111\u1ecdc c\u1ea5u tr\u00fac c\u00e2u h\u1ecfi t\u1eeb t\u1ec7p\u2026" : "Ch\u01b0a tr\u00edch xu\u1ea5t \u0111\u01b0\u1ee3c c\u00e2u h\u1ecfi t\u1eeb t\u1ec7p."}</p>`;
    }
    const groups = Array.isArray(layout?.sections) && layout.sections.length
        ? layout.sections.map((section, index) => ({ type: section.type, title: section.title || section.type, order: Number(section.order) || index + 1 }))
        : [
        { type: "multiple_choice", title: "Tr\u1eafc nghi\u1ec7m" },
        { type: "true_false", title: "\u0110\u00fang / Sai" },
        { type: "essay", title: "T\u1ef1 lu\u1eadn / Tr\u1ea3 l\u1eddi ng\u1eafn" }
    ];
    const renderQuestion = question => {
        const id = String(question.answerId || question.id);
        const questionNumber = String(question.number || id.split("-").pop());
        const label = `C\u00e2u ${questionNumber}:`;
        const headingId = `answer-question-${id}`;
        if (question.type === "multiple_choice") {
            return `<div class="question answer-question" role="group" aria-labelledby="${escapeHTML(headingId)}"><h3 id="${escapeHTML(headingId)}">${escapeHTML(label)}</h3><div class="answer-choice-list">${question.options.map(option => `<label class="answer-choice"><input type="checkbox" aria-label="C\u00e2u ${escapeHTML(questionNumber)}, \u0111\u00e1p \u00e1n ${escapeHTML(option.id)}" data-answer-choice="${escapeHTML(id)}" data-answer-option="${escapeHTML(option.id)}" ${state.answers[id] === option.id ? "checked" : ""}><span><strong>${escapeHTML(option.id)}</strong></span></label>`).join("")}</div></div>`;
        }
        if (question.type === "true_false") {
            return `<div class="question answer-question" role="group" aria-labelledby="${escapeHTML(headingId)}"><h3 id="${escapeHTML(headingId)}">${escapeHTML(label)}</h3>${question.statements.map(statement => {
                const answerId = `${id}${statement.id}`;
                return `<div class="true-false-row"><label><input type="checkbox" aria-label="C\u00e2u ${escapeHTML(questionNumber)}, m\u1ec7nh \u0111\u1ec1 ${escapeHTML(statement.id)}, \u0110\u00fang" data-answer-true-false="${escapeHTML(id)}" data-answer-statement="${escapeHTML(statement.id)}" data-answer-value="true" ${state.answers[answerId] === "true" ? "checked" : ""}> \u0110</label><label><input type="checkbox" aria-label="C\u00e2u ${escapeHTML(questionNumber)}, m\u1ec7nh \u0111\u1ec1 ${escapeHTML(statement.id)}, Sai" data-answer-true-false="${escapeHTML(id)}" data-answer-statement="${escapeHTML(statement.id)}" data-answer-value="false" ${state.answers[answerId] === "false" ? "checked" : ""}> S</label></div>`;
            }).join("")}</div>`;
        }
        return `<div class="question answer-question"><h3>${escapeHTML(label)}</h3><textarea data-answer="${escapeHTML(id)}" placeholder="Nh\u1eadp \u0111\u00e1p \u00e1n ho\u1eb7c l\u1eddi gi\u1ea3i..." aria-label="\u0110\u00e1p \u00e1n ${escapeHTML(label)}">${escapeHTML(state.answers[id] || "")}</textarea></div>`;
    };
    return `<div class="answer-sections">${groups.map(group => {
        const items = questions.filter(question => question.type === group.type
            && (group.order == null || question.layoutSectionOrder === group.order));
        if (!items.length) return "";
        return `<section class="answer-section answer-section-${group.type}"><header class="answer-section-heading"><h3>${escapeHTML(group.title)}</h3><span>${items.length} c\u00e2u</span></header><div class="answer-section-questions">${items.map(renderQuestion).join("")}</div></section>`;
    }).join("")}</div>`;
}
function applyExamQuestions(documentId, questions) {
    if (state.route !== "exam" || String(state.examDocId) !== String(documentId)) return;
    const document = findDoc(documentId);
    const layout = assessmentLayoutFor(document);
    questions = applyQuestionLayout(questions || [], layout, { fillMissing: !document?.sample });
    if (!questions.length) {
        const form = $("#answer-form");
        const summary = $("#answer-question-summary");
        if (form && !form.querySelector("[data-answer], [data-answer-choice], [data-answer-true-false]")) {
            if (summary) summary.textContent = "Không trích xuất được câu hỏi từ tệp. PDF scan cần OCR hoặc tải đáp án có mã câu hỏi.";
            form.innerHTML = answerFields([]);
        }
        return;
    }
    activeExamQuestions = questions;
    activeExamQuestionsFor = String(documentId);
    const summary = $("#answer-question-summary");
    const form = $("#answer-form");
    if (summary) summary.textContent = questionSummary(questions);
    if (form) form.innerHTML = answerFields(questions, false, layout);
}
async function loadTextExamQuestions(doc) {
    if (!doc?.fileUrl) return;
    try {
        const filename = doc.originalName || doc.filename || "";
        const isDocx = /\.docx(?:$|[?#])/i.test(filename);
        if (!isDocx && !/\.txt(?:$|[?#])/i.test(filename)) return;
        const response = await fetch(doc.fileUrl, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = isDocx
            ? await extractDocxText(await response.arrayBuffer())
            : await response.text();
        applyExamQuestions(doc.id, parseQuestionText(text));
    } catch (error) {
        console.warn("Could not read text exam:", error.message);
        applyExamQuestions(doc.id, []);
    }
}
function examPage() {
    const d = findDoc(state.examDocId);
    if (!d) return examSelectPage();
    const questions = questionsFor(d);
    const isPractice = d.category === "practice";
    const isTimedExam = d.category === "exam";
    const filename = d.originalName || d.filename || "";
    const fileUrl = d.fileUrl || d.url || "";
    const isPdf = !d.content && /\.pdf(?:$|[?#])/i.test(filename);
    const isText = !d.content && /\.txt(?:$|[?#])/i.test(filename);
    const isDocx = !d.content && /\.docx(?:$|[?#])/i.test(filename);
    const paper = isPdf && fileUrl
        ? `<div class="exam-paper-viewer"><div class="pdf-reader" data-pdf-reader data-question-source="true" data-pdf-url="${escapeHTML(fileUrl)}"></div></div>`
        : isText && fileUrl
          ? `<div class="exam-paper-viewer exam-text-paper"><iframe src="${escapeHTML(fileUrl)}" title="${escapeHTML(d.title)}"></iframe></div>`
          : !d.content && fileUrl
            ? `<div class="exam-paper-viewer"><a class="button primary" href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">M\u1edf ho\u1eb7c t\u1ea3i \u0111\u1ec1</a></div>`
            : questions.map(question => `<div class="question"><h3>C\u00e2u ${escapeHTML(question.id)}. ${escapeHTML(question.text)}</h3></div>`).join("");
    const waitingForSource = (isPdf || isText || isDocx) && !questions.length;
    const summary = questions.length ? questionSummary(questions) : waitingForSource ? "\u0110ang \u0111\u1ecdc c\u1ea5u tr\u00fac c\u00e2u h\u1ecfi t\u1eeb t\u1ec7p\u2026" : questionSummary(questions);
    return `${breadcrumb(isPractice ? "\u0110\u1ec1 \u00f4n t\u1eadp" : "Ph\u00f2ng thi th\u1eed")}<div class="exam-toolbar" data-exam-id="${escapeHTML(d.id)}" data-exam-title="${escapeHTML(d.title)}" data-exam-grade="${escapeHTML(d.grade)}"><div><strong>${escapeHTML(d.title)}</strong><div class="exam-instructions">${gradeLabel(d.grade)} \u00b7 ${isTimedExam ? "L\u00e0m b\u00e0i trong t\u1ed1i \u0111a 90 ph\u00fat" : "L\u00e0m b\u00e0i t\u1ef1 luy\u1ec7n"}</div></div><div id="timer" class="timer" ${isTimedExam ? "" : "hidden"}>90:00</div><button class="button primary" data-action="submit-exam">N\u1ed9p b\u00e0i</button></div><div class="split-exam" id="split-exam"><section class="exam-pane paper" id="paper-pane">${paper}</section><div class="splitter" id="splitter" role="separator" tabindex="0" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50" aria-label="K\u00e9o \u0111\u1ec3 thay \u0111\u1ed5i k\u00edch th\u01b0\u1edbc hai khung"></div><section class="exam-pane answers" id="answer-pane"><span class="pill">PH\u1ea6N \u0110I\u1ec0N \u0110\u00c1P \u00c1N</span><h2>B\u00e0i l\u00e0m c\u1ee7a b\u1ea1n</h2><p class="muted" id="answer-question-summary">${summary}</p><form id="answer-form">${answerFields(questions, waitingForSource, assessmentLayoutFor(d))}</form></section></div>`;
}function resultPage() {
    const saved = state.route === "saved-result" ? state.savedExamResult : null;
    const d = saved ? { title: saved.title, subject: saved.subject, grade: saved.grade, category: saved.category } : findDoc(state.examDocId);
    const result = saved ? saved.result : state.gradeResult;
    const answers = saved ? (saved.answers || {}) : state.answers;
    const answered = Object.values(answers).filter(value => String(value).trim()).length;
    const layout = assessmentLayoutFor(d);
    const answerableCount = (layout?.sections || []).reduce((total, section) => total + Number(section.count || 0) * (section.type === "true_false" ? (section.statements || ["a", "b", "c", "d"]).length : 1), 0) || Object.keys(answers).length;
    const rows = Array.isArray(result?.results) ? result.results : [];
    const owner = saved?.userName ? `<p class="muted tiny">Bài làm của ${escapeHTML(saved.userName)}${saved.userEmail ? ` (${escapeHTML(saved.userEmail)})` : ""}${saved.createdAt ? ` · ${escapeHTML(saved.createdAt)}` : ""}</p>` : "";
    const details = result?.graded
        ? `<div class="result-score">${Number(result.score ?? result.earnedPoints).toFixed(2)}/${result.scale ?? result.totalPoints}</div><p class="muted">${result.percent ?? 0}% · ${result.correctCount ?? 0}/${result.questionCount ?? rows.length} câu đúng · ${result.earnedPoints ?? result.score ?? 0}/${result.totalPoints ?? result.scale ?? 0} điểm</p><div class="grade-details">${rows.map(item => `<div class="grade-detail"><span>Câu ${escapeHTML(item.question)}</span><strong class="${item.correct ? "is-correct" : "is-wrong"}">${item.correct ? "Đúng" : "Chưa đúng"} · ${item.earnedPoints ?? 0}/${item.totalPoints ?? 0}</strong></div>`).join("")}</div>`
        : `<div class="result-score">—/${result?.scale ?? result?.totalPoints ?? gradingScaleFor(d)}</div><p class="muted">${escapeHTML(result?.message || "Bài đã nộp. Chưa có đáp án máy đọc được để chấm tự động.")}</p>`;
    const actions = saved
        ? (currentUser?.role === "admin" ? `<button class="button secondary" data-route="admin">Quay lại tiến trình</button>` : `<button class="button secondary" data-route="home">Về trang học tập</button>`)
        : `<button class="button secondary" data-route="exam-select">Chọn đề khác</button><button class="button primary" data-route="subject">Về môn Toán</button>`;
    return `${pageHeading("Kết quả bài làm", d?.title || "Đề thi")}<div class="result-panel"><span class="pill">ĐÃ NỘP BÀI</span>${owner}${details}<h2>${result?.graded ? "Chi tiết chấm điểm" : "Tình trạng bài làm"}</h2>${result?.graded ? "" : `<p class="muted">Số câu đã trả lời: ${answered}/${answerableCount}</p>`}<div class="modal-actions">${actions}</div></div>`;
}

async function openSavedExamResult(id) {
    try {
        const endpoint = currentUser?.role === "admin"
            ? "/api/admin/exam-results/" + encodeURIComponent(id)
            : "/api/exam-results/" + encodeURIComponent(id);
        const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Không tải được kết quả bài làm.");
        state.savedExamResult = data;
        go("saved-result");
    } catch (error) {
        toast(error.message || "Không tải được kết quả bài làm.", "error");
    }
}
function adminPage() { return `${pageHeading("Quản trị MAI HỌC", "Quản lý tài khoản và kiểm tra quyền truy cập.")}<div class="admin-toolbar"><div><span class="pill">ADMIN</span><h2 style="margin:10px 0 2px">Tài khoản người dùng</h2><p class="muted" style="margin:0">Danh sách do máy chủ trả về; quyền không lấy từ dữ liệu trình duyệt.</p></div><button class="button secondary" data-route="home">← Về trang học tập</button></div><div class="stat-row"><div class="stat"><span class="muted">Tổng tài khoản</span><strong id="admin-user-total">—</strong></div><div class="stat"><span class="muted">Quyền truy cập</span><strong>2 vai trò</strong></div></div><p id="admin-users-status" class="muted">Đang tải danh sách tài khoản…</p><div id="admin-users-table"></div>`; }
async function loadAdminUsers() { if (state.route !== "admin")
    return; const status = $("#admin-users-status"), container = $("#admin-users-table"); try {
    const response = await fetch("/api/admin/users", { credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error || "Không thể tải danh sách tài khoản.");
    if (state.route !== "admin")
        return;
    $("#admin-user-total").textContent = String(payload.total ?? payload.users?.length ?? 0);
    status.textContent = `Hiển thị ${payload.users?.length || 0} tài khoản gần nhất.`;
    const rows = (payload.users || []).map(u => {
      const created = u.createdAt ? new Date(u.createdAt.replace(" ", "T") + "Z").toLocaleString("vi-VN") : "—";
      const roleLabel = u.role !== "admin" ? "User" : Number(u.adminLevel) >= 2 ? "Admin cao nhất" : "Admin cấp dưới";
      const canRequestDelete = Number(u.id)!==Number(payload.currentUserId) && Number(u.adminLevel)<2;
      return `<tr><td>${u.id}</td><td>${escapeHTML(u.name)}</td><td>${escapeHTML(u.email)}</td><td><span class="role-chip">${roleLabel}</span></td><td>${escapeHTML(created)}</td><td>${canRequestDelete ? `<button class="button secondary small" data-delete-user="${u.id}">${payload.isSuperAdmin ? "Xóa" : "Gửi yêu cầu xóa"}</button>` : "—"}</td></tr>`;
    }).join("");
    let extra = "";
    if(payload.isSuperAdmin){
      extra = `<section class="admin-submissions" style="margin-top:20px"><h2>Thêm Admin cấp dưới</h2><p class="muted">Chỉ bạn (Admin cao nhất) mới có thể cấp quyền Admin.</p><form id="create-subadmin-form" class="admin-form-grid"><label>Email tài khoản<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Họ và tên <span class="muted tiny">(chỉ bắt buộc với email mới)</span><input name="name" minlength="2" maxlength="80" autocomplete="name"></label><label>Mật khẩu tạm thời <span class="muted tiny">(chỉ bắt buộc với email mới)</span><input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label><button class="button primary" type="submit">Cấp quyền / Tạo Admin</button></form><p class="muted tiny">Nếu email đã có tài khoản MAIHOC, hệ thống sẽ nâng quyền tài khoản đó và giữ nguyên mật khẩu, tiến độ học tập, lịch sử làm bài. Chỉ cần nhập tên và mật khẩu cho email chưa đăng ký.</p></section><section class="admin-submissions" style="margin-top:20px"><h2>Yêu cầu xóa tài khoản chờ duyệt</h2><div id="account-deletion-requests"><p class="muted">Đang tải yêu cầu…</p></div></section>`;
    }
    container.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ID</th><th>Họ và tên</th><th>Email</th><th>Vai trò</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Chưa có tài khoản.</td></tr>'}</tbody></table></div>${extra}`;
    if(payload.isSuperAdmin) await loadAccountDeletionRequests();
}
catch (error) {
    if (state.route !== "admin")
        return;
    status.textContent = error.message || "Lỗi khi tải dữ liệu.";
    status.classList.add("auth-error");
    container.innerHTML = "";
} }
function render() {
    view.classList.toggle("reader-fullscreen", state.route === "reader");
    document.body.classList.toggle("reader-open", state.route === "reader");
    view.classList.toggle("exam-workspace", state.route === "exam");
    const fullscreenExam = state.route === "exam" && findDoc(state.examDocId)?.category === "exam";
    view.classList.toggle("exam-fullscreen", fullscreenExam);
    document.body.classList.toggle("exam-open", fullscreenExam);
    if (state.route === "home")
        view.innerHTML = homePage();
    else if (state.route === "subject")
        view.innerHTML = subjectPage();
    else if (state.route === "subject-picker")
        view.innerHTML = subjectPickerPage();
    else if (state.route === "theory")
        view.innerHTML = gradePicker("theory", "theory");
    else if (state.route === "practice")
        view.innerHTML = gradePicker("practice", "practice");
    else if (state.route === "theory-list")
        view.innerHTML = resourceListPage("theory", state.grade);
    else if (state.route === "practice-list")
        view.innerHTML = resourceListPage("practice", state.grade);
    else if (state.route === "exercise-list")
        view.innerHTML = resourceListPage("exercise", state.grade);
    else if (state.route === "exam-select")
        view.innerHTML = examSelectPage();
    else if (state.route === "exam-list")
        view.innerHTML = examListPage(state.grade);
    else if (state.route === "reader")
        view.innerHTML = readerPage();
    else if (state.route === "exam")
        view.innerHTML = examPage();
    else if (state.route === "result" || state.route === "saved-result")
        view.innerHTML = resultPage();
    else if (state.route === "admin")
        view.innerHTML = adminPage();
    const pdfContainer = view.querySelector("[data-pdf-reader]");
    if (pdfContainer) {
        const pdfExamId = state.examDocId;
        mountPdfReader(pdfContainer, pdfContainer.dataset.pdfUrl).then(result => {
            if (state.route === "exam" && String(state.examDocId) === String(pdfExamId)) {
                applyExamQuestions(state.examDocId, result?.questions || []);
            }
        });
    }
    if (state.route === "exam") {
        const examDocument = findDoc(state.examDocId);
        if (examDocument && !examDocument.content && /\.(?:txt|docx)(?:$|[?#])/i.test(examDocument.originalName || examDocument.filename || "")) {
            loadTextExamQuestions(examDocument);
        }
    }
    view.focus({ preventScroll: true });
    if (state.route === "admin")
        loadAdminUsers();
    if (state.route === "exam") {
        wireSplitter();
        if (state.examStarted && !state.examFinished && findDoc(state.examDocId)?.category === "exam")
            startTimer();
    }
}
function startTimer() {
    if (state.timer)
        return;
    updateTimer();
    state.timer = setInterval(() => { state.remaining--; updateTimer(); if (state.remaining === 300 && !state.warningShown) {
        state.warningShown = true;
        toast("Bạn còn 5 phút! Hãy kiểm tra bài và chuẩn bị nộp.", "error");
    } if (state.remaining <= 0) {
        clearInterval(state.timer);
        state.timer = null;
        toast("Đã hết giờ. Bài thi sẽ được nộp tự động.", "error");
        finishExam();
    } }, 1000);
}
function updateTimer() { const el = $("#timer"); if (!el)
    return; const m = Math.floor(state.remaining / 60), s = state.remaining % 60; el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; el.classList.toggle("warning", state.remaining <= 300); }
function wireSplitter() {
    const split = $("#splitter");
    const exam = $("#split-exam");
    const left = $("#paper-pane");
    if (!split || !exam || !left || split.dataset.ready) return;

    split.dataset.ready = "1";
    split.setAttribute("aria-valuemin", "25");
    split.setAttribute("aria-valuemax", "75");
    split.setAttribute("aria-valuenow", "50");
    let dragging = false;

    const setRatio = (value) => {
        const ratio = Math.max(25, Math.min(75, value));
        split.setAttribute("aria-valuenow", String(Math.round(ratio)));
        if (innerWidth <= 620) {
            exam.style.gridTemplateRows = `${ratio}fr 12px ${100 - ratio}fr`;
        } else {
            const usableWidth = Math.max(0, exam.clientWidth - 20);
            left.style.flex = `0 0 ${usableWidth * ratio / 100}px`;
        }
    };

    const moveToPointer = (event) => {
        const rect = exam.getBoundingClientRect();
        const ratio = innerWidth <= 620
            ? ((event.clientY - rect.top - 10) / Math.max(1, rect.height - 20)) * 100
            : ((event.clientX - rect.left - 10) / Math.max(1, rect.width - 20)) * 100;
        setRatio(ratio);
    };

    split.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        dragging = true;
        split.setPointerCapture(event.pointerId);
        moveToPointer(event);
    });
    split.addEventListener("pointermove", (event) => {
        if (dragging) moveToPointer(event);
    });
    const stopDragging = () => { dragging = false; };
    split.addEventListener("pointerup", stopDragging);
    split.addEventListener("pointercancel", stopDragging);
    split.addEventListener("keydown", (event) => {
        const horizontal = innerWidth > 620;
        const decrease = horizontal ? event.key === "ArrowLeft" : event.key === "ArrowUp";
        const increase = horizontal ? event.key === "ArrowRight" : event.key === "ArrowDown";
        if (!decrease && !increase) return;
        event.preventDefault();
        setRatio(Number(split.getAttribute("aria-valuenow")) + (increase ? 5 : -5));
    });
}
function finishExam() {
    // Ngăn kết thúc bài thi nhiều lần.
    if (state.examFinished)
        return;
    // Đánh dấu bài thi đã kết thúc trước khi thoát fullscreen.
    state.examFinished = true;
    state.examStarted = false;
    // Dừng đồng hồ đếm ngược.
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    const submittedAnswers = { ...state.answers };
    const submitPromise = fetch(`/api/exams/${encodeURIComponent(state.examDocId)}/submit`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: submittedAnswers })
    }).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Không thể nộp bài.");
        return result;
    }).catch(error => ({ graded: false, message: error.message || "Không thể chấm bài lúc này." }));
    const leaveFullscreen = findDoc(state.examDocId)?.category === "exam" && document.fullscreenElement
        ? document.exitFullscreen().catch((error) => {
            console.error("Không thể thoát toàn màn hình:", error);
        })
        : Promise.resolve();
    Promise.all([Promise.resolve(leaveFullscreen), submitPromise]).then(([, result]) => {
        state.gradeResult = result;
        go("result");
    });
}
// PHÁT HIỆN HỌC SINH THOÁT TOÀN MÀN HÌNH
// ============================================
document.addEventListener("fullscreenchange", () => {
    // Vẫn đang ở chế độ toàn màn hình.
    if (document.fullscreenElement)
        return;
    // Nếu bài thi đã kết thúc bình thường hoặc hết giờ,
    // không xử lý như hành vi thoát bài thi.
    if (state.route !== "exam" ||
        findDoc(state.examDocId)?.category !== "exam" ||
        !state.examStarted ||
        state.examFinished) {
        return;
    }
    // Người thi chủ động thoát toàn màn hình.
    state.examStarted = false;
    state.examFinished = true;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    // Không xóa đáp án ở đây nếu bạn cần lưu kết quả vi phạm.
    go("home");
    window.alert("Bạn đã thoát bài thi!\n\n" +
        "Lượt thi đã kết thúc vì bạn thoát chế độ toàn màn hình.");
});
// ============================================
// BẮT ĐẦU THI THỬ - TỰ ĐỘNG TOÀN MÀN HÌNH
// ============================================
function startExam(id) {
    const d = findDoc(id);
    if (!d)
        return;
    const isTimedExam = d.category === "exam";
    // Yêu cầu toàn màn hình ngay trong thao tác nhấn nút.
    // Trình duyệt yêu cầu thao tác này phải xuất phát từ người dùng.
    let fullscreenPromise = null;
    if (isTimedExam && !document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            try {
                fullscreenPromise =
                    document.documentElement.requestFullscreen();
            }
            catch (error) {
                console.error("Không thể bật toàn màn hình:", error);
            }
        }
    }
    // Khởi tạo lượt thi mới.
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    state.examDocId = id;
    state.answers = {};
    state.remaining = isTimedExam ? 90 * 60 : 0;
    activeExamQuestions = [];
    activeExamQuestionsFor = null;
    state.warningShown = false;
    state.examStarted = true;
    state.examFinished = false;
    state.gradeResult = null;
    // Chuyển đến phòng thi.
    go("exam");
    // Thông báo nếu trình duyệt từ chối toàn màn hình.
    if (fullscreenPromise) {
        fullscreenPromise.catch((error) => {
            console.error("Trình duyệt không cho phép toàn màn hình:", error);
            toast("Không thể bật toàn màn hình. Hãy thử nhấn Vào phòng thi lại.", "error");
        });
    }
    else if (isTimedExam && !document.fullscreenElement) {
        toast("Trình duyệt không hỗ trợ chế độ toàn màn hình.", "error");
    }
}
async function doEvaluate(id) { const d = findDoc(id); if (!d)
    return; $("#difficulty-result").innerHTML = '<span class="spinner"></span> Đang phân tích…'; openDialog("difficulty-dialog"); try {
    const result = await evaluateDifficulty(d.content || d.description, d.title);
    $("#difficulty-result").textContent = result.analysis || result.text || "AI chưa trả về kết quả.";
}
catch (e) {
    $("#difficulty-result").textContent = `Chưa thể đánh giá bằng Gemini.\n\n${e.message}\n\nBạn vẫn có thể làm đề. Hãy cấu hình GEMINI_API_KEY ở backend để bật tính năng này.`;
} }
function subjectClick(subject) { if (subject === "Toán") {
    go("subject");
    $("#subject-menu").classList.remove("open");
}
else {
    toast(`${subject}: sẽ được cập nhật trong thời gian tới — Coming soon!`);
    $("#subject-menu").classList.remove("open");
} }
document.addEventListener("click", async (e) => {
    const deleteUserButton = e.target.closest("[data-delete-user]");
    if (deleteUserButton) {
        const id = deleteUserButton.dataset.deleteUser;
        if (!confirm("Gửi yêu cầu xóa tài khoản này? Nếu bạn là Admin cấp dưới, tài khoản chỉ bị xóa sau khi Admin cao nhất chấp thuận.")) return;
        try {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not delete user.");
            toast(payload.deleted ? "Đã xóa tài khoản." : "Đã gửi yêu cầu. Tài khoản chưa bị xóa.", "success");
            await loadAdminUsers();
        } catch (error) {
            toast(error.message || "Không thể xóa tài khoản.", "error");
        }
        return;
    }

    const routeBtn = e.target.closest("[data-route]");
    if (routeBtn) {
        e.preventDefault();
        const r = routeBtn.dataset.route;
        go(r);
        return;
    }
    const action = e.target.closest("[data-action]");
    if (action) {
        const a = action.dataset.action;
        if (a === "admin-dashboard") {
            if (currentUser?.role === "admin")
                go("admin");
            else
                toast("Bạn cần đăng nhập bằng tài khoản Admin.", "error");
            return;
        }
        if (a === "browse-subjects") {
            $("#subject-menu").classList.remove("open");
            go("subject-picker");
            return;
        }
        if (a === "open-math") {
            go("subject");
            return;
        }
        if (a === "coming-subject") {
            toast(`${action.dataset.name}: sẽ được cập nhật trong thời gian tới — Coming soon!`);
            return;
        }
        if (a === "choose-grade") {
            state.grade = action.dataset.grade;
            go("theory-list", { grade: action.dataset.grade });
            return;
        }
        if (a === "select-grade-route") {
            const g = action.dataset.grade, next = action.dataset.next, cat = action.dataset.category;
            state.grade = g;
            if (next === "exam-list")
                go("exam-list", { grade: g });
            else if (cat === "theory")
                go("theory-list", { grade: g });
            else if (cat === "practice")
                go("practice-list", { grade: g });
            else
                go("exercise-list", { grade: g });
            return;
        }
        if (a === "open-upload") {
            const category = action.dataset.category || currentDocumentCategory();
            setUploadCategory(category);
            openDialog("upload-dialog");
            window.dispatchEvent(new Event("maihoc-upload-dialog-open"));
            return;
        }
        if (a === "read-doc") {
            const id = action.dataset.id;
            // Mở trang đọc ngay lập tức; không để API đồng bộ làm nút bị treo.
            const documentToOpen = findDoc(id);
            if (!documentToOpen) {
                toast("Không tìm thấy tài liệu trong danh sách hiện tại. Hãy tải lại trang và thử lại.", "error");
                return;
            }
            go("reader", { docId: documentToOpen.id });
            // Đồng bộ ngầm sau khi điều hướng. Nếu có dữ liệu mới, cập nhật
            // trang đọc khi người dùng vẫn đang ở đúng tài liệu đó.
            refreshDocuments()
                .then(() => {
                    if (state.route === "reader" && String(state.docId) === String(id)) {
                        render();
                    }
                })
                .catch(error => console.error("Không thể đồng bộ tài liệu:", error));
            return;
        }
        if (a === "start-exam") {
            startExam(action.dataset.id);
            return;
        }
        if (a === "evaluate") {
            doEvaluate(action.dataset.id);
            return;
        }
        if (a === "view-exam-result") {
            openSavedExamResult(action.dataset.id);
            return;
        }
        if (a === "submit-exam") {
            openDialog("confirm-dialog");
            return;
        }
    }
    const subject = e.target.closest("[data-subject]");
    if (subject) {
        subjectClick(subject.dataset.subject);
        return;
    }
    const close = e.target.closest("[data-close]");
    if (close) {
        closeDialog(close.dataset.close);
        return;
    }
});
$("#brand-home").addEventListener("click", () => go("home"));
$("#menu-toggle").addEventListener("click", () => $("#subject-menu").classList.toggle("open"));
document.addEventListener("click", e => { if (!e.target.closest("#subject-menu") && !e.target.closest("#menu-toggle") && !e.target.closest('[data-action="browse-subjects"]'))
    $("#subject-menu").classList.remove("open"); });
$("#upload-open").addEventListener("click", () => {
    const category = currentDocumentCategory();
    setUploadCategory(category);
    openDialog("upload-dialog");
    window.dispatchEvent(new Event("maihoc-upload-dialog-open"));
});
const uploadCategorySelect = $("#upload-form").elements.category;
function updateFileDropZone(input) {
    const zone = input.closest("[data-file-drop-zone]");
    const name = zone?.querySelector("[data-file-name]");
    const file = input.files?.[0];
    if (name) name.textContent = file?.name || "Chưa chọn tệp";
    zone?.classList.toggle("has-file", Boolean(file));
}
document.querySelectorAll("[data-file-drop-zone]").forEach(zone => {
    const input = zone.querySelector('input[type="file"]');
    if (!input) return;
    input.addEventListener("change", () => updateFileDropZone(input));
    zone.addEventListener("keydown", event => {
        if (event.target === input || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        input.click();
    });
    zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.classList.add("is-dragover");
    });
    zone.addEventListener("dragleave", event => {
        if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragover");
    });
    zone.addEventListener("drop", event => {
        event.preventDefault();
        zone.classList.remove("is-dragover");
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
});
/* ============================================
   CHỐNG SPAM CLICK KHI UPLOAD TÀI LIỆU
   ============================================ */
// Khóa upload trong khi request đang xử lý.
let uploadInProgress = false;
// Lưu các tệp đã upload thành công trong phiên trang hiện tại.
const uploadedFileKeys = new Set();
$("#upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const fileInput = form.querySelector('input[type="file"]');
    const file = fileInput?.files?.[0];
    // Kiểm tra tệp đã được chọn.
    if (!file) {
        toast("Vui lòng chọn tài liệu trước khi tải lên.", "error");
        return;
    }
    // Nhận diện tệp dựa trên tên, kích thước và thời điểm chỉnh sửa.
    const fileKey = JSON.stringify({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified
    });
    // Nếu đang upload, không gửi thêm request.
    if (uploadInProgress) {
        toast("Tài liệu đang được tải lên. Vui lòng chờ.", "error");
        return;
    }
    // Nếu tệp đã upload thành công, không upload lại.
    if (uploadedFileKeys.has(fileKey)) {
        toast("Tài liệu này đã được tải lên rồi.", "error");
        return;
    }
    // Khóa ngay trước khi gọi API.
    uploadInProgress = true;
    const originalText = submitButton?.textContent;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Đang tải lên...";
    }
    try {
        const fd = new FormData(form);
        fd.delete("answerKey");
        const result = await uploadDocument(fd);
        // Chỉ đánh dấu đã upload khi server xử lý thành công.
        uploadedFileKeys.add(fileKey);
        closeDialog("upload-dialog");
        form.reset();
        if(result.solutionJob)window.dispatchEvent(new CustomEvent("maihoc-exam-solution-job",{detail:result.solutionJob}));
        toast(result.localOnly
            ? "Đã thêm tài liệu vào phiên trình duyệt hiện tại."
            : result.solutionJob
                ? "Đề đã tải lên. Gemini đang giải; cửa sổ tiến trình đã mở."
            : result.status === "pending"
                ? "Đã gửi tài liệu. Admin sẽ duyệt và bạn sẽ nhận thông báo."
                : "Tài liệu đã được tải lên máy chủ.", "success");
        render();
    }
    catch (err) {
        toast(err.message || "Không thể tải tài liệu lên.", "error");
    }
    finally {
        // Mở khóa sau khi request kết thúc.
        uploadInProgress = false;
        if (submitButton) {
            submitButton.disabled = false;
            if (originalText !== undefined) {
                submitButton.textContent = originalText;
            }
        }
    }
});
$("#confirm-yes").addEventListener("click", () => { closeDialog("confirm-dialog"); finishExam(); });
document.addEventListener("input", e => { if (e.target.matches("[data-answer]"))
    state.answers[e.target.dataset.answer] = e.target.value; });
document.addEventListener("change", e => {
    const multipleChoice = e.target.closest("[data-answer-choice]");
    if (multipleChoice) {
        const questionId = multipleChoice.dataset.answerChoice;
        if (multipleChoice.checked) {
            document.querySelectorAll("[data-answer-choice]").forEach(input => {
                if (input !== multipleChoice && input.dataset.answerChoice === questionId) input.checked = false;
            });
            state.answers[questionId] = multipleChoice.dataset.answerOption;
        } else if (state.answers[questionId] === multipleChoice.dataset.answerOption) {
            delete state.answers[questionId];
        }
    }
    const trueFalse = e.target.closest("[data-answer-true-false]");
    if (trueFalse) {
        const questionId = trueFalse.dataset.answerTrueFalse;
        const statementId = trueFalse.dataset.answerStatement;
        const answerId = `${questionId}${statementId}`;
        if (trueFalse.checked) {
            document.querySelectorAll("[data-answer-true-false]").forEach(input => {
                if (input !== trueFalse && input.dataset.answerTrueFalse === questionId
                    && input.dataset.answerStatement === statementId) input.checked = false;
            });
            state.answers[answerId] = trueFalse.dataset.answerValue;
        } else if (state.answers[answerId] === trueFalse.dataset.answerValue) {
            delete state.answers[answerId];
        }
    }
});
window.addEventListener("beforeunload", e => { if (state.route === "exam" && state.examStarted && findDoc(state.examDocId)?.category === "exam") {
    e.preventDefault();
    e.returnValue = "";
} });
// ============================================
// ĐIỀU HƯỚNG NÚT BACK CỦA TRÌNH DUYỆT
// Áp dụng cho toàn bộ website MAI HỌC
// ============================================
// -------------------- ACCOUNT UI + API --------------------
function applyAuthUI() {
    const signedIn = Boolean(currentUser);
    $("#auth-actions").hidden = signedIn;
    $("#user-actions").hidden = !signedIn;
    $("#upload-open").hidden = !signedIn;
    $("#notifications-open").hidden = !signedIn;
    $("#admin-open").hidden = currentUser?.role !== "admin";
    $("#user-greeting").textContent = currentUser ? `Xin chào, ${currentUser.name}${currentUser.role === "admin" ? " · Admin" : ""}` : "";
}
async function refreshAuthUI() {
    try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin" });
        const data = await response.json().catch(() => ({}));
        currentUser = response.ok ? data.user || null : null;
    }
    catch {
        currentUser = null;
    }
    applyAuthUI();
}
async function postJson(url, body) {
    const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error || "Máy chủ không thể xử lý yêu cầu.");
    return payload;
}
$("#login-open").addEventListener("click", () => { $("#login-error").hidden = true; openDialog("login-dialog"); });
$("#register-open").addEventListener("click", () => { $("#register-error").hidden = true; openDialog("register-dialog"); });
$("#switch-to-register").addEventListener("click", () => { closeDialog("login-dialog"); openDialog("register-dialog"); });
$("#switch-to-login").addEventListener("click", () => { closeDialog("register-dialog"); openDialog("login-dialog"); });
$("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const error = $("#login-error");
    error.hidden = true;
    if (submit)
        submit.disabled = true;
    try {
        const values = Object.fromEntries(new FormData(form).entries());
        const result = await postJson("/api/auth/login", values);
        currentUser = result.user;
        applyAuthUI();
        window.dispatchEvent(new Event("maihoc-auth-changed"));
        closeDialog("login-dialog");
        form.reset();
        toast("Đăng nhập thành công.", "success");
        go(currentUser.role === "admin" ? "admin" : "home");
    }
    catch (err) {
        error.textContent = err.message;
        error.hidden = false;
    }
    finally {
        if (submit)
            submit.disabled = false;
    }
});
$("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const error = $("#register-error");
    error.hidden = true;
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.password !== values.confirmPassword) {
        error.textContent = "Mật khẩu nhập lại chưa khớp.";
        error.hidden = false;
        return;
    }
    delete values.confirmPassword;
    if (submit)
        submit.disabled = true;
    try {
        const result = await postJson("/api/auth/register", values);
        currentUser = result.user;
        applyAuthUI();
        window.dispatchEvent(new Event("maihoc-auth-changed"));
        closeDialog("register-dialog");
        form.reset();
        toast("Tạo tài khoản thành công.", "success");
        go("home");
    }
    catch (err) {
        error.textContent = err.message;
        error.hidden = false;
    }
    finally {
        if (submit)
            submit.disabled = false;
    }
});
$("#logout-button").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || "Không thể đăng xuất.");
        }
        currentUser = null;
        applyAuthUI();
        window.dispatchEvent(new Event("maihoc-auth-changed"));
        if (state.route === "admin")
            go("home");
        toast("Bạn đã đăng xuất.", "success");
    }
    catch (error) {
        toast(error.message || "Không thể đăng xuất.", "error");
    }
});
// Khởi tạo giao diện như bình thường.
initTheme();
render();
refreshAuthUI();

window.addEventListener("maihoc-documents-changed", () => {
    refreshDocuments().then(() => render());
});


async function loadAccountDeletionRequests(){
  const box=$("#account-deletion-requests");if(!box)return;
  try{
    const response=await fetch("/api/admin/account-deletion-requests",{credentials:"same-origin"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Không tải được yêu cầu xóa.");
    const requests=data.requests||[];
    const pending=requests.filter(r=>r.status==="pending");
    if(!pending.length){box.innerHTML='<p class="muted">Không có yêu cầu chờ duyệt.</p>';return;}
    box.innerHTML='<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tài khoản cần xóa</th><th>Vai trò</th><th>Người yêu cầu</th><th>Thời gian</th><th>Quyết định</th></tr></thead><tbody>'+pending.map(r=>'<tr><td><strong>'+escapeHTML(r.targetName)+'</strong><br><span class="muted tiny">'+escapeHTML(r.targetEmail)+'</span></td><td>'+ (r.targetRole==="admin"?"Admin cấp dưới":"User")+'</td><td>'+escapeHTML(r.requestedByName)+'</td><td>'+escapeHTML(r.requestedAt||"—")+'</td><td><button class="button primary small" data-review-deletion="'+r.id+'" data-decision="approve">Chấp thuận xóa</button> <button class="button secondary small" data-review-deletion="'+r.id+'" data-decision="reject">Từ chối</button></td></tr>').join("")+'</tbody></table></div>';
  }catch(error){box.innerHTML='<p class="auth-error">'+escapeHTML(error.message)+'</p>';}
}
document.addEventListener("submit",async e=>{
  if(e.target.id!=="create-subadmin-form")return;
  e.preventDefault();
  const form=e.target,button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
    const body=Object.fromEntries(new FormData(form).entries());
    const response=await fetch("/api/admin/admins",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Không tạo/cấp quyền được Admin.");
    form.reset();
    toast(data.action==="promoted"?"Đã nâng quyền tài khoản hiện có thành Admin cấp dưới.":"Đã tạo tài khoản Admin cấp dưới mới.","success");
    await loadAdminUsers();
  }catch(error){toast(error.message||"Không tạo được Admin.","error");}
  finally{button.disabled=false;}
});
document.addEventListener("click",async e=>{
  const review=e.target.closest("[data-review-deletion]");
  if(!review)return;
  const decision=review.dataset.decision;
  if(decision==="approve"&&!confirm("Chấp thuận sẽ xóa vĩnh viễn tài khoản. Bạn có chắc chắn?"))return;
  review.disabled=true;
  try{
    const response=await fetch("/api/admin/account-deletion-requests/"+encodeURIComponent(review.dataset.reviewDeletion)+"/review",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Không xử lý được yêu cầu.");
    toast(decision==="approve"?"Đã chấp thuận và xóa tài khoản.":"Đã từ chối yêu cầu; tài khoản được giữ nguyên.","success");
    await loadAccountDeletionRequests();await loadAdminUsers();
  }catch(error){toast(error.message||"Không xử lý được yêu cầu.","error");review.disabled=false;}
});