import { canAccessSchool, schoolRoutes } from './platform/school-access.js';
import { mountLearningAdvisor } from './platform/learning-advisor.js';
let disposeTeachingAdvisor = null;
import { mountTimetablePreview, mountTimetable, mountLearningProgress } from "./platform/learning.js";
import { TestDraft } from './platform/test-draft.js';
import { routeUrl, parseRoute } from './platform/router.js';
import { dashboardMarkup, hydrateActivity, mountPortal } from './platform/portal.js';
import { SUBJECTS, SUBJECT_CATALOG, ENABLED_SUBJECTS, setSubjectCatalog, getSubjectConfig, CATEGORIES } from "./data.js";
import { initTheme } from "./theme.js?v=20261031v1";
import { $, $$, escapeHTML, toast, openDialog, closeDialog, pageHeading } from "./ui.js";
import {
    getDocuments,
    refreshDocuments,
    uploadDocument
} from "./documents.js";
import { evaluateDifficulty } from "./ai.js";
import { mountPdfReader } from "./pdf-reader.js";
import { applyQuestionLayout, extractDocxText, parseQuestionText, questionSummary } from "./question-parser.js";
import "./account-features.js?v=20261030notifications2";
import { mountStudyRooms } from "../study-rooms/client.js";
import {
    refreshTestsQueue,
    findCachedTest,
    renderTestsQueuePage,
    wireTestsEvents,
    loadAdminTestsAndPendingGrading
} from "./tests/index.js";
import { mountChemistryModule } from "./chemistry/index.js?v=20261029aihistory1";
import { mountUniversalAiSolver } from "./ai-solver/index.js?v=20261029loader1";
import { mountSchoolPage, mountStudentProgressPage, wireSchoolEvents } from "./school-system.js?v=20261030classjoin2";
const view = $("#view");
const progressTabParams = new URLSearchParams(window.location.search);
const standaloneStudentProgress = progressTabParams.get("maihoc-view") === "student-progress";
const state = { route: standaloneStudentProgress ? "student-progress" : "home", subject: "ToÃ¡n", grade: "10", category: "theory", docId: null, examDocId: null, answers: {}, gradeResult: null, savedExamResult: null, timer: null, remaining: 5400, elapsedSeconds: 0, timerCountUp: false, examStartedAtMs: 0, warningShown: false, examStarted: false, examFinished: false };
Object.assign(state, standaloneStudentProgress ? {} : parseRoute(new URL(window.location.href)));
let currentUser = null;
let authResolved = false;
let activeActivityCleanup = null;
let activePortalCleanup = null;
let activeTestDraft = null;
let testStarting = false;
let activeStudyRoomsCleanup = null;
let activeChemistryCleanup = null;
let activeUniversalAiCleanup = null;
function stopUniversalAiIfActive() {
    if (activeUniversalAiCleanup) {
        const cleanup = activeUniversalAiCleanup;
        activeUniversalAiCleanup = null;
        try { cleanup(); } catch {}
    }
}
function stopChemistryIfActive() {
    if (activeChemistryCleanup) {
        const cleanup = activeChemistryCleanup;
        activeChemistryCleanup = null;
        try { cleanup(); } catch {}
    }
}
function stopStudyRoomsIfActive() {
    if (activeStudyRoomsCleanup) {
        const cleanup = activeStudyRoomsCleanup;
        activeStudyRoomsCleanup = null;
        Promise.resolve(cleanup()).catch(() => {});
    }
    view.classList.remove("study-room-fullscreen", "study-room-lobby-view");
    document.body.classList.remove("study-room-open");
}
let activeExamQuestions = [];
let activeExamQuestionsFor = null;
let examLayoutConfig = null;
const gradeLabel = g => `Lá»›p ${g}`;
async function initRemoteData() {
    try {
        const subjectResponse = await fetch("/configs/subjects.json", { cache: "no-store" });
        if (subjectResponse.ok) {
            const subjectConfig = await subjectResponse.json();
            setSubjectCatalog(subjectConfig.subjects);
        }
    } catch (error) {
        console.warn("Could not load subject catalog config:", error.message);
    }
    try {
        const response = await fetch("/configs/exam-layouts.json", { cache: "no-store" });
        if (response.ok) examLayoutConfig = await response.json();
    } catch (error) {
        console.warn("Could not load assessment layout config:", error.message);
    }
    await Promise.all([refreshDocuments().catch(() => {}), refreshTestsQueue().catch(() => {})]);
    render();
    resumePendingTest();
}
// LuÃ´n Ä‘á»c danh sÃ¡ch má»›i nháº¥t tá»« documents.js vÃ  bá»™ nhá»› Ä‘á»‡m bÃ i kiá»ƒm tra.
const docs = () => getDocuments();
const findDoc = id =>
    findCachedTest(id) || docs().find(d => String(d.id) === String(id));
const by = (grade, category) =>
    docs().filter(
        d =>
            d.subject === state.subject &&
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
    // Sao lÆ°u Ä‘Ã¡p Ã¡n Ä‘á»ƒ cÃ³ thá»ƒ khÃ´i phá»¥c khi quay láº¡i.
    savedState.answers = { ...state.answers };
    return {
        maihoc: true,
        appState: savedState
    };
}
function go(route, params = {}) {
    if (route === "account-center" && currentUser?.role === "admin") {
        route = "admin";
    }
    if (state.route === "reader" && (route !== "reader" || String(params.docId ?? state.docId) !== String(state.docId))) {
        window.dispatchEvent(new Event("maihoc-reader-leaving"));
    }
    stopTimerIfLeaving(route);
    Object.assign(state, params);
    state.route = route;
    // Ghi trang má»›i vÃ o lá»‹ch sá»­ Ä‘iá»u hÆ°á»›ng cá»§a Chrome.
    history.pushState(saveRouteHistory(), "", routeUrl(state));
    render();
    if (route === "tests") {
        refreshTestsQueue().then(() => {
            if (state.route === "tests") {
                view.innerHTML = renderTestsQueuePage(currentUser);
            }
        });
    }
    if (route === "exam" || route === "home") requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
}
// Khá»Ÿi táº¡o lá»‹ch sá»­ cho trang MAI Há»ŒC hiá»‡n táº¡i.
history.replaceState(saveRouteHistory(), "", window.location.href);
// KhÃ´i phá»¥c trang khi nháº¥n Back hoáº·c Forward.
window.addEventListener("popstate", function (event) {
    const saved = event.state;
    // Náº¿u tráº¡ng thÃ¡i trÆ°á»›c Ä‘Ã³ thuá»™c MAI Há»ŒC,
    // khÃ´i phá»¥c trang Ä‘Ã³ vÃ  khÃ´ng chuyá»ƒn sang Google.
    if (saved?.maihoc && saved.appState) {
        const previousRoute = saved.appState.route;
        if (state.route === "reader" && (previousRoute !== "reader" || String(saved.appState.docId) !== String(state.docId))) {
            window.dispatchEvent(new Event("maihoc-reader-leaving"));
        }
        stopTimerIfLeaving(previousRoute);
        Object.assign(state, saved.appState);
        state.timer = null;
        render();
        if (state.route === "exam" || state.route === "home") requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        return;
    }
    // KhÃ´ng tá»± chuyá»ƒn hÆ°á»›ng khi gáº·p tráº¡ng thÃ¡i khÃ´ng xÃ¡c Ä‘á»‹nh.
    // Äá»ƒ Chrome xá»­ lÃ½ lá»‹ch sá»­ Ä‘iá»u hÆ°á»›ng bÃ¬nh thÆ°á»ng.
});
function stopTimerIfLeaving(route) { if (state.route === "exam" && route !== "exam" && state.timer) {
    clearInterval(state.timer);
    state.timer = null;
} }
function breadcrumb(title) { return `<div class="breadcrumb"><button data-route="home">Trang chá»§</button><span>/</span><button data-route="subject">${escapeHTML(state.subject)}</button><span>/</span><span>${escapeHTML(title)}</span></div>`; }
function homePage() { return dashboardMarkup(currentUser, docs(), window.__maihocTestsQueue || []); }

