import {SUBJECTS,CATEGORIES} from "./data.js";
import {initTheme} from "./theme.js";
import { $, $$, escapeHTML, toast, openDialog, closeDialog, pageHeading } from "./ui.js";
import {getDocuments,uploadDocument} from "./documents.js";
import {evaluateDifficulty} from "./ai.js";

const view=$("#view");
const state={route:"home",subject:"Toán",grade:"10",category:"theory",docId:null,examDocId:null,answers:{},timer:null,remaining:5400,warningShown:false,examStarted:false,examFinished:false};
const gradeLabel=g=>`Lớp ${g}`;
const docs=()=>getDocuments();
const findDoc=id=>docs().find(d=>d.id===id);
const by=(grade,category)=>docs().filter(d=>d.subject==="Toán"&&d.grade===String(grade)&&d.category===category);
const categoryName=k=>CATEGORIES[k]?.label||k;
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
    stopTimerIfLeaving(route);

    Object.assign(state, params);
    state.route = route;

    // Ghi trang mới vào lịch sử điều hướng của Chrome.
    history.pushState(
        saveRouteHistory(),
        "",
        window.location.href
    );

    render();
}
// Khởi tạo lịch sử cho trang MAI HỌC hiện tại.
history.replaceState(
    saveRouteHistory(),
    "",
    window.location.href
);