function subjectPickerPage() {
    const subjects = SUBJECT_CATALOG.map(subject => ({ ...subject, active: ENABLED_SUBJECTS.includes(subject.name), items: subject.name === "IELTS" ? ["Ã”n táº­p theo ká»¹ nÄƒng", "ThÆ° viá»‡n tÃ i liá»‡u", "PhÃ²ng thi thá»­"] : ["Ã”n táº­p lÃ½ thuyáº¿t", "LÃ m Ä‘á» Ã´n táº­p", "PhÃ²ng thi thá»­ (cÃ³ tÃ­nh giá»)"] }));
    return `<section class="subject-picker"><div class="subject-picker-bar"><span>KHÃM PHÃ CÃC MÃ”N Há»ŒC</span><button class="button secondary small" data-route="home">â† Trang chá»§</button></div><div class="subject-picker-intro"><div><p class="eyebrow">MAI Há»ŒC Â· LEARN Â· PRACTICE Â· GROW</p><h1>Chá»n mÃ´n há»c</h1><p>Chá»n mÃ´n Ä‘á»ƒ khÃ¡m phÃ¡ tÃ i liá»‡u, luyá»‡n táº­p vÃ  phÃ²ng thi thá»­.</p></div><span class="pill">MÃ”N Há»ŒC THEO Cáº¤U HÃŒNH</span></div><div class="subject-picker-grid">${subjects.map(x => `<article class="subject-tile ${x.active ? "is-active" : "is-coming"}" ${x.active ? 'data-action="open-subject" data-name="' + x.name + '" role="button" tabindex="0"' : 'data-action="coming-subject" data-name="' + x.name + '" role="button" tabindex="0"'}><div class="subject-tile-head"><span class="subject-tile-icon">${x.icon}</span><div><h2>${escapeHTML(x.name)}</h2><span class="subject-status">${x.active ? "ÄANG HOáº T Äá»˜NG" : "Sáº®P RA Máº®T"}</span></div></div><ul>${x.items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul><div class="subject-tile-footer">${x.active ? "KhÃ¡m phÃ¡ mÃ´n há»c" : "Äang phÃ¡t triá»ƒn"} <span>â†’</span></div></article>`).join("")}</div></section>`;
}
function subjectPage() {
    const isChemistry = state.subject === "HÃ³a há»c";
    const isPhysics = state.subject === "Váº­t lÃ½" || state.subject === "Váº­t lÃ­";
    const naturalScienceTools = isChemistry ? `
      <section class="section-head natural-science-heading" style="margin-top:0;">
        <div>
          <p class="eyebrow">HÃ“A Há»ŒC</p>
          <h2>CÃ´ng cá»¥ há»c táº­p</h2>
          <p>Báº£ng tuáº§n hoÃ n tÆ°Æ¡ng tÃ¡c IUPAC vÃ  Trá»£ lÃ½ AI giáº£i bÃ i táº­p HÃ³a há»c tá»«ng bÆ°á»›c.</p>
        </div>
        <span class="pill natural-science-feature">âœ¨ CÃ”NG Cá»¤ Há»ŒC Táº¬P</span>
      </section>
      <div class="grid two natural-science-grid" style="margin-bottom:28px;">
        <article class="card clickable resource-card natural-science-card" data-route="chemistry" data-chemistry-tab="periodic-table">
          <div class="card-icon">ðŸ“Š</div>
          <span class="pill">TRA Cá»¨U 118 NGUYÃŠN Tá»</span>
          <h3>Báº£ng tuáº§n hoÃ n tÆ°Æ¡ng tÃ¡c</h3>
          <p>Bá»‘ cá»¥c chuáº©n IUPAC 18 cá»™t, lá»c phÃ¢n lá»›p s/p/d/f, cáº¥u hÃ¬nh electron, Ä‘á»™ Ã¢m Ä‘iá»‡n vÃ  á»©ng dá»¥ng thá»±c táº¿.</p>
          <p class="natural-science-card-link">Má»Ÿ Báº£ng tuáº§n hoÃ n â†’</p>
        </article>
        <article class="card clickable resource-card natural-science-card" data-route="chemistry" data-chemistry-tab="ai-solver">
          <div class="card-icon">âš—ï¸</div>
          <span class="pill">TRá»¢ LÃ GIáº¢I BÃ€I Táº¬P</span>
          <h3>AI Giáº£i bÃ i táº­p HÃ³a há»c</h3>
          <p>Nháº­p Ä‘á», táº£i áº£nh hoáº·c PDF; AI phÃ¢n tÃ­ch dá»¯ kiá»‡n, cÃ¢n báº±ng phÆ°Æ¡ng trÃ¬nh vÃ  hÆ°á»›ng dáº«n giáº£i theo tá»«ng bÆ°á»›c.</p>
          <p class="natural-science-card-link">Báº¯t Ä‘áº§u giáº£i bÃ i â†’</p>
        </article>
      </div>
      <section class="section-head">
        <div>
          <h2>Khu vá»±c há»c táº­p &amp; Luyá»‡n thi</h2>
          <p>Há»‡ thá»‘ng lÃ½ thuyáº¿t, luyá»‡n Ä‘á» vÃ  phÃ²ng thi mÃ´ phá»ng.</p>
        </div>
      </section>
    ` : isPhysics ? `
      <section class="section-head natural-science-heading" style="margin-top:0;">
        <div>
          <p class="eyebrow">Váº¬T LÃ</p>
          <h2>CÃ´ng cá»¥ há»c táº­p</h2>
          <p>KhÃ´ng gian tra cá»©u cÃ´ng thá»©c vÃ  phÃ²ng thÃ­ nghiá»‡m mÃ´ phá»ng Váº­t lÃ½.</p>
        </div>
        <span class="pill natural-science-feature">âœ¨ CÃ”NG Cá»¤ Há»ŒC Táº¬P</span>
      </section>
      <div class="grid two natural-science-grid" style="margin-bottom:28px;">
        <article class="card clickable resource-card natural-science-card" data-action="coming-natural-tool" data-tool="physics-formulas" role="button" tabindex="0">
          <div class="card-icon">âš¡</div>
          <span class="pill">Váº¬T LÃ Â· TRA Cá»¨U</span>
          <h3>CÃ´ng thá»©c Váº­t lÃ½</h3>
          <p>KhÃ´ng gian tra cá»©u cÃ´ng thá»©c, Ä‘áº¡i lÆ°á»£ng, Ä‘Æ¡n vá»‹ vÃ  cÃ¡c vÃ­ dá»¥ Ã¡p dá»¥ng theo tá»«ng chá»§ Ä‘á» Váº­t lÃ½.</p>
          <p class="natural-science-card-link">Äang phÃ¡t triá»ƒn Â· Sáº¯p ra máº¯t</p>
        </article>
        <article class="card natural-science-card is-coming" aria-disabled="true">
          <div class="card-icon">ðŸ§ª</div>
          <span class="pill coming-pill">COMING SOON</span>
          <h3>MÃ´ hÃ¬nh thÃ­ nghiá»‡m Váº­t lÃ½</h3>
          <p>PhÃ²ng thÃ­ nghiá»‡m mÃ´ phá»ng tÆ°Æ¡ng tÃ¡c sáº½ Ä‘Æ°á»£c bá»• sung trong giai Ä‘oáº¡n tiáº¿p theo.</p>
          <p class="natural-science-card-link">Sáº¯p ra máº¯t</p>
        </article>
      </div>
      <section class="section-head">
        <div>
          <h2>Khu vá»±c há»c táº­p &amp; Luyá»‡n thi</h2>
          <p>Há»‡ thá»‘ng lÃ½ thuyáº¿t, luyá»‡n Ä‘á» vÃ  phÃ²ng thi mÃ´ phá»ng.</p>
        </div>
      </section>
    ` : "";

    const pageSubtitle = isChemistry
      ? "KhÃ¡m phÃ¡ Báº£ng tuáº§n hoÃ n tÆ°Æ¡ng tÃ¡c, Trá»£ lÃ½ AI vÃ  phÃ²ng thi mÃ´ phá»ng."
      : isPhysics
        ? "KhÃ¡m phÃ¡ cÃ´ng cá»¥ Váº­t lÃ½, tÃ i liá»‡u lÃ½ thuyáº¿t vÃ  phÃ²ng thi mÃ´ phá»ng."
        : "Chá»n má»™t khu vá»±c há»c táº­p Ä‘á»ƒ tiáº¿p tá»¥c.";

    return `${pageHeading(`MÃ´n ${state.subject}`, pageSubtitle)}
${naturalScienceTools}
<div class="grid four">
${[{ r: "theory", i: "â–¤", t: "Ã”n táº­p lÃ½ thuyáº¿t", d: "Äá»c tÃ i liá»‡u vÃ  há»‡ thá»‘ng kiáº¿n thá»©c theo tá»«ng lá»›p." }, { r: "practice", i: "âœŽ", t: "Äá» thi Ã´n táº­p", d: "Luyá»‡n táº­p theo bá»™ Ä‘á» vÃ  chá»§ Ä‘á»." }, { r: "exam-select", i: "â—·", t: "PhÃ²ng thi thá»­", d: "Thi mÃ´ phá»ng cÃ³ giá»›i háº¡n thá»i gian 90 phÃºt." }, { r: "tests", i: "ðŸ“", t: "BÃ i kiá»ƒm tra", d: "LÃ m bÃ i kiá»ƒm tra theo hÃ ng Ä‘á»£i (Queue), tÃ­nh giá» vÃ  lÆ°u Ä‘iá»ƒm." }].map(x => `<article class="card clickable resource-card" data-route="${x.r}"><div class="card-icon">${x.i}</div><h3>${x.t}</h3><p>${x.d}</p><p style="margin-top:18px;color:var(--primary);font-weight:600">Má»Ÿ má»¥c â†’</p></article>`).join("")}</div><section class="section-head"><div><h2>ThÆ° viá»‡n tÃ i liá»‡u</h2><p>${docs().filter(d => d.subject === state.subject).length} tÃ i liá»‡u máº«u vÃ  tÃ i liá»‡u Ä‘Ã£ táº£i lÃªn trong phiÃªn nÃ y.</p></div></section><div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="choose-grade" data-grade="${g}"><div><div class="grade">${gradeLabel(g)}</div><p>${docs().filter(d => d.subject === state.subject && String(d.grade) === String(g)).length} tÃ i liá»‡u</p></div><span class="arrow">â†—</span></article>`).join("")}</div>`;
}
function gradePicker(route, category) { return `${pageHeading(category ? categoryName(category) : "Chá»n lá»›p", "Chá»n khá»‘i lá»›p Ä‘á»ƒ xem tÃ i liá»‡u mÃ´n ${state.subject}.")}<div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="select-grade-route" data-grade="${g}" data-next="${route}" data-category="${category || ""}"><div><span class="pill">MÃ”N ${escapeHTML(state.subject.toUpperCase())}</span><div class="grade">${gradeLabel(g)}</div><p>${category ? by(g, category).length + " tÃ i liá»‡u" : "Chá»n ná»™i dung há»c"}</p></div><span class="arrow">â†’</span></article>`).join("")}</div>`; }
function resourceListPage(category, grade) {
    const list = by(grade, category);
    const isAssessment = category === "practice" || category === "exam";
    return `${pageHeading(`${categoryName(category)} \u2014 ${gradeLabel(grade)}`, `T\u00e0i li\u1ec7u m\u00f4n To\u00e1n ${gradeLabel(grade).toLowerCase()}.`)}<div class="stat-row"><div class="stat"><span class="muted">T\u00e0i li\u1ec7u</span><strong>${list.length}</strong></div><div class="stat"><span class="muted">M\u00f4n h\u1ecdc</span><strong>To\u00e1n</strong></div><div class="stat"><span class="muted">Kh\u1ed1i l\u1edbp</span><strong>${grade}</strong></div></div>${list.length ? `<div class="resource-list">${list.map(d => `<div class="resource-row"><div class="card-icon">${CATEGORIES[d.category]?.icon || "\u25a7"}</div><div class="resource-main"><h3>${escapeHTML(d.title)}</h3><p>${escapeHTML(d.description || "T\u00e0i li\u1ec7u m\u00f4n To\u00e1n")} \u00b7 ${d.sample ? "T\u00e0i li\u1ec7u m\u1eabu" : d.localOnly ? "L\u01b0u trong tr\u00ecnh duy\u1ec7t" : "\u0110\u00e3 t\u1ea3i l\u00ean"}</p></div><div class="resource-actions"><button class="button secondary small" data-action="read-doc" data-id="${escapeHTML(d.id)}">M\u1edf t\u00e0i li\u1ec7u</button>${isAssessment ? `<button class="button primary small" data-action="start-exam" data-id="${escapeHTML(d.id)}">${category === "practice" ? "L\u00e0m b\u00e0i c\u00f3 ch\u1ea5m \u0111i\u1ec3m" : "B\u1eaft \u0111\u1ea7u thi"}</button>` : ""}</div></div>`).join("")}</div>` : `<div class="empty-state"><h3>Ch\u01b0a c\u00f3 t\u00e0i li\u1ec7u cho m\u1ee5c n\u00e0y</h3><p>H\u00e3y upload t\u00e0i li\u1ec7u b\u1eb1ng n\u00fat \u1edf thanh tr\u00ean ho\u1eb7c ch\u1ecdn l\u1edbp kh\u00e1c.</p><button class="button primary" data-action="open-upload" data-category="${category}">Upload t\u00e0i li\u1ec7u</button></div>`}`;
}
function examSelectPage() { return `${pageHeading("PhÃ²ng thi thá»­", "Chá»n khá»‘i lá»›p vÃ  Ä‘á» thi. Má»—i lÆ°á»£t thi cÃ³ thá»i gian tá»‘i Ä‘a 90 phÃºt.")}<div class="grid three">${["10", "11", "12"].map(g => `<article class="card clickable class-card" data-action="select-grade-route" data-grade="${g}" data-next="exam-list" data-category="exam"><div><span class="pill">THI THá»¬ Â· 90 PHÃšT</span><div class="grade">${gradeLabel(g)}</div><p>${by(g, "exam").length} Ä‘á» thi cÃ³ sáºµn</p></div><span class="arrow">â†’</span></article>`).join("")}</div>`; }
function examListPage(grade) { const list = by(grade, "exam"); return `${pageHeading(`Chá»n Ä‘á» thi â€” ${gradeLabel(grade)}`, "Má»—i Ä‘á» cÃ³ thá»i gian 90 phÃºt. Äá»™ khÃ³ Ä‘Æ°á»£c AI Ä‘Ã¡nh giÃ¡ khi backend Gemini Ä‘Ã£ Ä‘Æ°á»£c cáº¥u hÃ¬nh.")}${list.length ? `<div class="exam-list">${list.map((d, i) => `<article class="exam-card"><span class="pill">Äá»€ ${String(i + 1).padStart(2, "0")}</span><h3>${escapeHTML(d.title)}</h3><div class="exam-meta"><span>â—· Thá»i gian: 90 phÃºt</span><span>âœ¦ Äá»™ khÃ³: AI Ä‘Ã¡nh giÃ¡</span><span>â–¤ ${gradeLabel(d.grade)}</span></div><button class="button secondary" data-action="evaluate" data-id="${d.id}">ÄÃ¡nh giÃ¡ Ä‘á»™ khÃ³ báº±ng AI</button><button class="button primary" data-action="start-exam" data-id="${d.id}">VÃ o phÃ²ng thi â†’</button></article>`).join("")}</div>` : `<div class="empty-state"><h3>ChÆ°a cÃ³ Ä‘á» thi cho lá»›p ${grade}</h3><p>Upload Ä‘á» thi thá»­ Ä‘á»ƒ báº¯t Ä‘áº§u.</p><button class="button primary" data-action="open-upload">Upload Ä‘á» thi</button></div>`}<p class="footer-note">Äá» thi máº«u lÃ  dá»¯ liá»‡u minh há»a; ná»™i dung vÃ  thang Ä‘iá»ƒm cáº§n Ä‘Æ°á»£c quáº£n trá»‹ viÃªn bá»• sung.</p>`; }
function readerPage() {
    const d = findDoc(state.docId);
    if (!d) return subjectPage();

    // Include every document from the same subject and grade, regardless of category.
    const categoryOrder = ["theory", "practice", "exercise", "exam"];
    const related = docs().filter(item => item.subject === d.subject
        && String(item.grade) === String(d.grade)
        && String(item.id) !== String(d.id))
        .sort((a, b) => {
            const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
            return (categoryDiff || 0) || String(a.title || "").localeCompare(String(b.title || ""), "vi");
        });
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
        documentContent = `<div class="document-viewer"><iframe src="${escapeHTML(fileUrl)}" title="${escapeHTML(d.title)}" loading="eager"></iframe><p><a href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">Má»Ÿ tÃ i liá»‡u trong tab má»›i</a></p></div>`;
    } else if (fileUrl && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) {
        documentContent = `<div class="document-viewer"><img src="${escapeHTML(fileUrl)}" alt="${escapeHTML(d.title)}"><p><a href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">Má»Ÿ áº£nh trong tab má»›i</a></p></div>`;
    } else if (fileUrl) {
        documentContent = `<div class="empty-state"><h3>${escapeHTML(d.title)}</h3><p>TrÃ¬nh duyá»‡t chÆ°a há»— trá»£ xem trá»±c tiáº¿p Ä‘á»‹nh dáº¡ng nÃ y. Báº¡n cÃ³ thá»ƒ táº£i tá»‡p vá» Ä‘á»ƒ má»Ÿ.</p><a class="button primary" href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener noreferrer">Táº£i tÃ i liá»‡u</a></div>`;
    } else {
        documentContent = `<div class="empty-state"><h3>${escapeHTML(d.title)}</h3><p>Tá»‡p chÆ°a cÃ³ Ä‘Æ°á»ng dáº«n xem. HÃ£y táº£i láº¡i danh sÃ¡ch tÃ i liá»‡u hoáº·c nhá» quáº£n trá»‹ viÃªn kiá»ƒm tra tá»‡p Ä‘Ã£ táº£i lÃªn.</p></div>`;
    }

    const backRoute = d.category === "exam" ? "exam-select" : d.category === "practice" ? "practice" : "theory";
    return `${pageHeading(d.title, `${escapeHTML(d.subject)} Â· ${gradeLabel(d.grade)} Â· ${categoryName(d.category)}`)}
      <div class="reader-layout" id="reader-layout" data-reader-id="${escapeHTML(d.id)}" data-reader-title="${escapeHTML(d.title)}" data-reader-subject="${escapeHTML(d.subject)}" data-reader-grade="${escapeHTML(d.grade)}">
        <section class="reader-main">
          <div class="reading-progress"><div class="reading-progress-label"><span>Tiáº¿n trÃ¬nh Ä‘á»c</span><strong data-reading-percent>0%</strong></div><div class="reading-progress-track"><span data-reading-bar></span></div></div>
          ${documentContent}
          <div class="modal-actions"><button class="button secondary" data-route="${backRoute}">â† Quay láº¡i danh sÃ¡ch</button>${d.category === "exam" ? `<button class="button primary" data-action="start-exam" data-id="${escapeHTML(d.id)}">Báº¯t Ä‘áº§u thi thá»­</button>` : ""}</div>
        </section>
        <aside class="reader-side">
          <div class="reader-side-heading"><h3>TÃ i liá»‡u cÃ¹ng lá»›p</h3><span class="reader-side-count">${related.length + 1}</span></div>
          <div class="reader-related-list">
            <button class="reader-related-item is-current" type="button" aria-current="page" disabled>
              <span class="reader-related-icon">${CATEGORIES[d.category]?.icon || "â–¤"}</span>
              <span class="reader-related-copy"><strong>${escapeHTML(d.title)}</strong><small>Äang Ä‘á»c Â· ${escapeHTML(categoryName(d.category))}</small></span>
              <span class="reader-related-current" aria-label="TÃ i liá»‡u hiá»‡n táº¡i">âœ“</span>
            </button>
            ${related.map(item => `<button class="reader-related-item" type="button" data-action="read-doc" data-id="${escapeHTML(item.id)}">
              <span class="reader-related-icon">${CATEGORIES[item.category]?.icon || "â–¤"}</span>
              <span class="reader-related-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(categoryName(item.category))} Â· Lá»›p ${escapeHTML(item.grade)}</small></span>
              <span class="reader-related-arrow" aria-hidden="true">â€º</span>
            </button>`).join("")}
          </div>
          ${!related.length ? `<p class="reader-related-empty">ChÆ°a cÃ³ tÃ i liá»‡u khÃ¡c trong cÃ¹ng mÃ´n vÃ  khá»‘i lá»›p.</p>` : ""}
        </aside>
      </div>`;
}
function questionsFromTestTargets(targets = []) {
    const byQ = new Map();
    const romanOrderMap = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
    targets.forEach((t, idx) => {
        const qId = String(t.questionId || t.targetId || `I-${idx + 1}`);
        const secId = String(t.sectionId || qId.split("-")[0] || "I");
        const num = String(t.number || qId.split("-").pop() || (idx + 1));
        const type = String(t.type || "multiple_choice");
        const secOrder = romanOrderMap[secId.toUpperCase()] || Number(secId) || 1;
        if (!byQ.has(qId)) {
            byQ.set(qId, {
                id: qId,
                answerId: qId,
                number: num,
                sectionId: secId,
                layoutSectionOrder: secOrder,
                type,
                text: t.questionText || `CÃ¢u ${num}`,
                options: type === "multiple_choice" ? ["A", "B", "C", "D"].map(id => ({ id, text: "" })) : [],
                statements: type === "true_false" ? ["a", "b", "c", "d"].map(id => ({ id, text: "" })) : [],
                documentOrder: idx
            });
        }
    });
    return [...byQ.values()];
}
function questionsFor(doc) {
    if (activeExamQuestionsFor === String(doc?.id)) return activeExamQuestions;
    const layout = assessmentLayoutFor(doc);
    if (doc?.category === "test" && Array.isArray(doc?.questionTargets) && doc.questionTargets.length) {
        const isShortCustom = doc.questionTargets.length <= 15 && !doc.questionTargets.some(t => t.type === "true_false");
        if (isShortCustom || !layout) {
            return questionsFromTestTargets(doc.questionTargets);
        }
    }
    const parsedSource = parseQuestionText(doc?.content || "");
    const isShortOrSample = Boolean((doc?.sample && doc?.content) || (parsedSource.length > 0 && parsedSource.length <= 15));
    if (parsedSource.length) {
        return applyQuestionLayout(parsedSource, layout, { fillMissing: !isShortOrSample });
    }
    if (Array.isArray(doc?.questionIds) && doc.questionIds.length) {
        const fromIds = doc.questionIds.map((id, index) => ({ id: String(id), number: String(id), documentOrder: index, type: "essay", text: `CÃ¢u ${id}`, options: [], statements: [] }));
        return applyQuestionLayout(fromIds, layout, { fillMissing: !isShortOrSample });
    }
    if (layout && !doc?.content) {
        return applyQuestionLayout([], layout, { fillMissing: true });
    }
    if (Array.isArray(doc?.questionTargets) && doc.questionTargets.length) {
        return questionsFromTestTargets(doc.questionTargets);
    }
    return [];
}
function assessmentLayoutFor(doc) {
    if (!doc || !["practice", "exam", "test"].includes(doc.category)) return null;
    const normalizeKey = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[Ä‘Ä]/g, "d").toLocaleLowerCase("vi").replace(/[^a-z0-9]/g, "");
    const subjectKey = Object.keys(examLayoutConfig?.subjects || {}).find(key => normalizeKey(key) === normalizeKey(doc.subject));
    const subjectConfig = subjectKey
        ? examLayoutConfig.subjects[subjectKey]
        : (normalizeKey(doc.subject) === "dethithptquocgia" ? examLayoutConfig?.subjects?.["ToÃ¡n"] : null);
    return subjectConfig?.[doc.category] || subjectConfig?.assessment || null;
}
function gradingScaleFor(doc) {
    const normalizeKey=value=>String(value||"").normalize("NFD").replace(/\p{M}/gu,"").replace(/[Ã„â€˜Ã„Â]/g,"d").toLocaleLowerCase("vi").replace(/[^a-z0-9]/g,"");
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
    const isShortParsed = Array.isArray(questions) && questions.length > 0 && questions.length <= 15;
    questions = applyQuestionLayout(questions || [], layout, { fillMissing: !document?.sample && !isShortParsed });
    if (!questions.length) {
        const form = $("#answer-form");
        const summary = $("#answer-question-summary");
        if (form && !form.querySelector("[data-answer], [data-answer-choice], [data-answer-true-false]")) {
            if (summary) summary.textContent = "KhÃ´ng trÃ­ch xuáº¥t Ä‘Æ°á»£c cÃ¢u há»i tá»« tá»‡p. PDF scan cáº§n OCR hoáº·c táº£i Ä‘Ã¡p Ã¡n cÃ³ mÃ£ cÃ¢u há»i.";
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
    const isTest = d.category === "test";
    const showTimer = d.category === "exam" || isTest;
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
            : questions.map(question => `<div class="question"><h3>C\u00e2u ${escapeHTML(question.id)}. ${escapeHTML(question.body || question.text)}</h3></div>`).join("");
    const waitingForSource = (isPdf || isText || isDocx) && !questions.length;
    const summary = questions.length ? questionSummary(questions) : waitingForSource ? "\u0110ang \u0111\u1ecdc c\u1ea5u tr\u00fac c\u00e2u h\u1ecfi t\u1eeb t\u1ec7p\u2026" : questionSummary(questions);
    const instructionText = isTest
        ? `${gradeLabel(d.grade)} Â· MÃ´n ${escapeHTML(d.subject || "ToÃ¡n")} Â· BÃ i kiá»ƒm tra (${d.durationMinutes ? `Thá»i gian: ${d.durationMinutes} phÃºt` : "KhÃ´ng giá»›i háº¡n thá»i gian"}) Â· Tá»± Ä‘á»™ng ná»™p náº¿u thoÃ¡t toÃ n mÃ n hÃ¬nh`
        : `${gradeLabel(d.grade)} Â· ${d.category === "exam" ? "LÃ m bÃ i trong tá»‘i Ä‘a 90 phÃºt" : "LÃ m bÃ i tá»± luyá»‡n"}`;
    const initialTimerLabel = isTest
        ? (d.durationMinutes ? `${String(d.durationMinutes).padStart(2, "0")}:00` : "â± 00:00")
        : "90:00";
    return `${breadcrumb(isPractice ? "\u0110\u1ec1 \u00f4n t\u1eadp" : isTest ? "B\u00e0i ki\u1ec3m tra" : "Ph\u00f2ng thi th\u1eed")}<div class="exam-toolbar" data-exam-id="${escapeHTML(d.id)}" data-exam-title="${escapeHTML(d.title)}" data-exam-grade="${escapeHTML(d.grade)}"><div><strong>${escapeHTML(d.title)}</strong><div class="exam-instructions">${instructionText}</div></div><div id="timer" class="timer" ${showTimer ? "" : "hidden"}>${initialTimerLabel}</div><button class="button primary" data-action="submit-exam">N\u1ed9p b\u00e0i</button></div><div class="split-exam" id="split-exam"><section class="exam-pane paper" id="paper-pane">${paper}</section><div class="splitter" id="splitter" role="separator" tabindex="0" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50" aria-label="K\u00e9o \u0111\u1ec3 thay \u0111\u1ed5i k\u00edch th\u01b0\u1edbc hai khung"></div><section class="exam-pane answers" id="answer-pane"><span class="pill">PH\u1ea6N \u0110I\u1ec0N \u0110\u00c1P \u00c1N</span><h2>B\u00e0i l\u00e0m c\u1ee7a b\u1ea1n</h2><p class="muted" id="answer-question-summary">${summary}</p><form id="answer-form">${answerFields(questions, waitingForSource, assessmentLayoutFor(d))}</form></section></div>`;
}
function formatGradeAnswer(value, type = "") {
    if (value === null || value === undefined || value === "") return "Bá» trá»‘ng";
    if (Array.isArray(value)) return value.map(item => formatGradeAnswer(item, type)).join(" / ");
    if (type === "true_false") {
        const normalized = String(value).trim().toLowerCase();
        if (["true", "Ä‘Ãºng", "dung", "d", "t"].includes(normalized)) return "ÄÃºng";
        if (["false", "sai", "s", "f"].includes(normalized)) return "Sai";
    }
    return String(value);
}

function formatGradeAnswerDetails(item, property) {
    if (Array.isArray(item.statements) && item.statements.length) {
        return item.statements.map(statement => {
            const label = statement.statement ? String(statement.statement).toLowerCase() + ") " : "";
            return escapeHTML(label) + escapeHTML(formatGradeAnswer(statement[property], "true_false"));
        }).join("<br>");
    }
    return escapeHTML(formatGradeAnswer(item[property], item.type));
}

function renderGradeDetailsTable(rows) {
    if (!rows.length) return '<p class="muted">ChÆ°a cÃ³ dá»¯ liá»‡u Ä‘á»‘i chiáº¿u Ä‘Ã¡p Ã¡n cho bÃ i lÃ m nÃ y.</p>';
    const body = rows.map(item => {
        const studentAnswer = formatGradeAnswerDetails(item, "userAnswer");
        const correctAnswer = formatGradeAnswerDetails(item, "expectedAnswer");
        const correct = Boolean(item.correct);
        return `<tr>
          <td><strong>CÃ¢u ${escapeHTML(item.question)}</strong></td>
          <td>${studentAnswer}</td>
          <td>${correctAnswer}</td>
          <td><strong class="${correct ? "is-correct" : "is-wrong"}">${correct ? "ÄÃºng" : "ChÆ°a Ä‘Ãºng"}</strong></td>
          <td>${escapeHTML(item.earnedPoints ?? 0)} / ${escapeHTML(item.totalPoints ?? 0)}</td>
        </tr>`;
    }).join("");
    return `<div class="grade-details-table-wrap" role="region" aria-label="So sÃ¡nh Ä‘Ã¡p Ã¡n bÃ i lÃ m" tabindex="0">
      <table class="grade-details-table">
        <thead><tr><th>CÃ¢u há»i</th><th>Há»c sinh Ä‘Ã£ chá»n / tráº£ lá»i</th><th>ÄÃ¡p Ã¡n Ä‘Ãºng</th><th>Káº¿t quáº£</th><th>Äiá»ƒm</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function resultPage() {
    const saved = state.route === "saved-result" ? state.savedExamResult : null;
    const d = saved ? { title: saved.title, subject: saved.subject, grade: saved.grade, category: saved.category } : findDoc(state.examDocId);
    const result = saved ? saved.result : state.gradeResult;
    const answers = saved ? (saved.answers || {}) : state.answers;
    const answered = Object.values(answers).filter(value => String(value).trim()).length;
    const layout = assessmentLayoutFor(d);
    const answerableCount = result?.questionCount || (layout?.sections || []).reduce((total, section) => total + Number(section.count || 0) * (section.type === "true_false" ? (section.statements || ["a", "b", "c", "d"]).length : 1), 0) || Object.keys(answers).length;
    const rows = Array.isArray(result?.results) ? result.results : [];
    const owner = saved?.userName ? `<p class="muted tiny">BÃ i lÃ m cá»§a ${escapeHTML(saved.userName)}${saved.userEmail ? ` (${escapeHTML(saved.userEmail)})` : ""}${saved.createdAt ? ` Â· ${escapeHTML(saved.createdAt)}` : ""}</p>` : "";
    const isPendingGrade = result?.gradingStatus === "pending_grade" || (d?.category === "test" && !result?.graded);
    const details = result?.graded
        ? `<div class="result-score">${Number(result.score ?? result.earnedPoints).toFixed(2)}/${result.scale ?? result.totalPoints}</div><p class="muted">${result.percent ?? 0}% Â· ${result.correctCount ?? 0}/${result.questionCount ?? rows.length} cÃ¢u Ä‘Ãºng Â· ${result.earnedPoints ?? result.score ?? 0}/${result.totalPoints ?? result.scale ?? 0} Ä‘iá»ƒm</p><h2>Äá»‘i chiáº¿u Ä‘Ã¡p Ã¡n tá»«ng cÃ¢u</h2>${renderGradeDetailsTable(rows)}`
        : isPendingGrade
          ? `<div class="result-score" style="color:var(--orange)">Äang chá» cháº¥m</div><p class="muted">${escapeHTML(result?.message || "BÃ i kiá»ƒm tra cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c ná»™p vÃ  Ä‘ang chá» giÃ¡o viÃªn cháº¥m Ä‘iá»ƒm.")}</p>`
          : `<div class="result-score">â€”/${result?.scale ?? result?.totalPoints ?? gradingScaleFor(d)}</div><p class="muted">${escapeHTML(result?.message || "BÃ i Ä‘Ã£ ná»™p. ChÆ°a cÃ³ Ä‘Ã¡p Ã¡n mÃ¡y Ä‘á»c Ä‘Æ°á»£c Ä‘á»ƒ cháº¥m tá»± Ä‘á»™ng.")}</p>`;
    const isTestItem = d?.category === "test" || result?.isTest;
    const actions = isTestItem
        ? `<button class="button secondary" data-route="tests">â† Vá» danh sÃ¡ch BÃ i kiá»ƒm tra</button><button class="button primary" data-export-user-sheets="xlsx">â¬‡ Xuáº¥t Sheets káº¿t quáº£ há»c táº­p</button>`
        : saved
          ? (currentUser?.role === "admin" ? `<button class="button secondary" data-route="admin">Quay láº¡i tiáº¿n trÃ¬nh</button>` : `<button class="button secondary" data-route="home">Vá» trang há»c táº­p</button>`)
          : `<button class="button secondary" data-route="exam-select">Chá»n Ä‘á» khÃ¡c</button><button class="button primary" data-route="subject">Vá» mÃ´n ToÃ¡n</button>`;
    return `${pageHeading("Káº¿t quáº£ bÃ i lÃ m", d?.title || "Äá» thi")}<div class="result-panel"><span class="pill">${isPendingGrade ? "ÄANG CHá»œ CHáº¤M" : "ÄÃƒ Ná»˜P BÃ€I"}</span>${owner}${details}${result?.graded ? "" : `<h2>TÃ¬nh tráº¡ng bÃ i lÃ m</h2><p class="muted">Sá»‘ cÃ¢u Ä‘Ã£ tráº£ lá»i: ${answered}/${answerableCount}</p>`}<div class="modal-actions">${actions}</div></div>`;
}

async function openSavedExamResult(id) {
    try {
        const endpoint = currentUser?.role === "admin"
            ? "/api/admin/exam-results/" + encodeURIComponent(id)
            : "/api/exam-results/" + encodeURIComponent(id);
        const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "KhÃ´ng táº£i Ä‘Æ°á»£c káº¿t quáº£ bÃ i lÃ m.");
        state.savedExamResult = data;
        go("saved-result");
    } catch (error) {
        toast(error.message || "KhÃ´ng táº£i Ä‘Æ°á»£c káº¿t quáº£ bÃ i lÃ m.", "error");
    }
}

function accountCenterPage() {
    if (!currentUser) {
        return `${pageHeading("Trung tÃ¢m tÃ i khoáº£n", "Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ quáº£n lÃ½ tÃ i khoáº£n vÃ  xem tiáº¿n trÃ¬nh há»c táº­p.")}<div class="empty-state"><h3>ChÆ°a Ä‘Äƒng nháº­p</h3><p>HÃ£y Ä‘Äƒng nháº­p Ä‘á»ƒ xem tiáº¿n trÃ¬nh há»c táº­p thá»i gian thá»±c, Ä‘á»•i Gmail, Ä‘á»•i máº­t kháº©u hoáº·c quáº£n lÃ½ tÃ i khoáº£n.</p><button class="button primary" type="button" onclick="document.querySelector('#login-open')?.click()">ÄÄƒng nháº­p ngay</button></div>`;
    }
    if (currentUser.role === "admin") {
        return adminPage();
    }
    const roleName = currentUser.classCode ? `Há»c sinh trong trÆ°á»ng Â· Lá»›p ${currentUser.classCode}` : currentUser.accountType === "school" ? "Há»c sinh trong trÆ°á»ng" : "Há»c sinh ngoÃ i trÆ°á»ng";
    return `
      ${pageHeading("Trung tÃ¢m tÃ i khoáº£n", "Quáº£n lÃ½ thÃ´ng tin báº£o máº­t vÃ  theo dÃµi tiáº¿n trÃ¬nh há»c táº­p theo thá»i gian thá»±c.")}
      <div class="admin-toolbar">
        <div>
          <span class="pill">TÃ€I KHOáº¢N CÃ NHÃ‚N</span>
          <h2 style="margin:10px 0 2px">${escapeHTML(currentUser.name)}</h2>
          <p class="muted" style="margin:0"><strong id="account-center-current-email">${escapeHTML(currentUser.email)}</strong> Â· <span class="role-chip">${escapeHTML(roleName)}</span></p>
        </div>
        <button class="button secondary" data-route="home">â† Vá» trang há»c táº­p</button>
      </div>

      <section class="account-section card">
        <div class="account-section-head">
          <div>
            <span class="pill">REALTIME Â· Tá»I ÄA 10 Má»¤C HIá»‚N THá»Š TRÆ¯á»šC KHI CUá»˜N</span>
            <h2>Tiáº¿n trÃ¬nh há»c táº­p</h2>
            <p class="muted">Tá»± Ä‘á»™ng cáº­p nháº­t theo thá»i gian thá»±c khi báº¡n Ä‘á»c lÃ½ thuyáº¿t, luyá»‡n táº­p hoáº·c lÃ m Ä‘á» thi thá»­.</p>
          </div>
          <div class="account-progress-meta">
            <span class="online-live-indicator"><span class="online-dot"></span> Äang Ä‘á»“ng bá»™ trá»±c tiáº¿p</span>
            <button type="button" class="button secondary small" data-export-user-sheets="xlsx">â¬‡ Xuáº¥t Sheets káº¿t quáº£ há»c táº­p (.xlsx)</button>
            <button type="button" class="button secondary small" data-account-progress-refresh>â†» LÃ m má»›i</button>
          </div>
        </div>
        <div class="stat-row account-progress-stats">
          <div class="stat"><span class="muted">BÃ i / Äá» Ä‘Ã£ há»c</span><strong id="account-progress-total">0</strong></div>
          <div class="stat"><span class="muted">ÄÃ£ hoÃ n thÃ nh</span><strong id="account-progress-completed">0</strong></div>
          <div class="stat"><span class="muted">Tiáº¿n trÃ¬nh trung bÃ¬nh</span><strong id="account-progress-avg">0%</strong></div>
        </div>
        <div class="account-progress-head-row" aria-hidden="true">
          <span>BÃ€I / Äá»€ ÄANG Há»ŒC</span>
          <span>NGÃ€Y Báº®T Äáº¦U Há»ŒC</span>
          <span>TIáº¾N TRÃŒNH (%)</span>
        </div>
        <div class="account-progress-list" id="account-progress-list" role="region" aria-label="Danh sÃ¡ch tiáº¿n trÃ¬nh há»c táº­p" tabindex="0">
          <p class="muted">Äang táº£i tiáº¿n trÃ¬nh há»c táº­pâ€¦</p>
        </div>
      </section>

      <section class="account-section card account-ai-history-section">
        <div class="account-section-head">
          <div>
            <span class="pill">AI Â· Lá»ŠCH Sá»¬ CÃ NHÃ‚N</span>
            <h2>Lá»‹ch sá»­ giáº£i bÃ i báº±ng AI</h2>
            <p class="muted">Hiá»ƒn thá»‹ tá»‘i Ä‘a 10 má»¥c cÃ¹ng lÃºc; cuá»™n trong danh sÃ¡ch Ä‘á»ƒ xem cÃ¡c lá»i giáº£i cÅ©. Chá»n má»™t má»¥c Ä‘á»ƒ má»Ÿ láº¡i lá»i giáº£i Ä‘áº§y Ä‘á»§.</p>
          </div>
          <button type="button" class="button secondary small" data-ai-history-refresh>â†» LÃ m má»›i lá»‹ch sá»­</button>
        </div>
        <div class="account-ai-history-summary muted tiny" id="account-ai-history-summary">Äang táº£i lá»‹ch sá»­ giáº£i bÃ iâ€¦</div>
        <div class="account-ai-history-list" id="account-ai-history-list" role="region" aria-label="Lá»‹ch sá»­ giáº£i bÃ i báº±ng AI, tá»‘i Ä‘a 10 má»¥c hiá»ƒn thá»‹ trÆ°á»›c khi cuá»™n" tabindex="0">
          <p class="muted">Äang táº£i lá»‹ch sá»­ giáº£i bÃ iâ€¦</p>
        </div>
      </section>

      <div class="account-settings-grid">
        <section class="account-section card">
          <span class="pill">Báº¢O Máº¬T GMAIL</span>
          <h3>Email &amp; Äá»•i Ä‘á»‹a chá»‰ Email</h3>
          <p class="muted">Email hiá»‡n táº¡i: <strong id="account-form-current-email">${escapeHTML(currentUser.email)}</strong>. Thao tÃ¡c Ä‘á»•i Email yÃªu cáº§u nháº­p mÃ£ xÃ¡c minh 6 chá»¯ sá»‘ gá»­i qua Gmail.</p>
          <form id="account-change-email-form" class="account-form">
            <label>
              Email (Gmail) má»›i
              <input name="newEmail" type="email" required maxlength="254" autocomplete="email" placeholder="Nháº­p Ä‘á»‹a chá»‰ Gmail má»›i (vÃ­ dá»¥: banmoi@gmail.com)">
            </label>
            <p class="auth-error" id="account-email-error" hidden></p>
            <div class="account-form-actions">
              <button type="submit" class="button primary">Gá»­i mÃ£ xÃ¡c minh &amp; Äá»•i Email</button>
            </div>
          </form>
        </section>

        <section class="account-section card">
          <span class="pill">Máº¬T KHáº¨U</span>
          <h3>Äá»•i máº­t kháº©u tÃ i khoáº£n</h3>
          <p class="muted">Nháº­p máº­t kháº©u má»›i (tá»‘i thiá»ƒu 8 kÃ½ tá»±). Há»‡ thá»‘ng sáº½ má»Ÿ há»™p thoáº¡i xÃ¡c nháº­n mÃ£ 6 chá»¯ sá»‘ gá»­i tá»›i Gmail <strong>${escapeHTML(currentUser.email)}</strong>.</p>
          <form id="account-change-password-form" class="account-form">
            <label>
              Máº­t kháº©u má»›i
              <input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="Ãt nháº¥t 8 kÃ½ tá»±">
            </label>
            <label>
              Nháº­p láº¡i máº­t kháº©u má»›i
              <input name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="Nháº­p láº¡i máº­t kháº©u má»›i">
            </label>
            <p class="auth-error" id="account-password-error" hidden></p>
            <div class="account-form-actions">
              <button type="submit" class="button primary">Gá»­i mÃ£ xÃ¡c minh &amp; Äá»•i máº­t kháº©u</button>
            </div>
          </form>
        </section>
      </div>

      <section class="account-section card account-danger-card">
        <div class="account-danger-content">
          <div>
            <span class="pill danger-pill">VÃ™NG NGUY HIá»‚M Â· XÃC NHáº¬N GMAIL</span>
            <h3>XÃ³a tÃ i khoáº£n vÄ©nh viá»…n</h3>
            <p class="muted">XÃ³a toÃ n bá»™ tÃ i khoáº£n, lá»‹ch sá»­ lÃ m bÃ i vÃ  dá»¯ liá»‡u há»c táº­p cÃ¡ nhÃ¢n. Báº¡n sáº½ cáº§n xÃ¡c nháº­n báº±ng mÃ£ 6 chá»¯ sá»‘ gá»­i tá»›i Gmail <strong>${escapeHTML(currentUser.email)}</strong>.</p>
          </div>
          <button type="button" class="button danger" id="account-delete-open" data-account-delete-open>
            XÃ³a tÃ i khoáº£n
          </button>
        </div>
      </section>
    `;
}

function formatAdminCreatedAt(value) {
    if (value === null || value === undefined || value === "") return "â€”";

    let date;
    if (value instanceof Date) {
        date = value;
    } else if (typeof value === "number" || /^\d{10,13}$/.test(String(value).trim())) {
        const timestamp = Number(value);
        date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    } else {
        const raw = String(value).trim().replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})$/, "$1:00");
        const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
        const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
        date = new Date(
            !hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)
                ? normalized + "Z"
                : normalized
        );
    }

    if (!date || !Number.isFinite(date.getTime())) return "â€”";
    return date.toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short"
    });
}

function adminPage() {
  const isTeacher = currentUser && (currentUser.isTeacher || currentUser.role === "teacher" || (currentUser.role === "admin" && Number(currentUser.adminLevel) < 2));
  if (isTeacher) {
    return `<div id="admin-users-table" hidden></div>`;
  }
  return `${pageHeading("Quáº£n trá»‹ MAI Há»ŒC", "Quáº£n lÃ½ tÃ i khoáº£n vÃ  phÃ¢n quyá»n há»‡ thá»‘ng.")}<div class="admin-toolbar"><div><span class="pill">QUáº¢N TRá»Š Há»† THá»NG</span><h2 style="margin:10px 0 2px">TÃ i khoáº£n ngÆ°á»i dÃ¹ng</h2><p class="muted" style="margin:0">PhÃ¢n quyá»n rÃµ rÃ ng giá»¯a Quáº£n trá»‹ MAI Há»ŒC, GiÃ¡o viÃªn (Chá»§ nhiá»‡m / Bá»™ mÃ´n) vÃ  Há»c sinh (Trong trÆ°á»ng / NgoÃ i trÆ°á»ng).</p></div><button class="button secondary" data-route="home">â† Vá» trang há»c táº­p</button></div><div class="stat-row"><div class="stat"><span class="muted">Tá»•ng tÃ i khoáº£n</span><strong id="admin-user-total">â€”</strong></div><div class="stat"><span class="muted">PhÃ¢n quyá»n</span><strong>Admin Â· GiÃ¡o viÃªn Â· Há»c sinh</strong></div></div><p id="admin-users-status" class="muted">Äang táº£i danh sÃ¡ch tÃ i khoáº£nâ€¦</p><div id="admin-users-table"></div>`;
}
async function loadAdminUsers() {
  if (state.route !== "admin") return;
  if (!currentUser || Number(currentUser.adminLevel) < 2) return;

  const status = $("#admin-users-status");
  const container = $("#admin-users-table");

  try {
    const response = await fetch("/api/admin/users", { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "KhÃ´ng thá»ƒ táº£i danh sÃ¡ch tÃ i khoáº£n.");
    if (state.route !== "admin") return;

    const total = $("#admin-user-total");
    if (total) total.textContent = String(payload.total ?? payload.users?.length ?? 0);
    if (status) status.textContent = `Hiá»ƒn thá»‹ ${payload.users?.length || 0} tÃ i khoáº£n gáº§n nháº¥t.`;

    const rows = (payload.users || []).map((u) => {
      const created = formatAdminCreatedAt(u.createdAt);
      const isSuper = u.role === "admin" && Number(u.adminLevel) >= 2;
      const isTeacher = Boolean(u.isTeacher || u.role === "teacher" || (u.role === "admin" && Number(u.adminLevel) >= 1 && Number(u.adminLevel) < 2));
      const roleLabel = isSuper
        ? "Quáº£n trá»‹ MAI Há»ŒC"
        : isTeacher
          ? (u.homeroomClass
              ? `GiÃ¡o viÃªn chá»§ nhiá»‡m Â· Lá»›p ${u.homeroomClass}`
              : u.teacherKind === "homeroom"
                ? "GiÃ¡o viÃªn chá»§ nhiá»‡m"
                : "GiÃ¡o viÃªn bá»™ mÃ´n")
          : (u.accountType === "school" || u.classCode)
            ? (u.classCode ? `Há»c sinh trong trÆ°á»ng Â· Lá»›p ${u.classCode}` : "Há»c sinh trong trÆ°á»ng")
            : "Há»c sinh ngoÃ i trÆ°á»ng";
      const canRequestDelete = Number(u.id) !== Number(payload.currentUserId) && !isSuper;
      return `<tr><td>${u.id}</td><td>${escapeHTML(u.name)}</td><td>${escapeHTML(u.email)}</td><td><span class="role-chip">${escapeHTML(roleLabel)}</span></td><td>${escapeHTML(created)}</td><td>${canRequestDelete ? `<button class="button secondary small" data-delete-user="${u.id}">${payload.isSuperAdmin ? "XÃ³a" : "Gá»­i yÃªu cáº§u xÃ³a"}</button>` : "â€”"}</td></tr>`;
    }).join("");

    let extra = "";
    if (payload.isSuperAdmin) {
      const schoolClasses = ["10A", "11B", "12C"].flatMap((prefix) =>
        Array.from({ length: 9 }, (_, index) => prefix + (index + 1))
      );
      const classOptions = schoolClasses.map((code) => `<option value="${code}">${code}</option>`).join("");
      const subjectNames = ["ToÃ¡n", "Tiáº¿ng Anh", "Váº­t lÃ½", "HÃ³a há»c", "Ngá»¯ vÄƒn", "Sinh há»c", "IELTS"];
      const subjectCheckboxes = subjectNames.map((subject) =>
        `<label class="teacher-check-option"><input type="checkbox" name="subjects" value="${subject}"><span>${subject}</span></label>`
      ).join("");
      const classCheckboxes = schoolClasses.map((code) =>
        `<label class="teacher-check-option"><input type="checkbox" name="teachingClasses" value="${code}"><span>${code}</span></label>`
      ).join("");

      extra = `<section class="admin-submissions teacher-create-section" style="margin-top:20px">
        <div class="teacher-create-toggle-row">
          <div><h2>Quáº£n lÃ½ giÃ¡o viÃªn</h2><p class="muted tiny">Táº¡o tÃ i khoáº£n má»›i hoáº·c phÃ¢n cÃ´ng giÃ¡o viÃªn hiá»‡n cÃ³.</p></div>
          <button class="button primary" type="button" id="teacher-create-toggle" aria-expanded="false">ï¼‹ Táº¡o giÃ¡o viÃªn</button>
        </div>
        <div id="teacher-create-panel" hidden>
          <form id="create-subadmin-form" class="admin-form-grid teacher-create-form">
            <label>Email tÃ i khoáº£n<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
            <label>Há» vÃ  tÃªn <span class="muted tiny">(báº¯t buá»™c vá»›i email má»›i)</span><input name="name" minlength="2" maxlength="80" autocomplete="name"></label>
            <label>Máº­t kháº©u táº¡m thá»i <span class="muted tiny">(báº¯t buá»™c vá»›i email má»›i)</span><input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password"></label>
            <fieldset class="teacher-check-group"><legend>Bá»™ mÃ´n giáº£ng dáº¡y <span class="muted tiny">(chá»n nhiá»u)</span></legend><div class="teacher-check-grid">${subjectCheckboxes}</div></fieldset>
            <label>Loáº¡i giÃ¡o viÃªn<select name="teacherKind" id="teacher-kind"><option value="subject">GiÃ¡o viÃªn bá»™ mÃ´n</option><option value="homeroom">GiÃ¡o viÃªn chá»§ nhiá»‡m</option></select></label>
            <label id="homeroom-class-field" hidden>Lá»›p chá»§ nhiá»‡m<select name="homeroomClass"><option value="">Chá»n lá»›p chá»§ nhiá»‡m</option>${classOptions}</select></label>
            <fieldset class="teacher-check-group" id="teaching-classes-group"><legend>CÃ¡c lá»›p Ä‘ang giáº£ng dáº¡y <span class="muted tiny">(chá»n nhiá»u)</span></legend><div class="teacher-class-grid">${classCheckboxes}</div></fieldset>
            <button class="button primary" type="submit">Cáº¥p quyá»n / Táº¡o giÃ¡o viÃªn</button>
          </form>
          <p class="muted tiny">Náº¿u email Ä‘Ã£ cÃ³ tÃ i khoáº£n, há»‡ thá»‘ng giá»¯ nguyÃªn máº­t kháº©u vÃ  lá»‹ch sá»­ há»c táº­p, Ä‘á»“ng thá»i chuyá»ƒn tÃ i khoáº£n thÃ nh giÃ¡o viÃªn cá»§a trÆ°á»ng.</p>
        </div>
      </section>
      <section class="admin-submissions" style="margin-top:20px"><h2>YÃªu cáº§u xÃ³a tÃ i khoáº£n chá» duyá»‡t</h2><div id="account-deletion-requests"><p class="muted">Äang táº£i yÃªu cáº§uâ€¦</p></div></section>`;
    }

    if (container) {
      container.innerHTML = `<div class="admin-table-wrap admin-users-scroll" role="region" aria-label="Danh sÃ¡ch tÃ i khoáº£n, tá»‘i Ä‘a 5 dÃ²ng hiá»ƒn thá»‹ trÆ°á»›c khi cuá»™n" tabindex="0"><table class="admin-table"><thead><tr><th>ID</th><th>Há» vÃ  tÃªn</th><th>Email</th><th>Vai trÃ²</th><th>NgÃ y táº¡o</th><th>Thao tÃ¡c</th></tr></thead><tbody>${rows || '<tr><td colspan="6">ChÆ°a cÃ³ tÃ i khoáº£n.</td></tr>'}</tbody></table></div>${extra}`;
    }
    if (payload.isSuperAdmin) await loadAccountDeletionRequests();
  } catch (error) {
    if (state.route !== "admin") return;
    if (status) {
      status.textContent = error.message || "Lá»—i khi táº£i dá»¯ liá»‡u.";
      status.classList.add("auth-error");
    }
    if (container) container.innerHTML = "";
  }
}

function render() {
    if (schoolRoutes.has(state.route) && !authResolved) {
        view.innerHTML = '<p role="status">Äang kiá»ƒm tra tÃ i khoáº£nâ€¦</p>';
        return;
    }
    if (schoolRoutes.has(state.route) && !canAccessSchool(currentUser)) {
        state.route = 'home';
        history.replaceState(saveRouteHistory(), '', routeUrl({ route: 'home' }));
    }
    disposeTeachingAdvisor?.(); disposeTeachingAdvisor = null;
    if (currentUser?.isTeacher) disposeTeachingAdvisor = mountLearningAdvisor(document.getElementById('view'), { teaching: true });
    if (state.route === "account-center" && currentUser?.role === "admin") {
        state.route = "admin";
        history.replaceState(saveRouteHistory(), "", window.location.href);
    }
    if (activeActivityCleanup) { activeActivityCleanup(); activeActivityCleanup = null; }
    if (activePortalCleanup) { activePortalCleanup(); activePortalCleanup = null; }
    document.querySelectorAll('.education-sidebar [data-route]').forEach(button => { const active=button.dataset.route===state.route; button.classList.toggle('active',active); if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); });
    const studentOnly = Boolean(currentUser && currentUser.role === 'user' && !currentUser.isTeacher && !currentUser.isSuperAdmin);
    document.querySelectorAll('[data-student-only]').forEach(el => { el.hidden = !studentOnly; });
    document.querySelectorAll('[data-staff-only]').forEach(el => { el.hidden = !currentUser || studentOnly; });
    const sidebarSpace = !canAccessSchool(currentUser) ? 'learning' : schoolRoutes.has(state.route) ? 'school' : state.route === 'account-center' ? (sessionStorage.getItem('maihoc-sidebar-space') || 'learning') : 'learning';
    sessionStorage.setItem('maihoc-sidebar-space', sidebarSpace);
    document.querySelectorAll('[data-sidebar-space]').forEach(group => { group.hidden = group.dataset.sidebarSpace !== sidebarSpace; });
    document.querySelectorAll('[data-space]').forEach(button => { button.hidden = button.dataset.space === 'school' && !canAccessSchool(currentUser); const active = button.dataset.space === sidebarSpace; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    document.getElementById('education-sidebar')?.classList.remove('is-open');
    document.getElementById('education-menu')?.setAttribute('aria-expanded','false');
    const title=document.querySelector('.education-top-title'); if(title)title.textContent=sidebarSpace === 'school' ? 'MAIHOC School' : 'MAIHOC Learning';
    stopStudyRoomsIfActive();
    stopChemistryIfActive();
    stopUniversalAiIfActive();
    const isMainLobby = state.route === "home";
    document.body.classList.toggle("is-home-lobby", isMainLobby);
    const onlineDashboard = $("#online-dashboard");
    const onlineLauncher = $("#online-dashboard-launcher");

    if (onlineLauncher) onlineLauncher.hidden = !isMainLobby;
    $("#tests-open")?.classList.toggle("is-active-route", state.route === "tests");
    $("#school-classes-open")?.classList.toggle("is-active-route", state.route === "school" || state.route === "school-class");
    $("#admin-open")?.classList.toggle("is-active-route", state.route === "admin");
    $("#account-center-open")?.classList.toggle("is-active-route", state.route === "account-center");

    view.classList.toggle("reader-fullscreen", state.route === "reader");
    document.body.classList.toggle("reader-open", state.route === "reader");
    view.classList.toggle("exam-workspace", state.route === "exam");
    view.classList.toggle("chemistry-workspace", state.route === "chemistry");
    view.classList.toggle("universal-ai-workspace", state.route === "ai-solver");
    const examCategory = findDoc(state.examDocId)?.category;
    const fullscreenExam = state.route === "exam" && ["exam", "test"].includes(examCategory);
    view.classList.toggle("exam-fullscreen", fullscreenExam);
    document.body.classList.toggle("exam-open", fullscreenExam);
    document.body.classList.toggle("practice-open", state.route === "exam" && !fullscreenExam);
    document.body.classList.toggle("test-open", state.route === "exam" && examCategory === "test");
    if (state.route === "home") {
        view.innerHTML = homePage();
        activePortalCleanup = mountTimetablePreview(view, currentUser);
    }
    else if (state.route === "analytics") activePortalCleanup = mountLearningProgress(view, currentUser);
    else if (state.route === "timetable") {
        const createNew = Boolean(state.newTimetable);
        state.newTimetable = false;
        activePortalCleanup = mountTimetable(view, currentUser, { createNew });
    }
    else if (['organization','question-bank','assignments','assignment-management','school-analytics'].includes(state.route)) {
        activePortalCleanup = mountPortal(view, state.route, currentUser, go);
    }
    else if (state.route === "chemistry") {
        view.innerHTML = "";
        activeChemistryCleanup = mountChemistryModule(view, {
            subView: state.chemistryTab || "periodic-table",
            initialElement: state.chemistryElement || null,
            onNavigate: (r, p) => go(r, p)
        });
    }
    else if (state.route === "ai-solver") {
        view.innerHTML = "";
        activeUniversalAiCleanup = mountUniversalAiSolver(view, { onNavigate: (r, p) => go(r, p) });
    }
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
    else if (state.route === "account-center")
        view.innerHTML = accountCenterPage();
    else if (state.route === "tests")
        view.innerHTML = renderTestsQueuePage(currentUser);
    else if (state.route === "school")
        mountSchoolPage(view, currentUser);
    else if (state.route === "school-class")
        mountSchoolPage(view, currentUser, state.classCode || "");
    else if (state.route === "student-progress")
        mountStudentProgressPage(view, progressTabParams.get("classCode") || "", progressTabParams.get("studentId") || "");
    else if (state.route === "student-progress")
        mountStudentProgressPage(view, progressTabParams.get("classCode") || "", progressTabParams.get("studentId") || "");
    else if (state.route === "study-rooms") {
        view.innerHTML = "";
        activeStudyRoomsCleanup = mountStudyRooms(view, currentUser);
    }
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
    if (state.route === 'home') activeActivityCleanup = hydrateActivity(view, currentUser);
    view.focus({ preventScroll: true });
    if (state.route === "admin")
        loadAdminUsers();
    if (state.route === "account-center")
        window.dispatchEvent(new CustomEvent("maihoc-account-center-open"));
    window.dispatchEvent(new CustomEvent("maihoc-route-changed", { detail: { route: state.route, subject: state.subject, grade: state.grade } }));
    if (state.route === "exam") {
        if (activeTestDraft) {
            const label=document.createElement('p'); label.dataset.testSaveStatus=''; label.setAttribute('role','status'); label.textContent=activeTestDraft.disabled?'Báº£n nhÃ¡p Ä‘Æ°á»£c lÆ°u trÃªn mÃ¡y nÃ y.':'PhiÃªn lÃ m bÃ i vÃ  thá»i háº¡n Ä‘Æ°á»£c quáº£n lÃ½ táº¡i mÃ¡y chá»§.';
            view.querySelector('.exam-toolbar')?.after(label);
        }
        wireSplitter();
        if (state.examStarted && !state.examFinished && !state.submitRetryRequired && ["exam", "test"].includes(findDoc(state.examDocId)?.category))
            startTimer();
    }
}
function startTimer() {
    if (state.timer)
        return;
    updateTimer();
    state.timer = setInterval(() => {
        if (state.timerCountUp) {
            state.elapsedSeconds = (state.elapsedSeconds || 0) + 1;
            updateTimer();
            return;
        }
        state.remaining = state.serverDeadline ? Math.max(0, Math.ceil((new Date(state.serverDeadline).getTime() - Date.now()) / 1000)) : state.remaining - 1;
        updateTimer();
        if (state.remaining === 300 && !state.warningShown) {
            state.warningShown = true;
            toast("Báº¡n cÃ²n 5 phÃºt! HÃ£y kiá»ƒm tra bÃ i vÃ  chuáº©n bá»‹ ná»™p.", "error");
        }
        if (state.remaining <= 0) {
            clearInterval(state.timer);
            state.timer = null;
            toast("ÄÃ£ háº¿t giá». BÃ i lÃ m sáº½ Ä‘Æ°á»£c ná»™p tá»± Ä‘á»™ng.", "error");
            finishExam();
        }
    }, 1000);
}
function updateTimer() {
    const el = $("#timer");
    if (!el) return;
    if (state.timerCountUp) {
        const m = Math.floor((state.elapsedSeconds || 0) / 60);
        const s = (state.elapsedSeconds || 0) % 60;
        el.textContent = `â± ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        el.classList.remove("warning");
        return;
    }
    const m = Math.floor(Math.max(0, state.remaining) / 60);
    const s = Math.max(0, state.remaining) % 60;
    el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("warning", state.remaining <= 300);
}
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
function finishExam(options = {}) {
    if (state.examFinished)
        return;
    state.submitRetryRequired = false;
    state.examFinished = true;
    state.examStarted = false;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    const examDoc = findDoc(state.examDocId);
    const isTest = examDoc?.category === "test";
    const submittedAnswers = { ...state.answers };
    const timeSpentSeconds = state.examStartedAtMs
        ? Math.max(1, Math.round((Date.now() - state.examStartedAtMs) / 1000))
        : 0;
    const submitEndpoint = isTest
        ? `/api/tests/${encodeURIComponent(state.examDocId)}/submit`
        : `/api/exams/${encodeURIComponent(state.examDocId)}/submit`;
    const submitBody = isTest
        ? { answers: submittedAnswers, autoSubmittedFullscreen: Boolean(options.autoSubmittedFullscreen), timeSpentSeconds }
        : { answers: submittedAnswers };

    const submitPromise = fetch(submitEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitBody)
    }).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "KhÃ´ng thá»ƒ ná»™p bÃ i.");
        return result;
    });

    const leaveFullscreen = ["exam", "test"].includes(examDoc?.category) && document.fullscreenElement
        ? document.exitFullscreen().catch((error) => {
            console.error("KhÃ´ng thá»ƒ thoÃ¡t toÃ n mÃ n hÃ¬nh:", error);
        })
        : Promise.resolve();

    Promise.all([Promise.resolve(leaveFullscreen), submitPromise]).then(async ([, result]) => {
        state.gradeResult = result;
        if (isTest) {
            activeTestDraft?.clear();
            activeTestDraft = null;
            await refreshTestsQueue();
            window.dispatchEvent(new Event("maihoc-auth-changed"));
        }
        go("result");
    }).catch(error => {
        state.examFinished = false;
        state.submitRetryRequired = true;
        state.examStarted = true;
        toast(`ChÆ°a ná»™p Ä‘Æ°á»£c bÃ i: ${error.message}. Báº£n nhÃ¡p váº«n Ä‘Æ°á»£c giá»¯; hÃ£y thá»­ ná»™p láº¡i.`, 'error');
        render();
    });
}
// PHÃT HIá»†N Há»ŒC SINH THOÃT TOÃ€N MÃ€N HÃŒNH
// ============================================
document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement)
        return;
    const examDoc = findDoc(state.examDocId);
    if (state.route !== "exam" ||
        !["exam", "test"].includes(examDoc?.category) ||
        !state.examStarted ||
        state.examFinished) {
        return;
    }
    // Äá»‘i vá»›i BÃ i kiá»ƒm tra: Tá»± Ä‘á»™ng ná»™p bÃ i ngay khi thoÃ¡t toÃ n mÃ n hÃ¬nh
    if (examDoc?.category === "test") {
        toast("Báº¡n Ä‘Ã£ thoÃ¡t cháº¿ Ä‘á»™ toÃ n mÃ n hÃ¬nh â€” Há»‡ thá»‘ng tá»± Ä‘á»™ng ná»™p bÃ i kiá»ƒm tra cá»§a báº¡n.", "error");
        finishExam({ autoSubmittedFullscreen: true });
        return;
    }
    // Äá»‘i vá»›i PhÃ²ng thi thá»­: káº¿t thÃºc lÆ°á»£t thi
    state.examStarted = false;
    state.examFinished = true;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    go("home");
    window.alert("Báº¡n Ä‘Ã£ thoÃ¡t bÃ i thi!\n\n" +
        "LÆ°á»£t thi Ä‘Ã£ káº¿t thÃºc vÃ¬ báº¡n thoÃ¡t cháº¿ Ä‘á»™ toÃ n mÃ n hÃ¬nh.");
});
// ============================================
// Báº®T Äáº¦U THI THá»¬ - Tá»° Äá»˜NG TOÃ€N MÃ€N HÃŒNH
// ============================================
function startExam(id) {
    const d = findDoc(id);
    if (!d)
        return;
    const isTimedExam = d.category === "exam";
    // YÃªu cáº§u toÃ n mÃ n hÃ¬nh ngay trong thao tÃ¡c nháº¥n nÃºt.
    // TrÃ¬nh duyá»‡t yÃªu cáº§u thao tÃ¡c nÃ y pháº£i xuáº¥t phÃ¡t tá»« ngÆ°á»i dÃ¹ng.
    let fullscreenPromise = null;
    if (isTimedExam && !document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            try {
                fullscreenPromise =
                    document.documentElement.requestFullscreen();
            }
            catch (error) {
                console.error("KhÃ´ng thá»ƒ báº­t toÃ n mÃ n hÃ¬nh:", error);
            }
        }
    }
    // Khá»Ÿi táº¡o lÆ°á»£t thi má»›i.
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
    // Chuyá»ƒn Ä‘áº¿n phÃ²ng thi.
    go("exam");
    // ThÃ´ng bÃ¡o náº¿u trÃ¬nh duyá»‡t tá»« chá»‘i toÃ n mÃ n hÃ¬nh.
    if (fullscreenPromise) {
        fullscreenPromise.catch((error) => {
            console.error("TrÃ¬nh duyá»‡t khÃ´ng cho phÃ©p toÃ n mÃ n hÃ¬nh:", error);
            toast("KhÃ´ng thá»ƒ báº­t toÃ n mÃ n hÃ¬nh. HÃ£y thá»­ nháº¥n VÃ o phÃ²ng thi láº¡i.", "error");
        });
    }
    else if (isTimedExam && !document.fullscreenElement) {
        toast("TrÃ¬nh duyá»‡t khÃ´ng há»— trá»£ cháº¿ Ä‘á»™ toÃ n mÃ n hÃ¬nh.", "error");
    }
}
async function startTest(id) {
    if (testStarting) return;
    if (!currentUser) {
        toast("Vui lÃ²ng Ä‘Äƒng nháº­p Ä‘á»ƒ lÃ m bÃ i kiá»ƒm tra.", "error");
        openDialog("login-dialog");
        return;
    }
    const d = findCachedTest(id) || findDoc(id);
    if (!d) {
        toast("KhÃ´ng tÃ¬m tháº¥y bÃ i kiá»ƒm tra.", "error");
        return;
    }
    let fullscreenPromise = null;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        try {
            fullscreenPromise = document.documentElement.requestFullscreen();
        } catch (error) {
            console.error("KhÃ´ng thá»ƒ báº­t toÃ n mÃ n hÃ¬nh:", error);
        }
    }
    testStarting = true;
    let draft;
    try {
        draft = await new TestDraft(currentUser.id, d.id).start();
        if (draft.session?.submission_id) { await openSavedTestSubmission(draft.session.submission_id); return; }
    } catch (error) { toast(error.message, 'error'); return; }
    finally { testStarting = false; }
    if (activeTestDraft) activeTestDraft.destroyed = true;
    activeTestDraft = draft;
    state.pendingTestId = null;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    state.examDocId = d.id;
    state.answers = { ...draft.answers };
    state.serverDeadline = draft.session?.deadline_at || null;
    const durationMin = Number(d.durationMinutes) || 0;
    state.remaining = state.serverDeadline ? Math.max(0, Math.floor((new Date(state.serverDeadline).getTime() - Date.now()) / 1000)) : durationMin > 0 ? durationMin * 60 : 0;
    state.elapsedSeconds = 0;
    state.timerCountUp = durationMin <= 0;
    state.examStartedAtMs = draft.session ? new Date(draft.session.started_at).getTime() : Date.now();
    activeExamQuestions = [];
    activeExamQuestionsFor = null;
    state.warningShown = false;
    state.examStarted = true;
    state.examFinished = false;
    state.submitRetryRequired = false;
    state.gradeResult = null;
    go("exam");
    if (fullscreenPromise) {
        fullscreenPromise.catch(() => {
            toast("HÃ£y giá»¯ cháº¿ Ä‘á»™ toÃ n mÃ n hÃ¬nh trong suá»‘t quÃ¡ trÃ¬nh lÃ m bÃ i kiá»ƒm tra.", "error");
        });
    }
}
async function openSavedTestSubmission(id) {
    try {
        const response = await fetch(`/api/test-submissions/${encodeURIComponent(id)}`, {
            credentials: "same-origin",
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "KhÃ´ng táº£i Ä‘Æ°á»£c káº¿t quáº£ bÃ i kiá»ƒm tra.");
        state.savedExamResult = data;
        go("saved-result");
    } catch (error) {
        toast(error.message || "KhÃ´ng táº£i Ä‘Æ°á»£c káº¿t quáº£ bÃ i kiá»ƒm tra.", "error");
    }
}
async function doEvaluate(id) { const d = findDoc(id); if (!d)
    return; $("#difficulty-result").innerHTML = '<span class="spinner"></span> Äang phÃ¢n tÃ­châ€¦'; openDialog("difficulty-dialog"); try {
    const result = await evaluateDifficulty(d.content || d.description, d.title);
    $("#difficulty-result").textContent = result.analysis || result.text || "AI chÆ°a tráº£ vá» káº¿t quáº£.";
}
catch (e) {
    $("#difficulty-result").textContent = `ChÆ°a thá»ƒ Ä‘Ã¡nh giÃ¡ báº±ng Gemini.\n\n${e.message}\n\nBáº¡n váº«n cÃ³ thá»ƒ lÃ m Ä‘á». HÃ£y cáº¥u hÃ¬nh GEMINI_API_KEY á»Ÿ backend Ä‘á»ƒ báº­t tÃ­nh nÄƒng nÃ y.`;
} }
function subjectClick(subject) {
    const config = getSubjectConfig(subject);
    if (!config || !config.enabled) {
        toast(`${subject}: mÃ´n há»c chÆ°a Ä‘Æ°á»£c kÃ­ch hoáº¡t.`);
        $("#subject-menu").classList.remove("open");
        return;
    }
    go("subject", { subject: config.name, grade: config.grades?.[0] || "10" });
    $("#subject-menu").classList.remove("open");
}
document.addEventListener("click", async (e) => {
    const deleteUserButton = e.target.closest("[data-delete-user]");
    if (deleteUserButton) {
        const id = deleteUserButton.dataset.deleteUser;
        if (!confirm("Gá»­i yÃªu cáº§u xÃ³a tÃ i khoáº£n nÃ y? Náº¿u báº¡n lÃ  GiÃ¡o viÃªn, tÃ i khoáº£n chá»‰ bá»‹ xÃ³a sau khi Admin cao nháº¥t cháº¥p thuáº­n.")) return;
        try {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "KhÃ´ng thá»ƒ xÃ³a ngÆ°á»i dÃ¹ng.");
            toast(payload.deleted ? "ÄÃ£ xÃ³a tÃ i khoáº£n." : "ÄÃ£ gá»­i yÃªu cáº§u. TÃ i khoáº£n chÆ°a bá»‹ xÃ³a.", "success");
            await loadAdminUsers();
        } catch (error) {
            toast(error.message || "KhÃ´ng thá»ƒ xÃ³a tÃ i khoáº£n.", "error");
        }
        return;
    }

    const routeBtn = e.target.closest("[data-route]");
    if (routeBtn) {
        e.preventDefault();
        const r = routeBtn.dataset.route;
        const chemTab = routeBtn.dataset.chemistryTab;
        if (r === "ai-solver") {
            $("#subject-menu")?.classList.remove("open");
            go("ai-solver");
            return;
        }
        if (r === "chemistry" && chemTab) {
            $("#subject-menu")?.classList.remove("open");
            go("chemistry", { chemistryTab: chemTab, subject: "HÃ³a há»c" });
            return;
        }
        $("#subject-menu")?.classList.remove("open");
        go(r, { newTimetable: routeBtn.hasAttribute("data-new-timetable") });
        return;
    }
    const action = e.target.closest("[data-action]");
    if (action) {
        const a = action.dataset.action;
        if (a === "admin-dashboard") {
            if (currentUser?.role === "admin")
                go("admin");
            else
                toast("Báº¡n cáº§n Ä‘Äƒng nháº­p báº±ng tÃ i khoáº£n Admin.", "error");
            return;
        }
        if (a === "browse-subjects") {
            $("#subject-menu").classList.remove("open");
            go("subject-picker");
            return;
        }
        if (a === "open-math" || a === "open-subject") {
            subjectClick(action.dataset.name || "ToÃ¡n");
            return;
        }
        if (a === "coming-subject") {
            toast(`${action.dataset.name}: mÃ´n há»c sáº½ sá»›m Ä‘Æ°á»£c kÃ­ch hoáº¡t. Coming soon!`);
            return;
        }
        if (a === "coming-natural-tool") {
            toast(action.dataset.tool === "physics-formulas"
                ? "CÃ´ng thá»©c Váº­t lÃ½ Ä‘ang Ä‘Æ°á»£c phÃ¡t triá»ƒn vÃ  sáº½ sá»›m ra máº¯t."
                : "CÃ´ng cá»¥ nÃ y Ä‘ang Ä‘Æ°á»£c phÃ¡t triá»ƒn.");
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
            // Má»Ÿ trang Ä‘á»c ngay láº­p tá»©c; khÃ´ng Ä‘á»ƒ API Ä‘á»“ng bá»™ lÃ m nÃºt bá»‹ treo.
            const documentToOpen = findDoc(id);
            if (!documentToOpen) {
                toast("KhÃ´ng tÃ¬m tháº¥y tÃ i liá»‡u trong danh sÃ¡ch hiá»‡n táº¡i. HÃ£y táº£i láº¡i trang vÃ  thá»­ láº¡i.", "error");
                return;
            }
            go("reader", { docId: documentToOpen.id });
            // Äá»“ng bá»™ ngáº§m sau khi Ä‘iá»u hÆ°á»›ng. Náº¿u cÃ³ dá»¯ liá»‡u má»›i, cáº­p nháº­t
            // trang Ä‘á»c khi ngÆ°á»i dÃ¹ng váº«n Ä‘ang á»Ÿ Ä‘Ãºng tÃ i liá»‡u Ä‘Ã³.
            refreshDocuments()
                .then(() => {
                    if (state.route === "reader" && String(state.docId) === String(id)) {
                        render();
                    }
                })
                .catch(error => console.error("KhÃ´ng thá»ƒ Ä‘á»“ng bá»™ tÃ i liá»‡u:", error));
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
 document.getElementById("education-home")?.addEventListener("click", () => {
    if (!matchMedia('(max-width:700px)').matches) return;
    window.dispatchEvent(new Event("maihoc-close-chat"));
    window.dispatchEvent(new Event("maihoc-close-online-drawer"));
    go("home");
});
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
    if (name) name.textContent = file?.name || "ChÆ°a chá»n tá»‡p";
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
   CHá»NG SPAM CLICK KHI UPLOAD TÃ€I LIá»†U
   ============================================ */
// KhÃ³a upload trong khi request Ä‘ang xá»­ lÃ½.
let uploadInProgress = false;
// LÆ°u cÃ¡c tá»‡p Ä‘Ã£ upload thÃ nh cÃ´ng trong phiÃªn trang hiá»‡n táº¡i.
const uploadedFileKeys = new Set();
$("#upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const fileInput = form.querySelector('input[type="file"]');
    const file = fileInput?.files?.[0];
    // Kiá»ƒm tra tá»‡p Ä‘Ã£ Ä‘Æ°á»£c chá»n.
    if (!file) {
        toast("Vui lÃ²ng chá»n tÃ i liá»‡u trÆ°á»›c khi táº£i lÃªn.", "error");
        return;
    }
    // Nháº­n diá»‡n tá»‡p dá»±a trÃªn tÃªn, kÃ­ch thÆ°á»›c vÃ  thá»i Ä‘iá»ƒm chá»‰nh sá»­a.
    const fileKey = JSON.stringify({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified
    });
    // Náº¿u Ä‘ang upload, khÃ´ng gá»­i thÃªm request.
    if (uploadInProgress) {
        toast("TÃ i liá»‡u Ä‘ang Ä‘Æ°á»£c táº£i lÃªn. Vui lÃ²ng chá».", "error");
        return;
    }
    // Náº¿u tá»‡p Ä‘Ã£ upload thÃ nh cÃ´ng, khÃ´ng upload láº¡i.
    if (uploadedFileKeys.has(fileKey)) {
        toast("TÃ i liá»‡u nÃ y Ä‘Ã£ Ä‘Æ°á»£c táº£i lÃªn rá»“i.", "error");
        return;
    }
    // KhÃ³a ngay trÆ°á»›c khi gá»i API.
    uploadInProgress = true;
    const originalText = submitButton?.textContent;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Äang táº£i lÃªn...";
    }
    try {
        const fd = new FormData(form);
        fd.delete("answerKey");
        const schoolStudentUpload = currentUser?.role !== "admin" && currentUser?.accountType === "school";
        const schoolClassSelect = form.elements.classCode;
        if (schoolStudentUpload && !String(schoolClassSelect?.value || "").trim()) {
            throw new Error("Há»c sinh cá»§a trÆ°á»ng cáº§n nháº­p rÃµ lá»›p trÆ°á»›c khi gá»­i tÃ i liá»‡u.");
        }
        if (form.elements.category?.value === "test") {
            let response;
            try {
                response = await fetch("/api/admin/tests", {
                    method: "POST",
                    credentials: "same-origin",
                    body: fd
                });
            } catch (netErr) {
                await new Promise((r) => setTimeout(r, 600));
                const retryFd = new FormData(form);
                retryFd.delete("answerKey");
                response = await fetch("/api/admin/tests", {
                    method: "POST",
                    credentials: "same-origin",
                    body: retryFd
                });
            }
            const testRes = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(testRes.error || `KhÃ´ng thá»ƒ táº¡o bÃ i kiá»ƒm tra (HTTP ${response.status}).`);
            uploadedFileKeys.add(fileKey);
            closeDialog("upload-dialog");
            form.reset();
            updateFileDropZone(fileInput);
            syncUploadDialogCategoryFields();
            await refreshTestsQueue();
            if (testRes.solutionJob) window.dispatchEvent(new CustomEvent("maihoc-exam-solution-job", { detail: testRes.solutionJob }));
            toast(testRes.message || "ÄÃ£ táº¡o bÃ i kiá»ƒm tra.", "success");
            render();
            return;
        }
        const result = await uploadDocument(fd);
        // Chá»‰ Ä‘Ã¡nh dáº¥u Ä‘Ã£ upload khi server xá»­ lÃ½ thÃ nh cÃ´ng.
        uploadedFileKeys.add(fileKey);
        closeDialog("upload-dialog");
        form.reset();
        updateFileDropZone(fileInput);
        syncUploadDialogCategoryFields();
        if(result.solutionJob)window.dispatchEvent(new CustomEvent("maihoc-exam-solution-job",{detail:result.solutionJob}));
        toast(result.localOnly
            ? "ÄÃ£ thÃªm tÃ i liá»‡u vÃ o phiÃªn trÃ¬nh duyá»‡t hiá»‡n táº¡i."
            : result.message
                ? result.message
            : result.solutionJob
                ? (result.solutionJob.mode === "manual" || result.solutionJob.preferredMode === "manual"
                    ? "Äá» Ä‘Ã£ táº£i lÃªn. HÃ£y nháº­p vÃ  xÃ¡c nháº­n bá»™ Ä‘Ã¡p Ã¡n chuáº©n."
                    : "Äá» Ä‘Ã£ táº£i lÃªn. Gemini Ä‘ang giáº£i; cá»­a sá»• tiáº¿n trÃ¬nh Ä‘Ã£ má»Ÿ.")
            : result.status === "pending"
                ? "ÄÃ£ gá»­i tÃ i liá»‡u. Admin sáº½ duyá»‡t vÃ  báº¡n sáº½ nháº­n thÃ´ng bÃ¡o."
                : "TÃ i liá»‡u Ä‘Ã£ Ä‘Æ°á»£c táº£i lÃªn mÃ¡y chá»§.", "success");
        render();
    }
    catch (err) {
        toast(err.message || "KhÃ´ng thá»ƒ táº£i tÃ i liá»‡u lÃªn.", "error");
    }
    finally {
        // Má»Ÿ khÃ³a sau khi request káº¿t thÃºc.
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
function notifyExamAnswerProgress() {
    if (activeTestDraft && String(activeTestDraft.testId) === String(state.examDocId)) activeTestDraft.update(state.answers);
    if (state.route !== "exam" || !state.examDocId) return;
    const d = findDoc(state.examDocId);
    if (!d) return;
    const layout = assessmentLayoutFor(d);
    const total = (layout?.sections || []).reduce((sum, s) => sum + Number(s.count || 0) * (s.type === "true_false" ? (s.statements || ["a","b","c","d"]).length : 1), 0) || Math.max(1, activeExamQuestions.length || 10);
    const answered = Object.values(state.answers).filter(v => String(v ?? "").trim() !== "").length;
    const percent = Math.min(99, Math.max(1, Math.round((answered / Math.max(1, total)) * 100)));
    window.dispatchEvent(new CustomEvent("maihoc-exam-progress", { detail: { id: d.id, title: d.title, subject: d.subject || "ToÃ¡n", grade: d.grade || "10", category: d.category || "exam", percent, answers: state.answers } }));
}
document.addEventListener("input", e => { if (e.target.matches("[data-answer]")) {
    state.answers[e.target.dataset.answer] = e.target.value;
    notifyExamAnswerProgress();
} });
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
        notifyExamAnswerProgress();
    } else if (multipleChoice) {
        notifyExamAnswerProgress();
    }
});
window.addEventListener("beforeunload", e => { if (state.route === "exam" && state.examStarted && findDoc(state.examDocId)?.category === "exam") {
    e.preventDefault();
    e.returnValue = "";
} });
// ============================================
// ÄIá»€U HÆ¯á»šNG NÃšT BACK Cá»¦A TRÃŒNH DUYá»†T
// Ãp dá»¥ng cho toÃ n bá»™ website MAI Há»ŒC
// ============================================
// -------------------- ACCOUNT UI + API --------------------
function ensureTestsNavButton() {
    $("#user-dashboard-open")?.remove();
    const userActions = $("#user-actions");
    if (!userActions) return;
    let testsBtn = $("#tests-open");
    if (!testsBtn) {
        testsBtn = document.createElement("button");
        testsBtn.className = "icon-button";
        testsBtn.id = "tests-open";
        testsBtn.dataset.route = "tests";
        testsBtn.title = "Danh sÃ¡ch BÃ i kiá»ƒm tra";
        testsBtn.setAttribute("aria-label", "BÃ i kiá»ƒm tra");
        testsBtn.innerHTML = `ðŸ“ <span class="button-label">BÃ i kiá»ƒm tra</span>`;
        const accountBtn = $("#account-center-open");
        if (accountBtn && accountBtn.parentElement === userActions) {
            userActions.insertBefore(testsBtn, accountBtn);
        } else {
            userActions.append(testsBtn);
        }
    }
}

function applyAuthUI() {
    const educationUser=document.getElementById('education-user'); if(educationUser)educationUser.textContent=currentUser?.name || '';
    ensureTestsNavButton();
    window.maihocCurrentUser = currentUser;
    window.__maihocCurrentUser = currentUser;
    const signedIn = Boolean(currentUser);
    const isSuperAdmin = Boolean(currentUser && currentUser.role === "admin" && Number(currentUser.adminLevel) >= 2);
    const isTeacherAccount = Boolean(
        currentUser && (
            currentUser.isTeacher ||
            currentUser.role === "teacher" ||
            (currentUser.role === "admin" && Number(currentUser.adminLevel) >= 1 && Number(currentUser.adminLevel) < 2)
        )
    );
    const isStudentAccount = Boolean(currentUser && !isSuperAdmin && !isTeacherAccount);

    $("#auth-actions").hidden = signedIn;
    $("#user-actions").hidden = !signedIn;
    $("#upload-open").hidden = !signedIn;
    $("#notifications-open").hidden = !signedIn;
    if ($("#tests-open")) $("#tests-open").hidden = !canAccessSchool(currentUser);
    if ($("#account-center-open")) $("#account-center-open").hidden = !signedIn || !isStudentAccount;
    if ($("#upload-category-test-opt")) $("#upload-category-test-opt").hidden = !(isSuperAdmin || isTeacherAccount);

    const adminButton = $("#admin-open");
    if (adminButton) {
        adminButton.hidden = !signedIn || !(isSuperAdmin || isTeacherAccount);
        adminButton.textContent = isTeacherAccount ? "Trung tÃ¢m giÃ¡o viÃªn" : "Quáº£n trá»‹";
    }
    if ($("#school-classes-open")) {
        const canOpenSchoolClasses = isSuperAdmin || isTeacherAccount || (isStudentAccount && (currentUser?.accountType === "school" || Boolean(currentUser?.classCode)));
        $("#school-classes-open").hidden = !signedIn || !canOpenSchoolClasses;
    }
    if ($("#upload-school-class-field")) {
        const schoolStudent = isStudentAccount && (currentUser?.accountType === "school" || Boolean(currentUser?.classCode));
        $("#upload-school-class-field").hidden = !schoolStudent;
        const uploadClassSelect = $("#upload-school-class-field").querySelector("select");
        if (uploadClassSelect) {
            uploadClassSelect.required = schoolStudent;
            if (schoolStudent && currentUser?.classCode && !uploadClassSelect.value) {
                uploadClassSelect.value = currentUser.classCode;
            }
        }
    }
    $("#user-greeting").hidden = !signedIn;
    const greetingRole = !currentUser
        ? ""
        : isSuperAdmin
            ? " Â· Quáº£n trá»‹ MAI Há»ŒC"
            : isTeacherAccount
                ? (currentUser.homeroomClass
                    ? ` Â· GiÃ¡o viÃªn chá»§ nhiá»‡m (${currentUser.homeroomClass})`
                    : " Â· GiÃ¡o viÃªn bá»™ mÃ´n")
                : currentUser.classCode
                    ? ` Â· Há»c sinh (${currentUser.classCode})`
                    : currentUser.accountType === "school"
                        ? " Â· Há»c sinh trong trÆ°á»ng"
                        : " Â· Há»c sinh";
    $("#user-greeting").textContent = currentUser ? `Xin chÃ o, ${currentUser.name}${greetingRole}` : "";
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
    authResolved = true;
    applyAuthUI();
    const educationUser=document.getElementById('education-user'); if(educationUser)educationUser.textContent=currentUser?.name || '';
    window.maihocCurrentUser = currentUser;
    await refreshTestsQueue();
    resumePendingTest();
    if (schoolRoutes.has(state.route) || ["home","analytics","study-rooms","account-center"].includes(state.route)) render();
}
async function postJson(url, body) {
    const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error || "MÃ¡y chá»§ khÃ´ng thá»ƒ xá»­ lÃ½ yÃªu cáº§u.");
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
        toast("ÄÄƒng nháº­p thÃ nh cÃ´ng.", "success");
        go(currentUser.role === "admin" ? (currentUser.isSuperAdmin ? "organization" : "assignment-management") : "home");
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
        error.textContent = "Máº­t kháº©u nháº­p láº¡i chÆ°a khá»›p.";
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
        toast("Táº¡o tÃ i khoáº£n thÃ nh cÃ´ng.", "success");
        go(currentUser.isTeacher ? "assignment-management" : "home");
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
            throw new Error(result.error || "KhÃ´ng thá»ƒ Ä‘Äƒng xuáº¥t.");
        }
        currentUser = null;
        applyAuthUI();
        window.dispatchEvent(new Event("maihoc-auth-changed"));
        if (state.route === "admin" || state.route === "study-rooms" || state.route === "account-center" || state.route === "tests")
            go("home");
        toast("Báº¡n Ä‘Ã£ Ä‘Äƒng xuáº¥t.", "success");
    }
    catch (error) {
        toast(error.message || "KhÃ´ng thá»ƒ Ä‘Äƒng xuáº¥t.", "error");
    }
});
// Khá»Ÿi táº¡o giao diá»‡n nhÆ° bÃ¬nh thÆ°á»ng.
initTheme();
render();
initRemoteData();
refreshAuthUI();

window.addEventListener("maihoc-documents-changed", () => {
    refreshDocuments().then(() => render());
});


async function loadAccountDeletionRequests(){
  const box=$("#account-deletion-requests");if(!box)return;
  try{
    const response=await fetch("/api/admin/account-deletion-requests",{credentials:"same-origin"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"KhÃ´ng táº£i Ä‘Æ°á»£c yÃªu cáº§u xÃ³a.");
    const requests=data.requests||[];
    const pending=requests.filter(r=>r.status==="pending");
    if(!pending.length){box.innerHTML='<p class="muted">KhÃ´ng cÃ³ yÃªu cáº§u chá» duyá»‡t.</p>';return;}
    box.innerHTML='<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>TÃ i khoáº£n cáº§n xÃ³a</th><th>Vai trÃ²</th><th>NgÆ°á»i yÃªu cáº§u</th><th>Thá»i gian</th><th>Quyáº¿t Ä‘á»‹nh</th></tr></thead><tbody>'+pending.map(r=>'<tr><td><strong>'+escapeHTML(r.targetName)+'</strong><br><span class="muted tiny">'+escapeHTML(r.targetEmail)+'</span></td><td>'+ (r.targetRole==="admin"?"GiÃ¡o viÃªn":"Há»c sinh")+'</td><td>'+escapeHTML(r.requestedByName)+'</td><td>'+escapeHTML(r.requestedAt||"â€”")+'</td><td><button class="button primary small" data-review-deletion="'+r.id+'" data-decision="approve">Cháº¥p thuáº­n xÃ³a</button> <button class="button secondary small" data-review-deletion="'+r.id+'" data-decision="reject">Tá»« chá»‘i</button></td></tr>').join("")+'</tbody></table></div>';
  }catch(error){box.innerHTML='<p class="auth-error">'+escapeHTML(error.message)+'</p>';}
}
document.addEventListener("click", e => {
  const toggle = e.target.closest("#teacher-create-toggle");
  if (!toggle) return;
  const panel = document.getElementById("teacher-create-panel");
  if (!panel) return;
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  panel.hidden = expanded;
  toggle.setAttribute("aria-expanded", String(!expanded));
  toggle.textContent = expanded ? "ï¼‹ Táº¡o giÃ¡o viÃªn" : "âˆ’ ÄÃ³ng biá»ƒu máº«u";
});
document.addEventListener("change", e => {
  if (e.target.id !== "teacher-kind") return;
  const field = document.getElementById("homeroom-class-field");
  const select = field?.querySelector("select");
  const isHomeroom = e.target.value === "homeroom";
  if (field) field.hidden = !isHomeroom;  
  const teachingClassesGroup = document.getElementById("teaching-classes-group");
  if (select) select.required = isHomeroom;
  if (teachingClassesGroup) teachingClassesGroup.hidden = isHomeroom;
});
document.addEventListener("submit",async e=>{
  if(e.target.id!=="create-subadmin-form")return;
  e.preventDefault();
  const form=e.target,button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
    const formData=new FormData(form);
    const body=Object.fromEntries(formData.entries());
    body.subjects=[...form.querySelectorAll('input[name="subjects"]:checked')].map(input=>input.value);
    body.teachingClasses=[...form.querySelectorAll('input[name="teachingClasses"]:checked')].map(input=>input.value);
    const response=await fetch("/api/admin/admins",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"KhÃ´ng táº¡o/cáº¥p quyá»n Ä‘Æ°á»£c GiÃ¡o viÃªn.");
    form.reset();
    const homeroomField = document.getElementById("homeroom-class-field");
    const homeroomSelect = homeroomField?.querySelector("select");
    const teachingClassesGroup = document.getElementById("teaching-classes-group");
    if (homeroomField) homeroomField.hidden = true;
    if (homeroomSelect) homeroomSelect.required = false;
    if (teachingClassesGroup) teachingClassesGroup.hidden = false;
    toast(data.message || (data.action==="promoted"?"ÄÃ£ cáº­p nháº­t phÃ¢n cÃ´ng GiÃ¡o viÃªn.":"ÄÃ£ táº¡o tÃ i khoáº£n GiÃ¡o viÃªn má»›i."),"success");
    await loadAdminUsers();
  }catch(error){toast(error.message||"KhÃ´ng táº¡o Ä‘Æ°á»£c GiÃ¡o viÃªn.","error");}
  finally{button.disabled=false;}
});
document.addEventListener("click",async e=>{
  const review=e.target.closest("[data-review-deletion]");
  if(!review)return;
  const decision=review.dataset.decision;
  if(decision==="approve"&&!confirm("Cháº¥p thuáº­n sáº½ xÃ³a vÄ©nh viá»…n tÃ i khoáº£n. Báº¡n cÃ³ cháº¯c cháº¯n?"))return;
  review.disabled=true;
  try{
    const response=await fetch("/api/admin/account-deletion-requests/"+encodeURIComponent(review.dataset.reviewDeletion)+"/review",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"KhÃ´ng xá»­ lÃ½ Ä‘Æ°á»£c yÃªu cáº§u.");
    toast(decision==="approve"?"ÄÃ£ cháº¥p thuáº­n vÃ  xÃ³a tÃ i khoáº£n.":"ÄÃ£ tá»« chá»‘i yÃªu cáº§u; tÃ i khoáº£n Ä‘Æ°á»£c giá»¯ nguyÃªn.","success");
    await loadAccountDeletionRequests();await loadAdminUsers();
  }catch(error){toast(error.message||"KhÃ´ng xá»­ lÃ½ Ä‘Æ°á»£c yÃªu cáº§u.","error");review.disabled=false;}
});
window.addEventListener("maihoc-user-updated", event => {
  currentUser = event.detail?.user || null;
  applyAuthUI();
  if (schoolRoutes.has(state.route) || ["account-center", "home"].includes(state.route)) render();
});
window.addEventListener("maihoc-navigate", event => {
  const { route, params } = event.detail || {};
  if (route) go(route, params || {});
});