// Khôi phục trang khi nhấn Back hoặc Forward.
window.addEventListener("popstate", function (event) {
    const saved = event.state;

    // Nếu trạng thái trước đó thuộc MAI HỌC,
    // khôi phục trang đó và không chuyển sang Google.
    if (saved?.maihoc && saved.appState) {
        const previousRoute = saved.appState.route;

        stopTimerIfLeaving(previousRoute);

        Object.assign(state, saved.appState);
        state.timer = null;

        render();
        return;
    }

    // Không tự chuyển hướng khi gặp trạng thái không xác định.
    // Để Chrome xử lý lịch sử điều hướng bình thường.
});
function stopTimerIfLeaving(route){if(state.route==="exam"&&route!=="exam"&&state.timer){clearInterval(state.timer);state.timer=null;}}
function breadcrumb(title){return `<div class="breadcrumb"><button data-route="home">Trang chủ</button><span>/</span><button data-route="subject">Toán</button><span>/</span><span>${escapeHTML(title)}</span></div>`;}
function homePage(){return `<section class="hero"><div class="hero-copy"><p class="eyebrow">KHÔNG GIAN HỌC TẬP CỦA BẠN</p><h1>Học chắc nền tảng.<br>Vững vàng bứt phá.</h1><p>Ôn tập lý thuyết, luyện bài tập và thử sức với phòng thi mô phỏng — bắt đầu với môn Toán.</p><div class="hero-actions"><button class="button secondary" data-route="subject">Khám phá môn Toán →</button><button class="button secondary" data-action="browse-subjects">Chọn môn học</button></div></div><div class="hero-art"><div class="book-illustration"><strong>MAI<br>HỌC</strong><div class="book-line"></div><div class="book-line" style="width:75%"></div><div class="book-line" style="width:55%"></div><p style="font-size:11px">LEARN · PRACTICE · GROW</p></div></div></section>
<section class="section-head"><div><h2>Bắt đầu hành trình</h2><p>Chọn cách học phù hợp với bạn.</p></div><span class="pill">MÔN TOÁN ĐANG HOẠT ĐỘNG</span></section>
<div class="grid three">
 <article class="card clickable resource-card" data-route="theory"><div class="card-icon">▤</div><span class="pill">NẮM VỮNG KIẾN THỨC</span><h3>Ôn tập lý thuyết</h3><p>Hệ thống kiến thức theo lớp, đọc tài liệu trực tiếp trên trang.</p></article>
 <article class="card clickable resource-card" data-route="practice"><div class="card-icon">✎</div><span class="pill">LUYỆN TẬP</span><h3>Ôn tập theo đề</h3><p>Thực hành câu hỏi, tự kiểm tra và xem đáp án khi có dữ liệu.</p></article>
 <article class="card clickable resource-card" data-route="exam-select"><div class="card-icon">◷</div><span class="pill">90 PHÚT</span><h3>Phòng thi thử</h3><p>Làm bài với đồng hồ đếm ngược và xác nhận trước khi nộp.</p></article>
</div>
<section class="section-head"><div><h2>Chọn lớp để học</h2><p>Nội dung được tổ chức theo chương trình THPT.</p></div></section>
<div class="grid three">${["10","11","12"].map(g=>`<article class="card clickable class-card" data-action="choose-grade" data-grade="${g}"><div><span class="pill">TOÁN HỌC</span><div class="grade">${gradeLabel(g)}</div><p>Ôn tập · Bài tập · Đề thi thử</p></div><span class="arrow">↗</span></article>`).join("")}</div>
<p class="footer-note">MAI HỌC · Học tập theo nhịp độ của riêng bạn.</p>`;}
function subjectPickerPage(){const subjects=[
 {name:"Toán",icon:"∑",active:true,items:["Ôn tập lý thuyết","Làm đề ôn tập","Phòng thi thử (có tính giờ)"]},
 {name:"Vật lý",icon:"⚛",items:["Ôn tập lý thuyết","Làm đề ôn tập","Phòng thi thử (có tính giờ)"]},
 {name:"Hóa học",icon:"⚗",items:["Ôn tập lý thuyết","Làm đề ôn tập","Phòng thi thử (có tính giờ)"]},
 {name:"Sinh học",icon:"❧",items:["Ôn tập lý thuyết","Làm đề ôn tập","Phòng thi thử (có tính giờ)"]},
 {name:"Tiếng Anh",icon:"A",items:["Ôn tập lý thuyết","Làm đề ôn tập","Phòng thi thử (có tính giờ)"]},
 {name:"Ngữ văn",icon:"文",items:["Ôn tập lý thuyết","Làm đề ôn tập","Phòng thi thử (có tính giờ)"]},
 {name:"IELTS",icon:"✦",items:["Ôn tập theo kỹ năng","Thư viện tài liệu","Phòng thi thử (có tính giờ)"]},
 {name:"Đề thi THPT quốc gia",icon:"▤",items:["Đề thi các năm trước","Đề thi thử trường / sở","Phòng thi thử có tính giờ"]}
 ];return `<section class="subject-picker"><div class="subject-picker-bar"><span>KHÁM PHÁ CÁC MÔN HỌC</span><button class="button secondary small" data-route="home">← Trang chủ</button></div><div class="subject-picker-intro"><div><p class="eyebrow">MAI HỌC · LEARN · PRACTICE · GROW</p><h1>Chọn môn học</h1><p>Chọn môn để khám phá tài liệu, luyện tập và phòng thi thử.</p></div><span class="pill">TOÁN ĐANG HOẠT ĐỘNG</span></div><div class="subject-picker-grid">${subjects.map(x=>`<article class="subject-tile ${x.active?"is-active":"is-coming"}" ${x.active?'data-action="open-math" role="button" tabindex="0"':'data-action="coming-subject" data-name="'+x.name+'" role="button" tabindex="0"'}><div class="subject-tile-head"><span class="subject-tile-icon">${x.icon}</span><div><h2>${escapeHTML(x.name)}</h2><span class="subject-status">${x.active?"ĐANG HOẠT ĐỘNG":"SẮP RA MẮT"}</span></div></div><ul>${x.items.map(item=>`<li>${escapeHTML(item)}</li>`).join("")}</ul><div class="subject-tile-footer">${x.active?"Khám phá môn học":"Đang phát triển"} <span>→</span></div></article>`).join("")}</div></section>`;}