function syncUploadDialogCategoryFields() {
    const extra = $("#upload-test-extra-fields");
    if (!extra || !uploadCategorySelect) return;
    const category = uploadCategorySelect.value;
    const isTest = category === "test";
    const hasAnswerMode = ["exam", "practice", "test"].includes(category);
    extra.hidden = !hasAnswerMode;
    extra.classList.toggle("is-test-category", isTest);
    extra.querySelectorAll("[data-test-only-fields]").forEach(node => {
        node.hidden = !isTest;
    });
    const openInput = extra.querySelector('[name="openAt"]');
    const closeInput = extra.querySelector('[name="closeAt"]');
    if (openInput) openInput.required = isTest;
    if (closeInput) closeInput.required = isTest;
    const answerModeSelect = extra.querySelector('select[name="answerMode"]');
    const immediateBox = extra.querySelector("[data-immediate-answer-options]");
    if (immediateBox && answerModeSelect) {
        immediateBox.hidden = answerModeSelect.value === "deferred";
    }
}
uploadCategorySelect?.addEventListener("change", syncUploadDialogCategoryFields);
syncUploadDialogCategoryFields();

wireSchoolEvents((route, params) => go(route, params));

wireTestsEvents({
    onNavigate: (route, params) => go(route, params),
    onStartTest: (testId) => startTest(testId),
    onOpenSavedTestSubmission: (subId) => openSavedTestSubmission(subId)
});

window.addEventListener("maihoc-tests-rerender", () => {
    if (state.route === "tests") render();
});
window.addEventListener("maihoc-auth-changed", async () => {
    await refreshTestsQueue();
    if (schoolRoutes.has(state.route) || state.route === "home") render();
});
window.addEventListener("maihoc-admin-panel-mounted", () => {
    loadAdminTestsAndPendingGrading();
});

document.getElementById('education-menu')?.addEventListener('click', () => { const opened=document.getElementById('education-sidebar').classList.toggle('is-open'); document.getElementById('education-menu').setAttribute('aria-expanded',String(opened)); });
document.addEventListener('click', event => {
    const sidebar = document.getElementById('education-sidebar');
    const menuButton = document.getElementById('education-menu');
    if (
        matchMedia('(max-width:700px)').matches &&
        sidebar?.classList.contains('is-open') &&
        !sidebar.contains(event.target) &&
        !menuButton?.contains(event.target)
    ) {
        sidebar.classList.remove('is-open');
        menuButton?.setAttribute('aria-expanded', 'false');
        syncEducationSidebar();
    }
});
document.addEventListener('keydown', event=>{if(event.key==='Escape'){document.getElementById('education-sidebar')?.classList.remove('is-open');document.getElementById('education-menu')?.setAttribute('aria-expanded','false');}});
document.addEventListener('click',event=>{if(event.target.closest('[data-portal-login]'))openDialog('login-dialog');const test=event.target.closest('[data-portal-test]');if(test)startTest(test.dataset.portalTest);});

function resumePendingTest() { if (state.pendingTestId && currentUser && findCachedTest(state.pendingTestId)) { const id=state.pendingTestId; state.pendingTestId=null; void startTest(id); } }
setInterval(() => { if (activeTestDraft && state.route==='exam' && state.examStarted) void activeTestDraft.save(); }, 10000);
window.addEventListener('online', () => { if(activeTestDraft)void activeTestDraft.save(); });

function syncEducationSidebar() { const sidebar=document.getElementById('education-sidebar'); if(sidebar)sidebar.inert=matchMedia('(max-width:700px)').matches&&!sidebar.classList.contains('is-open'); }
document.getElementById('education-menu')?.addEventListener('click',syncEducationSidebar);
window.addEventListener('resize',syncEducationSidebar);
window.addEventListener('maihoc-route-changed',syncEducationSidebar);
document.addEventListener('keydown',event=>{if(event.key==='Escape')syncEducationSidebar();});
syncEducationSidebar();

window.addEventListener("maihoc-timetable-home", () => go("home", { newTimetable: false }));