function subjectPage(){return `${pageHeading("Môn Toán","Chọn một khu vực học tập để tiếp tục.")}<div class="grid three">
${[{r:"theory",i:"▤",t:"Ôn tập lý thuyết",d:"Đọc tài liệu và hệ thống kiến thức theo từng lớp."},{r:"practice",i:"✎",t:"Đề thi ôn tập",d:"Luyện tập theo bộ đề và chủ đề."},{r:"exam-select",i:"◷",t:"Phòng thi thử",d:"Thi mô phỏng có giới hạn thời gian 90 phút."}].map(x=>`<article class="card clickable resource-card" data-route="${x.r}"><div class="card-icon">${x.i}</div><h3>${x.t}</h3><p>${x.d}</p><p style="margin-top:18px;color:var(--primary);font-weight:600">Mở mục →</p></article>`).join("")}</div><section class="section-head"><div><h2>Thư viện tài liệu</h2><p>${docs().filter(d=>d.subject==="Toán").length} tài liệu mẫu và tài liệu đã tải lên trong phiên này.</p></div></section><div class="grid three">${["10","11","12"].map(g=>`<article class="card clickable class-card" data-action="choose-grade" data-grade="${g}"><div><div class="grade">${gradeLabel(g)}</div><p>${docs().filter(d=>d.subject==="Toán"&&d.grade===g).length} tài liệu</p></div><span class="arrow">↗</span></article>`).join("")}</div>`;}
function gradePicker(route,category){return `${pageHeading(category?categoryName(category):"Chọn lớp","Chọn khối lớp để xem tài liệu môn Toán.")}<div class="grid three">${["10","11","12"].map(g=>`<article class="card clickable class-card" data-action="select-grade-route" data-grade="${g}" data-next="${route}" data-category="${category||""}"><div><span class="pill">MÔN TOÁN</span><div class="grade">${gradeLabel(g)}</div><p>${category?by(g,category).length+" tài liệu":"Chọn nội dung học"}</p></div><span class="arrow">→</span></article>`).join("")}</div>`;}
function resourceListPage(category,grade){const list=by(grade,category);return `${pageHeading(`${categoryName(category)} — ${gradeLabel(grade)}`,`Tài liệu môn Toán ${gradeLabel(grade).toLowerCase()}.`)}<div class="stat-row"><div class="stat"><span class="muted">Tài liệu</span><strong>${list.length}</strong></div><div class="stat"><span class="muted">Môn học</span><strong>Toán</strong></div><div class="stat"><span class="muted">Khối lớp</span><strong>${grade}</strong></div></div>${list.length?`<div class="resource-list">${list.map(d=>`<div class="resource-row"><div class="card-icon">${CATEGORIES[d.category]?.icon||"▧"}</div><div class="resource-main"><h3>${escapeHTML(d.title)}</h3><p>${escapeHTML(d.description||"Tài liệu môn Toán")} · ${d.sample?"Tài liệu mẫu":d.localOnly?"Lưu trong trình duyệt":"Đã tải lên"}</p></div><div class="resource-actions"><button class="button secondary small" data-action="read-doc" data-id="${d.id}">Mở tài liệu</button>${category==="exam"?`<button class="button primary small" data-action="start-exam" data-id="${d.id}">Bắt đầu thi</button>`:""}</div></div>`).join("")}</div>`:`<div class="empty-state"><h3>Chưa có tài liệu cho mục này</h3><p>Hãy upload tài liệu bằng nút ở thanh trên hoặc chọn lớp khác.</p><button class="button primary" data-action="open-upload">Upload tài liệu</button></div>`}<p class="footer-note">Tài liệu mẫu chỉ dùng để minh họa luồng hoạt động của website.</p>`;}
function readerPage(){const d=findDoc(state.docId);if(!d)return subjectPage();const related=docs().filter(x=>x.subject===d.subject&&x.grade===d.grade&&x.id!==d.id);let content="";if(d.content)content=`<pre>${escapeHTML(d.content)}</pre>`;else if(d.filename||d.description){content=`<div class="empty-state"><h3>${escapeHTML(d.title)}</h3><p>Tệp này đã được tải lên nhưng bản demo chưa có trình đọc định dạng này. Khi chạy backend, hãy mở tệp trong danh sách tài liệu đã lưu.</p>${d.filename?`<p>${escapeHTML(d.filename)}</p>`:""}</div>`;}return `${pageHeading(d.title,`${d.subject} · ${gradeLabel(d.grade)} · ${categoryName(d.category)}`)}<div class="reader-layout"><section class="reader-main">${content}<div class="modal-actions"><button class="button secondary" data-route="${d.category==="theory"?"theory":d.category==="exam"?"exam-select":"practice"}">← Quay lại danh sách</button>${d.category==="exam"?`<button class="button primary" data-action="start-exam" data-id="${d.id}">Bắt đầu thi thử</button>`:""}</div></section><aside class="reader-side"><h3>Tài liệu cùng lớp</h3>${related.length?related.map(x=>`<button class="button ghost small" data-action="read-doc" data-id="${x.id}">${escapeHTML(x.title)}</button>`).join(""):`<p class="muted">Chưa có tài liệu liên quan.</p>`}<hr style="border:0;border-top:1px solid var(--border);margin:20px 0"><p class="muted tiny">Mẹo: dùng nút Upload tài liệu để bổ sung nội dung cho thư viện.</p></aside></div>`;}
function examSelectPage(){return `${pageHeading("Phòng thi thử","Chọn khối lớp và đề thi. Mỗi lượt thi có thời gian tối đa 90 phút.")}<div class="grid three">${["10","11","12"].map(g=>`<article class="card clickable class-card" data-action="select-grade-route" data-grade="${g}" data-next="exam-list" data-category="exam"><div><span class="pill">THI THỬ · 90 PHÚT</span><div class="grade">${gradeLabel(g)}</div><p>${by(g,"exam").length} đề thi có sẵn</p></div><span class="arrow">→</span></article>`).join("")}</div>`;}
function examListPage(grade){const list=by(grade,"exam");return `${pageHeading(`Chọn đề thi — ${gradeLabel(grade)}`,"Mỗi đề có thời gian 90 phút. Độ khó được AI đánh giá khi backend Gemini đã được cấu hình.")}${list.length?`<div class="exam-list">${list.map((d,i)=>`<article class="exam-card"><span class="pill">ĐỀ ${String(i+1).padStart(2,"0")}</span><h3>${escapeHTML(d.title)}</h3><div class="exam-meta"><span>◷ Thời gian: 90 phút</span><span>✦ Độ khó: AI đánh giá</span><span>▤ ${gradeLabel(d.grade)}</span></div><button class="button secondary" data-action="evaluate" data-id="${d.id}">Đánh giá độ khó bằng AI</button><button class="button primary" data-action="start-exam" data-id="${d.id}">Vào phòng thi →</button></article>`).join("")}</div>`:`<div class="empty-state"><h3>Chưa có đề thi cho lớp ${grade}</h3><p>Upload đề thi thử để bắt đầu.</p><button class="button primary" data-action="open-upload">Upload đề thi</button></div>`}<p class="footer-note">Đề thi mẫu là dữ liệu minh họa; nội dung và thang điểm cần được quản trị viên bổ sung.</p>`;}
function questionsFor(doc){const content=doc?.content||"";const found=[...content.matchAll(/Câu\s*(\d+)\.\s*([^\n]+)/gi)].map(m=>({n:m[1],text:m[2]}));return found.length?found:[{n:"1",text:"Nhập câu hỏi tại đây (quản trị viên có thể cập nhật nội dung đề)."},{n:"2",text:"Trình bày lời giải của bạn."},{n:"3",text:"Hoàn thành bài toán sau."}];}
function examPage(){const d=findDoc(state.examDocId);if(!d)return examSelectPage();const qs=questionsFor(d);return `${breadcrumb("Phòng thi thử")}<div class="exam-toolbar"><div><strong>${escapeHTML(d.title)}</strong><div class="exam-instructions">${gradeLabel(d.grade)} · Làm bài trong tối đa 90 phút</div></div><div id="timer" class="timer">90:00</div><button class="button primary" data-action="submit-exam">Nộp bài</button></div><div class="split-exam" id="split-exam"><section class="exam-pane paper" id="paper-pane"><span class="pill">ĐỀ THI</span><h2>${escapeHTML(d.title)}</h2><p class="muted">Đọc kỹ từng câu hỏi và nhập câu trả lời ở khung bên phải.</p>${qs.map(q=>`<div class="question"><h3>Câu ${q.n}. ${escapeHTML(q.text)}</h3><p class="exam-instructions">Hãy trình bày lời giải rõ ràng.</p></div>`).join("")}</section><div class="splitter" id="splitter" role="separator" aria-label="Kéo để thay đổi kích thước hai khung"></div><section class="exam-pane answers" id="answer-pane"><span class="pill">PHẦN ĐIỀN ĐÁP ÁN</span><h2>Bài làm của bạn</h2><form id="answer-form">${qs.map(q=>`<div class="question"><h3>Câu ${q.n}</h3><textarea data-answer="${q.n}" placeholder="Nhập đáp án hoặc lời giải…" aria-label="Đáp án câu ${q.n}">${escapeHTML(state.answers[q.n]||"")}</textarea></div>`).join("")}</form></section></div>`;}
function resultPage(){const d=findDoc(state.examDocId);const count=Object.values(state.answers).filter(v=>String(v).trim()).length;return `${pageHeading("Kết quả lượt thi","Bạn đã hoàn tất lượt thi thử.")}<div class="result-panel"><span class="pill">ĐÃ NỘP BÀI</span><div class="result-score">${count}/${Object.keys(state.answers).length}</div><h2>Câu đã trả lời</h2><p class="muted">Đây là số câu có nội dung trả lời, chưa phải điểm số được chấm tự động. Để chấm điểm chính xác, quản trị viên cần bổ sung đáp án chuẩn và quy tắc chấm.</p><div class="modal-actions"><button class="button secondary" data-route="exam-select">Chọn đề khác</button><button class="button primary" data-route="subject">Về môn Toán</button></div></div>`;}
function render(){
  if(state.route==="home")view.innerHTML=homePage();
  else if(state.route==="subject")view.innerHTML=subjectPage();
  else if(state.route==="subject-picker")view.innerHTML=subjectPickerPage();
  else if(state.route==="theory")view.innerHTML=gradePicker("theory","theory");
  else if(state.route==="practice")view.innerHTML=gradePicker("practice","practice");
  else if(state.route==="theory-list")view.innerHTML=resourceListPage("theory",state.grade);
  else if(state.route==="practice-list")view.innerHTML=resourceListPage("practice",state.grade);
  else if(state.route==="exercise-list")view.innerHTML=resourceListPage("exercise",state.grade);
  else if(state.route==="exam-select")view.innerHTML=examSelectPage();
  else if(state.route==="exam-list")view.innerHTML=examListPage(state.grade);
  else if(state.route==="reader")view.innerHTML=readerPage();
  else if(state.route==="exam")view.innerHTML=examPage();
  else if(state.route==="result")view.innerHTML=resultPage();
  view.focus({preventScroll:true});
  if(state.route==="exam"){wireSplitter();if(state.examStarted&&!state.examFinished)startTimer();}
}
function startTimer(){
  if(state.timer)return;
  updateTimer();
  state.timer=setInterval(()=>{state.remaining--;updateTimer();if(state.remaining===300&&!state.warningShown){state.warningShown=true;toast("Bạn còn 5 phút! Hãy kiểm tra bài và chuẩn bị nộp.","error");}if(state.remaining<=0){clearInterval(state.timer);state.timer=null;toast("Đã hết giờ. Bài thi sẽ được nộp tự động.","error");finishExam();}},1000);
}
function updateTimer(){const el=$("#timer");if(!el)return;const m=Math.floor(state.remaining/60),s=state.remaining%60;el.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;el.classList.toggle("warning",state.remaining<=300);}
function wireSplitter(){const split=$("#splitter"),exam=$("#split-exam"),left=$("#paper-pane");if(!split||split.dataset.ready)return;split.dataset.ready="1";let drag=false;split.addEventListener("pointerdown",e=>{drag=true;split.setPointerCapture(e.pointerId);});split.addEventListener("pointermove",e=>{if(!drag)return;const rect=exam.getBoundingClientRect();if(innerWidth<=620){const ratio=(e.clientY-rect.top)/rect.height;left.style.flex=`0 0 ${Math.max(25,Math.min(75,ratio*100))}%`;}else{const ratio=(e.clientX-rect.left)/rect.width;left.style.flex=`0 0 ${Math.max(25,Math.min(75,ratio*100))}%`;}});split.addEventListener("pointerup",()=>drag=false);}
function finishExam() {
    // Ngăn kết thúc bài thi nhiều lần.
    if (state.examFinished) return;

    // Đánh dấu bài thi đã kết thúc trước khi thoát fullscreen.
    state.examFinished = true;
    state.examStarted = false;

    // Dừng đồng hồ đếm ngược.
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }

    // Chấm điểm và lưu kết quả nếu dự án có hàm chấm điểm riêng.
    // Giữ nguyên logic chấm điểm hiện có của dự án.

    // Thoát toàn màn hình rồi chuyển sang trang kết quả.
    const leaveFullscreen = document.fullscreenElement
        ? document.exitFullscreen().catch((error) => {
            console.error("Không thể thoát toàn màn hình:", error);
        })
        : Promise.resolve();

    Promise.resolve(leaveFullscreen).finally(() => {
        go("result");
    });
}
// PHÁT HIỆN HỌC SINH THOÁT TOÀN MÀN HÌNH
// ============================================
document.addEventListener("fullscreenchange", () => {
    // Vẫn đang ở chế độ toàn màn hình.
    if (document.fullscreenElement) return;

    // Nếu bài thi đã kết thúc bình thường hoặc hết giờ,
    // không xử lý như hành vi thoát bài thi.
    if (
        state.route !== "exam" ||
        !state.examStarted ||
        state.examFinished
    ) {
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

    window.alert(
        "Bạn đã thoát bài thi!\n\n" +
        "Lượt thi đã kết thúc vì bạn thoát chế độ toàn màn hình."
    );
});

// ============================================
// BẮT ĐẦU THI THỬ - TỰ ĐỘNG TOÀN MÀN HÌNH
// ============================================

function startExam(id) {
    const d = findDoc(id);
    if (!d) return;

    // Yêu cầu toàn màn hình ngay trong thao tác nhấn nút.
    // Trình duyệt yêu cầu thao tác này phải xuất phát từ người dùng.
    let fullscreenPromise = null;

    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            try {
                fullscreenPromise =
                    document.documentElement.requestFullscreen();
            } catch (error) {
                console.error(
                    "Không thể bật toàn màn hình:",
                    error
                );
            }
        }
    }

    // Khởi tạo lượt thi mới.
    state.examDocId = id;
    state.answers = {};
    state.remaining = 10;
    state.warningShown = false;
    state.examStarted = true;
    state.examFinished = false;

    // Chuyển đến phòng thi.
    go("exam");

    // Thông báo nếu trình duyệt từ chối toàn màn hình.
    if (fullscreenPromise) {
        fullscreenPromise.catch((error) => {
            console.error(
                "Trình duyệt không cho phép toàn màn hình:",
                error
            );

            toast(
                "Không thể bật toàn màn hình. Hãy thử nhấn Vào phòng thi lại.",
                "error"
            );
        });
    } else if (!document.fullscreenElement) {
        toast(
            "Trình duyệt không hỗ trợ chế độ toàn màn hình.",
            "error"
        );
    }
}
async function doEvaluate(id){const d=findDoc(id);if(!d)return;$("#difficulty-result").innerHTML='<span class="spinner"></span> Đang phân tích…';openDialog("difficulty-dialog");try{const result=await evaluateDifficulty(d.content||d.description,d.title);$("#difficulty-result").textContent=result.analysis||result.text||"AI chưa trả về kết quả.";}catch(e){$("#difficulty-result").textContent=`Chưa thể đánh giá bằng Gemini.\n\n${e.message}\n\nBạn vẫn có thể làm đề. Hãy cấu hình GEMINI_API_KEY ở backend để bật tính năng này.`;}}
function subjectClick(subject){if(subject==="Toán"){go("subject");$("#subject-menu").classList.remove("open");}else{toast(`${subject}: sẽ được cập nhật trong thời gian tới — Coming soon!`);$("#subject-menu").classList.remove("open");}}
document.addEventListener("click",async e=>{
 const routeBtn=e.target.closest("[data-route]");if(routeBtn){e.preventDefault();const r=routeBtn.dataset.route;go(r);return;}
 const action=e.target.closest("[data-action]");if(action){const a=action.dataset.action;
  if(a==="browse-subjects"){ $("#subject-menu").classList.remove("open");go("subject-picker");return;}
  if(a==="open-math"){go("subject");return;}
  if(a==="coming-subject"){toast(`${action.dataset.name}: sẽ được cập nhật trong thời gian tới — Coming soon!`);return;}
  if(a==="choose-grade"){state.grade=action.dataset.grade;go("theory-list",{grade:action.dataset.grade});return;}
  if(a==="select-grade-route"){const g=action.dataset.grade,next=action.dataset.next,cat=action.dataset.category;state.grade=g;if(next==="exam-list")go("exam-list",{grade:g});else if(cat==="theory")go("theory-list",{grade:g});else if(cat==="practice")go("practice-list",{grade:g});else go("exercise-list",{grade:g});return;}
  if(a==="open-upload"){openDialog("upload-dialog");return;}
  if(a==="read-doc"){go("reader",{docId:action.dataset.id});return;}
  if(a==="start-exam"){startExam(action.dataset.id);return;}
  if(a==="evaluate"){doEvaluate(action.dataset.id);return;}
  if(a==="submit-exam"){openDialog("confirm-dialog");return;}
 }
 const subject=e.target.closest("[data-subject]");if(subject){subjectClick(subject.dataset.subject);return;}
 const close=e.target.closest("[data-close]");if(close){closeDialog(close.dataset.close);return;}
});
$("#brand-home").addEventListener("click",()=>go("home"));
$("#menu-toggle").addEventListener("click",()=>$("#subject-menu").classList.toggle("open"));
document.addEventListener("click",e=>{if(!e.target.closest("#subject-menu")&&!e.target.closest("#menu-toggle")&&!e.target.closest('[data-action="browse-subjects"]'))$("#subject-menu").classList.remove("open");});
$("#upload-open").addEventListener("click",()=>openDialog("upload-dialog"));
$("#upload-form").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);try{const result=await uploadDocument(fd);closeDialog("upload-dialog");form.reset();toast(result.localOnly?"Đã thêm tài liệu vào phiên trình duyệt hiện tại.":"Tài liệu đã được tải lên máy chủ.","success");render();}catch(err){toast(err.message||"Không thể tải tài liệu lên.","error");}});
$("#confirm-yes").addEventListener("click",()=>{closeDialog("confirm-dialog");finishExam();});
document.addEventListener("input",e=>{if(e.target.matches("[data-answer]"))state.answers[e.target.dataset.answer]=e.target.value;});
window.addEventListener("beforeunload",e=>{if(state.route==="exam"&&state.examStarted){e.preventDefault();e.returnValue="";}});

// ============================================
// ĐIỀU HƯỚNG NÚT BACK CỦA TRÌNH DUYỆT
// Áp dụng cho toàn bộ website MAI HỌC
// ============================================


// Khởi tạo giao diện như bình thường.
initTheme();
render();
