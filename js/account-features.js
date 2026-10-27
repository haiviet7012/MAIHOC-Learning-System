const $ = (s, root=document) => root.querySelector(s);
const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let activeUser = null;
let activeReader = null;
let activeReaderRoot = null;
let activeReaderCleanup = null;
let readerMaxProgress = 0;
let readerSaveTimer = null;
let solutionPollTimer = null;
let activeSolutionId = null;
async function request(url, options={}) {
  const response = await fetch(url, {credentials:"same-origin", ...options});
  const contentType=response.headers.get("content-type")||"";
  const data=contentType.includes("json")?await response.json().catch(()=>({})):{};
  if (!response.ok) {
    const fallback=contentType.includes("json")
      ? `Yêu cầu thất bại (HTTP ${response.status}).`
      : `Máy chủ trả về HTTP ${response.status} thay vì JSON. Hãy khởi động lại server để nạp API lời giải AI.`;
    throw new Error(data.error||fallback);
  }
  if(!contentType.includes("json"))throw new Error(`API trả về dữ liệu không hợp lệ (HTTP ${response.status}); hãy kiểm tra server.`);
  return data;
}
function toastNotice(message, type="success") {
  const region=$("#toast-region"); if(!region)return;
  const el=document.createElement("div");el.className="toast "+type;el.textContent=message;region.append(el);setTimeout(()=>el.remove(),3800);
}
async function loadUser() {
  try { const data=await request("/api/auth/me"); activeUser=data.user||null; } catch { activeUser=null; }
  const bell=$("#notifications-open"), upload=$("#upload-open");
  if(bell)bell.hidden=!activeUser;
  if(upload)upload.hidden=!activeUser;
  if(activeUser){refreshNotifications();const reader=$("#reader-layout");if(reader&&activeReaderRoot!==reader)startReaderTracking(reader);}
}
async function refreshNotifications() {
  if(!activeUser)return;
  try {
    const data=await request("/api/notifications");
    const badge=$("#notification-count");
    if(badge){badge.hidden=!(data.unread>0);badge.textContent=data.unread>99?"99+":String(data.unread);}
    const list=$("#notifications-list");
    if(list)list.innerHTML=(data.items||[]).length?data.items.map(n=>{
      const date=new Date(String(n.createdAt).replace(" ","T")+"Z").toLocaleString("vi-VN");
      return '<article class="notification-item '+(n.readAt?"is-read":"is-unread")+'"><div class="notification-item-head"><strong>'+esc(n.title)+'</strong><span>'+esc(date)+'</span></div><p>'+esc(n.message)+'</p>'+(n.readAt?'':'<button class="text-button" data-notification-read="'+n.id+'">Đánh dấu đã đọc</button>')+'</article>';
    }).join(""):'<p class="muted">Bạn chưa có thông báo nào.</p>';
  } catch(e) { console.warn("Notifications:",e.message); }
}
async function saveProgress(payload) {
  if(!activeUser)return null;
  try { const result=await request("/api/progress",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(result.notificationCreated)refreshNotifications();return result; }
  catch(e){console.warn("Không lưu được tiến trình:",e.message);}
}
function readerPayload(status="in_progress"){
  if(!activeReader)return null;
  return {itemType:"document",itemId:activeReader.id,itemTitle:activeReader.title,subject:activeReader.subject,grade:activeReader.grade,status,progressPercent:readerMaxProgress,lastPosition:String(readerMaxProgress)};
}
function updateReaderProgressUI(percent){
  const root=$("#reader-layout");if(!root)return;
  const value=root.querySelector("[data-reading-percent]"),bar=root.querySelector("[data-reading-bar]");
  if(value)value.textContent=`${percent}%`;
  if(bar)bar.style.width=`${percent}%`;
}
function scrollProgress(element){
  const distance=element.scrollHeight-element.clientHeight;
  if(distance<=2)return 0;
  if(element.scrollTop>=distance-2)return 100;
  return Math.floor(Math.max(0,element.scrollTop)/distance*100);
}
function measureReaderProgress(root){
  const text=root.querySelector(".document-text");
  if(text&&text.scrollHeight>text.clientHeight+2)return scrollProgress(text);
  const pdfScroller=root.querySelector(".pdf-document-scroll");
  if(pdfScroller&&pdfScroller.scrollHeight>pdfScroller.clientHeight+2)return scrollProgress(pdfScroller);
  const frame=root.querySelector(".document-viewer iframe");
  if(frame){try{const frameDoc=frame.contentDocument||frame.contentWindow.document;const scroller=frameDoc.scrollingElement||frameDoc.documentElement;if(scroller&&scroller.scrollHeight>scroller.clientHeight+2)return scrollProgress(scroller);}catch{}}
  const main=root.querySelector(".reader-main");
  if(main&&main.scrollHeight>main.clientHeight+2)return scrollProgress(main);
  const scrolling=document.scrollingElement;
  if(scrolling&&scrolling.scrollHeight>scrolling.clientHeight+2)return scrollProgress(scrolling);
  return 0;
}
function scheduleReaderProgress(root){
  if(!activeUser||!activeReader||!root.isConnected)return;
  const percent=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(root)));
  updateReaderProgressUI(percent);
  if(percent===readerMaxProgress&&percent!==0)return;
  readerMaxProgress=percent;
  clearTimeout(readerSaveTimer);
  readerSaveTimer=setTimeout(()=>saveProgress(readerPayload()),450);
}
async function startReaderTracking(root){
  if(!activeUser||!root)return;
  const id=root.dataset.readerId;
  const previousId=activeReader?.id;
  if(activeReader&&activeReaderRoot){
    readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(activeReaderRoot)));
    const pending=readerPayload();if(pending)saveProgress(pending);
  }
  if(activeReaderCleanup)activeReaderCleanup();
  activeReader={id,title:root.dataset.readerTitle||id,subject:root.dataset.readerSubject||"Toán",grade:root.dataset.readerGrade||"10"};
  activeReaderRoot=root;
  if(String(previousId)!==String(id))readerMaxProgress=0;
  clearTimeout(readerSaveTimer);
  const onScroll=()=>scheduleReaderProgress(root);
  document.addEventListener("scroll",onScroll,true);
  window.addEventListener("scroll",onScroll,{passive:true});
  const pdfScroller=root.querySelector(".pdf-document-scroll");
  pdfScroller?.addEventListener("scroll",onScroll,{passive:true});
  const iframe=root.querySelector(".document-viewer iframe");
  const onFrameLoad=()=>{try{iframe.contentWindow.addEventListener("scroll",onScroll,{passive:true});iframe.contentDocument.addEventListener("scroll",onScroll,{passive:true,capture:true});}catch{}};
  iframe?.addEventListener("load",onFrameLoad);
  if(iframe?.contentDocument?.readyState==="complete")onFrameLoad();
  const text=root.querySelector(".document-text");
  const restorePosition=()=>{
    if(!Number.isFinite(scrollPercent)||scrollPercent<=0)return;
    if(pdfScroller&&pdfScroller.scrollHeight>pdfScroller.clientHeight){pdfScroller.scrollTop=(pdfScroller.scrollHeight-pdfScroller.clientHeight)*scrollPercent/100;return;}
    if(text&&text.scrollHeight>text.clientHeight){text.scrollTop=(text.scrollHeight-text.clientHeight)*scrollPercent/100;return;}
    if(iframe){try{const scroller=iframe.contentDocument.scrollingElement||iframe.contentDocument.documentElement;scroller.scrollTop=(scroller.scrollHeight-scroller.clientHeight)*scrollPercent/100;return;}catch{}}
    const scrolling=document.scrollingElement;if(scrolling)scrolling.scrollTop=(scrolling.scrollHeight-scrolling.clientHeight)*scrollPercent/100;
  };
  let scrollPercent=0;
  activeReaderCleanup=()=>{document.removeEventListener("scroll",onScroll,true);window.removeEventListener("scroll",onScroll);pdfScroller?.removeEventListener("scroll",onScroll);iframe?.removeEventListener("load",onFrameLoad);root.removeEventListener("pdf-reader-ready",restorePosition);clearTimeout(readerSaveTimer);};
  try{
    const data=await request("/api/progress");
    if(activeReader?.id!==id||!root.isConnected)return;
    const saved=(data.progress||[]).find(p=>p.itemType==="document"&&String(p.itemId)===String(id));
    readerMaxProgress=Math.max(0,Math.min(100,Number(saved?.progressPercent)||0));
    updateReaderProgressUI(readerMaxProgress);
    scrollPercent=Number(saved?.lastPosition);
    if(Number.isFinite(scrollPercent)&&scrollPercent>0){
      if(pdfScroller&&pdfScroller.dataset.pdfReady!=="true")root.addEventListener("pdf-reader-ready",restorePosition,{once:true});
      else requestAnimationFrame(restorePosition);
    }
    if(!saved)saveProgress(readerPayload());
  }catch(error){console.warn("Could not load reading progress:",error.message);}
}
window.addEventListener("maihoc-reader-leaving",()=>{
  if(!activeReader)return;
  const root=$("#reader-layout");
  if(root)readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(root)));
  updateReaderProgressUI(readerMaxProgress);clearTimeout(readerSaveTimer);
  const payload=readerPayload(readerMaxProgress===100?"completed":"in_progress");
  if(payload)saveProgress(payload);
  activeReaderCleanup?.();activeReaderCleanup=null;activeReader=null;activeReaderRoot=null;
});
window.addEventListener("maihoc-exam-completed",event=>{
  const d=event.detail||{};
  saveProgress({itemType:"exam",itemId:String(d.id||d.title||"exam"),itemTitle:d.title||"Đề thi",subject:d.subject||"Toán",grade:d.grade||"10",status:"completed",progressPercent:100,answers:d.answers||{},lastPosition:"100"});
});
window.addEventListener("pagehide",()=>{
  if(!activeReader)return;
  if(activeReaderRoot)readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(activeReaderRoot)));
  const payload=readerPayload(readerMaxProgress===100?"completed":"in_progress");
  if(payload)fetch("/api/progress",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
  activeReaderCleanup?.();activeReaderCleanup=null;activeReader=null;activeReaderRoot=null;
});
function addAdminReviewPanel() {
  if(!activeUser||activeUser.role!=="admin"||!$("#admin-users-table")||$("#admin-review-panel"))return;
  const panel=document.createElement("section");panel.id="admin-review-panel";panel.className="admin-submissions";
  panel.innerHTML='<div class="section-head"><div><h2>Tài liệu đã duyệt</h2><p class="muted">Xóa tài liệu khỏi thư viện.</p></div><button type="button" class="button primary" data-answer-key-open>Quản lý đáp án</button></div><div id="approved-documents"><p class="muted">Loading...</p></div><div class="section-head"><div><h2>Tài liệu chờ duyệt</h2></div></div><div id="pending-submissions"><p class="muted">Loading...</p></div><div class="section-head"><div><h2>Tiến trình học tập</h2></div></div><div id="admin-progress-list"><p class="muted">Loading...</p></div>';

  $("#admin-users-table").after(panel);loadApprovedDocuments();loadSubmissions();loadAdminProgress();
}
async function loadApprovedDocuments(){
  const box=$("#approved-documents");if(!box)return;
  try{
    const data=await request("/api/documents");
    const documents=Array.isArray(data)?data:[];
    if(!documents.length){box.innerHTML='<p class="muted">Chưa có tài liệu đã duyệt.</p>';return;}
    box.innerHTML='<div class="admin-table-wrap admin-approved-documents-scroll" role="region" aria-label="Danh sách tài liệu đã duyệt" tabindex="0"><table class="admin-table"><thead><tr><th>Tài liệu</th><th>Danh mục</th><th>Dung lượng</th><th>Thao tác</th></tr></thead><tbody>'+documents.map(d=>'<tr><td><strong>'+esc(d.title)+'</strong><br><span class="muted tiny">'+esc(d.originalName||d.filename)+'</span></td><td>'+esc(d.subject)+' / '+esc(d.grade)+' / '+esc(d.category)+'</td><td>'+Math.ceil((Number(d.size)||0)/1024)+' KB</td><td><button class="button secondary small" data-delete-document="'+esc(d.id)+'">Xóa</button></td></tr>').join('')+'</tbody></table></div>';
  }catch(error){box.innerHTML='<p class="auth-error">'+esc(error.message)+'</p>';}
}
async function loadAnswerKeySections(){
  const dialog=$("#answer-key-dialog");if(!dialog)return;
  for(const category of ["theory","practice","exam"]){const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(list)list.innerHTML='<p class="muted">\u0110ang t\u1ea3i...</p>';}
  try{
    const data=await request("/api/admin/answer-keys");
    for(const category of ["theory","practice","exam"]){
      const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(!list)continue;
      const docs=data.sections?.[category]||[];
      if(!docs.length){list.innerHTML='<p class="muted">Ch\u01b0a c\u00f3 t\u00e0i li\u1ec7u.</p>';continue;}
      list.innerHTML=docs.map(doc=>{
        let status="";
        if(category==="theory")status='<span class="answer-key-status">Kh\u00f4ng c\u1ea7n \u0111\u00e1p \u00e1n</span>';
        else if(doc.hasAnswerKey){
          status='<span class="answer-key-status is-ready">Đã tải đáp án</span>'+
            (doc.gradingAvailable?'<span class="answer-key-status is-ready">Đã sẵn sàng chấm</span>':'<span class="answer-key-status is-missing">Chưa thể chấm tự động</span>')+
            `<a class="text-button" href="/api/admin/documents/${encodeURIComponent(doc.id)}/answer-key" target="_blank" rel="noopener">Xem tệp đáp án gốc</a>`;
        }else status='<span class="answer-key-status is-missing">Ch\u01b0a c\u00f3 \u0111\u00e1p \u00e1n</span>';
        const upload=category==="theory"?"":`<label class="button secondary small answer-key-upload-label">${doc.hasAnswerKey?"Thay \u0111\u00e1p \u00e1n":"Upload \u0111\u00e1p \u00e1n"}<input type="file" accept=".pdf,.txt,.json,.csv,.docx" data-answer-key-upload="${esc(doc.id)}" hidden></label>`;
        const solution=category==="theory"?"":`<div class="exam-solution-admin-actions"><span class="answer-key-status ${doc.solutionStatus==="ready"?"is-ready":doc.solutionStatus==="failed"?"is-missing":""}">${esc(doc.solutionPhase||"Ch\u01b0a t\u1ea1o l\u1eddi gi\u1ea3i")}${["queued","reading","solving"].includes(doc.solutionStatus)?` · ${esc(doc.solutionProgress)}%`:""}</span><button class="button secondary small" data-solution-open="${esc(doc.id)}">${doc.solutionStatus==="review"?"Duy\u1ec7t l\u1eddi gi\u1ea3i AI":doc.solutionStatus==="ready"?"Xem b\u1ed9 ch\u1ea5m \u0111\u00e3 duy\u1ec7t":["queued","reading","solving"].includes(doc.solutionStatus)?"Xem ti\u1ebfn tr\u00ecnh":doc.solutionStatus==="failed"?"Xem l\u1ed7i / th\u1eed l\u1ea1i":"T\u1ea1o l\u1eddi gi\u1ea3i AI"}</button></div>`;
        return `<article class="answer-key-row"><div class="answer-key-main"><strong>${esc(doc.title)}</strong><span class="muted tiny">L\u1edbp ${esc(doc.grade)}${doc.answerKeyOriginalName?" \u00b7 "+esc(doc.answerKeyOriginalName):""}</span><div class="answer-key-statuses"><a class="text-button" href="/api/documents/${encodeURIComponent(doc.id)}/file" target="_blank" rel="noopener">Xem \u0111\u1ec1</a>${status}${solution}</div></div>${upload}</article>`;
      }).join("");
    }
  }catch(error){
    for(const category of ["theory","practice","exam"]){const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(list)list.innerHTML=`<p class="auth-error">${esc(error.message)}</p>`;}
  }
}
function solutionLabel(status){return ({queued:"Đang chờ xử lý",reading:"Đang đọc đề",solving:"AI đang giải đề",review:"Chờ admin duyệt",ready:"Đã duyệt, sẵn sàng chấm",failed:"Không tạo được lời giải",not_started:"Chưa tạo lời giải"})[status]||status;}
function solutionMathText(value){
  let text=String(value??"").replace(/\\\\/g,"\n").replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g,"");
  const superscript={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾"};
  const subscript={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","=":"₌","(":"₍",")":"₎"};
  for(let i=0;i<6;i++){
    const previous=text;
    text=text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,"($1)/($2)")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g,"√($1)")
      .replace(/\\(?:text|mathrm|mathbf)\s*\{([^{}]*)\}/g,"$1")
      .replace(/\\hat\s*\{([^{}]*)\}/g,"$1\u0302")
      .replace(/\^\{?([0-9+\-=()]*)\}?/g,(_,value)=>[...value].map(char=>superscript[char]||char).join(""))
      .replace(/_\{?([0-9+\-=()]*)\}?/g,(_,value)=>[...value].map(char=>subscript[char]||char).join(""));
    if(text===previous)break;
  }
  return text.replace(/\\\^?\\circ|\\circ/g,"°").replace(/\\(?:cdot|times)/g,match=>match.includes("times")?"×":"·")
    .replace(/\\(?:Rightarrow|Longrightarrow)/g,"⇒").replace(/\\(?:rightarrow|to)/g,"→")
    .replace(/\\(?:leq|le)/g,"≤").replace(/\\(?:geq|ge)/g,"≥").replace(/\\neq/g,"≠").replace(/\\approx/g,"≈")
    .replace(/\\pi/g,"π").replace(/\\(sin|cos|tan|log|ln)\b/g,"$1")
    .replace(/\\(?:left|right|displaystyle|,|;|:|!| )/g,"").replace(/\\([A-Za-z]+)/g,"$1")
    .replace(/\\([{}_$])/g,"$1").replace(/[{}]/g,"").replace(/\s+([,.;])/g,"$1").trim();
}
function solutionQuestionMarkup(item,editable){
  const rubric=Array.isArray(item.rubric)?item.rubric:[];
  const rubricText=rubric.map(row=>`${solutionMathText(row.criterion)} (${row.points} điểm)`).join("\n")||"Chưa có rubric chi tiết.";
  const uncertainty=String(item.uncertainty||"").trim();
  const showUncertainty=uncertainty&&!/^(none|null|undefined|n\/a)$/i.test(uncertainty);
  const rawAiAnswer=String(item.aiAnswer??item.answer??"").trim();
  const aiAnswer=/^(none|null|undefined)$/i.test(rawAiAnswer)?"":solutionMathText(rawAiAnswer);
  const type=String(item.type||"").toLowerCase();
  const answer=String(item.answer||"");
  let answerEditor;
  if(type==="multiple_choice"){
    const choice=answer.trim().toUpperCase();const selected=["A","B","C","D"].includes(choice)?choice:"";
    answerEditor=`<input data-solution-answer type="hidden" value="${esc(selected)}" ${editable?"":"disabled"}><div class="solution-answer-choice-group solution-answer-choice-group-four" role="group" aria-label="Chọn đáp án A, B, C hoặc D">${["A","B","C","D"].map(option=>`<button type="button" class="solution-answer-choice ${selected===option?"is-selected":""}" data-solution-option="${option}" aria-pressed="${selected===option}" ${editable?"":"disabled"}>${option}</button>`).join("")}</div>`;
  }else if(type==="true_false"){
    const normalized=answer.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const selected=["true","dung","d","t"].includes(normalized)?"true":["false","sai","s","f"].includes(normalized)?"false":"";
    answerEditor=`<input data-solution-answer type="hidden" value="${selected}" ${editable?"":"disabled"}><div class="solution-answer-choice-group solution-answer-choice-group-two" role="group" aria-label="Chọn Đúng hoặc Sai">${[["true","Đúng"],["false","Sai"]].map(([option,label])=>`<button type="button" class="solution-answer-choice ${selected===option?"is-selected":""}" data-solution-option="${option}" aria-pressed="${selected===option}" ${editable?"":"disabled"}>${label}</button>`).join("")}</div>`;
  }else{
    answerEditor=`<input data-solution-answer value="${esc(solutionMathText(answer))}" ${editable?"":"disabled"}>`;
  }
  return `<article class="solution-review-item" data-solution-item="${esc(item.targetId)}" data-original-answer="${esc(item.answer||"")}">
    <div class="solution-review-head"><h3>${esc(item.targetId)} · ${esc(item.type||"")}</h3><span class="answer-key-status ${Number(item.confidence)<0.7?"is-missing":""}">AI tin cậy ${Math.round((Number(item.confidence)||0)*100)}%${showUncertainty?" · Cần kiểm tra":""}</span></div>
    <div class="solution-review-grid"><section class="solution-review-pane"><h4>ĐỀ VÀ LỜI GIẢI AI</h4><p><strong>${esc(solutionMathText(item.questionText||""))}</strong></p><p><strong>AI chọn:</strong> ${esc(aiAnswer||"Chưa có đáp án")}</p>${item.referenceAnswer?`<p class="muted"><strong>File đáp án đối chiếu:</strong> ${esc(solutionMathText(item.referenceAnswer))}</p>`:""}<p>${esc(solutionMathText(item.explanation||"AI chưa tạo lời giải chi tiết."))}</p><p class="muted tiny"><strong>Rubric AI:</strong><br>${esc(rubricText)}</p>${showUncertainty?`<p class="auth-error">${esc(solutionMathText(uncertainty))}</p>`:""}</section>
      <section class="solution-review-pane"><h4>${editable?"ĐÁP ÁN ADMIN XÁC NHẬN":"ĐÁP ÁN ĐÃ DUYỆT"}</h4><label>Đáp án chuẩn${answerEditor}</label><label>Lời giải / ghi chú<textarea data-solution-explanation ${editable?"":"disabled"}>${esc(solutionMathText(item.explanation||""))}</textarea></label><label>Rubric theo tiêu chí (JSON)<textarea data-solution-rubric ${editable?"":"disabled"}>${esc(JSON.stringify(rubric.map(row=>({...row,criterion:solutionMathText(row.criterion)})),null,2))}</textarea></label></section></div>
    ${editable?`<div class="solution-review-controls"><button type="button" class="button secondary small" data-solution-decision="incorrect">Sai, tôi đã sửa</button><button type="button" class="button secondary small" data-solution-decision="correct">Đúng</button><span class="answer-key-status" data-solution-decision-label>Chưa xác nhận</span></div>`:`<div class="solution-review-controls"><span class="answer-key-status is-ready">${item.reviewStatus==="corrected"?"Admin đã sửa":"Admin đã xác nhận"}</span></div>`}
  </article>`;
}
function setSolutionReviewReady(){
  const dialog=$("#exam-solution-dialog"),save=dialog?.querySelector("[data-solution-save]");
  if(!dialog||!save)return;
  const items=[...dialog.querySelectorAll("[data-solution-item]")];
  save.disabled=!items.length||items.some(item=>!item.dataset.decision||!item.querySelector("[data-solution-answer]")?.value.trim());
}
function renderSolutionState(data){
  const dialog=$("#exam-solution-dialog");if(!dialog)return;
  const title=dialog.querySelector("[data-solution-title]"),status=dialog.querySelector("[data-solution-status]"),bar=dialog.querySelector("[data-solution-progress]"),label=dialog.querySelector("[data-solution-progress-label]"),error=dialog.querySelector("[data-solution-error]"),content=dialog.querySelector("[data-solution-review-content]"),retry=dialog.querySelector("[data-solution-retry]"),save=dialog.querySelector("[data-solution-save]"),download=dialog.querySelector("[data-solution-download]");
  activeSolutionId=data.id;
  if(title)title.textContent=data.title||"Lời giải đề thi";
  if(status)status.textContent=solutionLabel(data.status)+(data.phase&&data.phase!==solutionLabel(data.status)?` · ${data.phase}`:"");
  if(bar)bar.value=Number(data.progress)||0;if(label)label.textContent=`${Number(data.progress)||0}%`;
  if(error){error.hidden=!data.errorMessage;error.textContent=data.errorMessage||"";}
  const ready=data.status==="review",approved=data.status==="ready";
  const items=approved?data.approved?.questions:data.generated?.questions;
  if(content){
    if(Array.isArray(items)&&items.length){
      content.innerHTML=`<p class="muted">${approved?"Bộ đáp án chuẩn đã được admin xác nhận.":`AI tạo ${data.generated.answerCount}/${data.generated.requiredCount} đáp án. Đối chiếu từng câu với đề và nguồn đáp án trước khi lưu.`}${data.model?` · ${esc(data.model)}`:""}</p><p>${data.originalName?`<a class="text-button" href="/api/documents/${encodeURIComponent(data.id)}/file" target="_blank" rel="noopener">Mở đề gốc</a>`:""}${data.referenceAnswerName?` · <a class="text-button" href="/api/admin/documents/${encodeURIComponent(data.id)}/answer-key" target="_blank" rel="noopener">Mở file đáp án tham chiếu (${esc(data.referenceAnswerName)})</a>`:""}</p>${items.map(item=>solutionQuestionMarkup(item,ready)).join("")}`;
    }else content.innerHTML="";
  }
  if(retry)retry.hidden=data.status!=="failed"&&data.status!=="not_started";
  if(save)save.hidden=!ready;
  if(download){download.hidden=!data.generated;download.href=`/api/admin/documents/${encodeURIComponent(data.id)}/solution?download=json`;download.setAttribute("download",`loi-giai-${data.id}.json`);}
  setSolutionReviewReady();
  if(["queued","reading","solving"].includes(data.status)){
    clearTimeout(solutionPollTimer);solutionPollTimer=setTimeout(()=>loadSolutionState(data.id),1200);
  }else clearTimeout(solutionPollTimer);
}
async function loadSolutionState(id){
  try{renderSolutionState(await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`));}
  catch(error){showSolutionLoadError(error);}
}
function showSolutionLoadError(error){
  const dialog=$("#exam-solution-dialog");if(!dialog)return;
  clearTimeout(solutionPollTimer);
  const title=dialog.querySelector("[data-solution-title]"),status=dialog.querySelector("[data-solution-status]"),bar=dialog.querySelector("[data-solution-progress]"),label=dialog.querySelector("[data-solution-progress-label]"),node=dialog.querySelector("[data-solution-error]"),retry=dialog.querySelector("[data-solution-retry]"),save=dialog.querySelector("[data-solution-save]");
  if(title)title.textContent="Không tải được lời giải";
  if(status)status.textContent="Không kết nối được API lời giải";
  if(bar)bar.value=0;
  if(label)label.textContent="Lỗi";
  if(node){node.hidden=false;node.textContent=error?.message||"Không tải được trạng thái lời giải.";}
  if(retry)retry.hidden=false;
  if(save)save.hidden=true;
}
async function openSolutionDialog(id){
  const dialog=$("#exam-solution-dialog");if(!dialog)return;
  activeSolutionId=String(id);dialog.querySelector("[data-solution-title]").textContent="Đang tải lời giải";
  dialog.querySelector("[data-solution-review-content]").replaceChildren();dialog.querySelector("[data-solution-error]").hidden=true;
  if(!dialog.open)dialog.showModal();
  try{
    let data=await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`);
    if(data.status==="not_started"){
      await request(`/api/admin/documents/${encodeURIComponent(id)}/solution/generate`,{method:"POST"});
      data=await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`);
    }
    renderSolutionState(data);
  }catch(error){showSolutionLoadError(error);}
}
window.addEventListener("maihoc-exam-solution-job",event=>{if(activeUser?.role==="admin"&&event.detail?.id)openSolutionDialog(event.detail.id);});
document.addEventListener("click",event=>{
  const option=event.target.closest("[data-solution-option]");if(!option||option.disabled)return;
  const item=option.closest("[data-solution-item]");const answer=item?.querySelector("[data-solution-answer]");if(!item||!answer)return;
  answer.value=option.dataset.solutionOption;
  item.querySelectorAll("[data-solution-option]").forEach(button=>{const selected=button===option;button.classList.toggle("is-selected",selected);button.setAttribute("aria-pressed",String(selected));});
  answer.dispatchEvent(new Event("input",{bubbles:true}));
});
document.addEventListener("input",event=>{
  const item=event.target.closest("[data-solution-item]");if(!item)return;
  if(item.dataset.decision){delete item.dataset.decision;const label=item.querySelector("[data-solution-decision-label]");if(label){label.textContent="Đã sửa nội dung; xác nhận lại Đúng / Sai";label.classList.remove("decision-status-correct","decision-status-incorrect");}const controls=item.querySelector(".solution-review-controls");controls?.classList.remove("decision-confirmed-correct","decision-confirmed-incorrect");item.querySelectorAll("[data-solution-decision]").forEach(button=>button.classList.remove("is-selected","decision-button-correct","decision-button-incorrect"));}
  setSolutionReviewReady();
});
async function loadAdminProgress(){
 const box=$("#admin-progress-list");if(!box)return;
 try{
   const data=await request("/api/admin/progress");
   const rows=data.progress||[];
   if(!rows.length){box.innerHTML='<p class="muted">Chưa có tiến trình được ghi nhận.</p>';return;}
   const table=document.createElement("table");table.className="admin-table";
   table.innerHTML="<thead><tr><th>User</th><th>Nội dung</th><th>Môn/Lớp</th><th>Trạng thái</th><th>Tiến trình</th><th>Cập nhật</th><th>Kết quả</th></tr></thead>";
   const body=document.createElement("tbody");
   rows.forEach(p=>{
     const tr=document.createElement("tr");
     [p.userName+" ("+p.userEmail+")",p.itemType+" · "+(p.itemTitle||p.itemId),p.subject+" · "+p.grade,p.status,Number(p.progressPercent)+"%",p.updatedAt].forEach(value=>{
       const td=document.createElement("td");td.textContent=String(value??"");tr.append(td);
     });
     const actionCell=document.createElement("td");
     if(p.itemType==="exam"&&p.latestAttemptId){
       const link=document.createElement("button");link.type="button";link.className="button secondary small";
       link.dataset.action="view-exam-result";link.dataset.id=String(p.latestAttemptId);link.textContent="Xem kết quả";
       actionCell.append(link);
     }else actionCell.textContent="—";
     tr.append(actionCell);body.append(tr);
   });
   table.append(body);
   const wrap=document.createElement("div");wrap.className="admin-table-wrap admin-progress-scroll";wrap.setAttribute("role","region");wrap.setAttribute("aria-label","Danh sách tiến trình học tập");wrap.tabIndex=0;wrap.append(table);box.replaceChildren(wrap);
 }catch(e){box.textContent=e.message||"Không tải được tiến trình.";box.classList.add("auth-error");}
}
async function loadSubmissions() {
  const box=$("#pending-submissions");if(!box)return;
  try {
    const data=await request("/api/admin/submissions");
    box.innerHTML=(data.submissions||[]).length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tài liệu</th><th>Người gửi</th><th>Phân loại</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead><tbody>'+data.submissions.map(s=>'<tr><td><strong>'+esc(s.title)+'</strong><br><span class="muted tiny">'+esc(s.originalName)+' · '+Math.ceil(s.size/1024)+' KB</span>'+(s.answerKeyOriginalName?'<br><span class="answer-key-status is-ready">Kèm đáp án: '+esc(s.answerKeyOriginalName)+'</span>':'')+'</td><td>'+esc(s.userName)+'<br><span class="muted tiny">'+esc(s.userEmail)+'</span></td><td>'+esc(s.subject)+' · Lớp '+esc(s.grade)+'<br>'+esc(s.category)+'</td><td>'+esc(s.createdAt)+'</td><td><button class="button primary small" data-review-id="'+s.id+'" data-review-decision="approved">Duyệt</button> <button class="button secondary small" data-review-id="'+s.id+'" data-review-decision="rejected">Từ chối</button></td></tr>').join("")+'</tbody></table></div>':'<p class="muted">Không có tài liệu chờ duyệt.</p>';
  } catch(e) {box.innerHTML='<p class="auth-error">'+esc(e.message)+'</p>';}
}
document.addEventListener("click",async e=>{
  const solutionOpen=e.target.closest("[data-solution-open]");
  if(solutionOpen){openSolutionDialog(solutionOpen.dataset.solutionOpen);return;}
  const decisionButton=e.target.closest("[data-solution-decision]");
  if(decisionButton){
    const item=decisionButton.closest("[data-solution-item]");
    item.dataset.decision=decisionButton.dataset.solutionDecision;
    const label=item.querySelector("[data-solution-decision-label]");
    if(label){
      label.textContent=decisionButton.dataset.solutionDecision==="correct"?"Đã xác nhận đúng":"Đã xác nhận sai; kiểm tra đáp án đã sửa";
      label.classList.toggle("decision-status-correct",decisionButton.dataset.solutionDecision==="correct");
      label.classList.toggle("decision-status-incorrect",decisionButton.dataset.solutionDecision==="incorrect");
    }
    const controls=item.querySelector(".solution-review-controls");
    if(controls){
      controls.classList.toggle("decision-confirmed-correct",decisionButton.dataset.solutionDecision==="correct");
      controls.classList.toggle("decision-confirmed-incorrect",decisionButton.dataset.solutionDecision==="incorrect");
    }
    item.querySelectorAll("[data-solution-decision]").forEach(button=>{
      button.classList.toggle("is-selected",button===decisionButton);
      button.classList.toggle("decision-button-correct",button===decisionButton&&decisionButton.dataset.solutionDecision==="correct");
      button.classList.toggle("decision-button-incorrect",button===decisionButton&&decisionButton.dataset.solutionDecision==="incorrect");
    });
    const answer=item.querySelector("[data-solution-answer]");
    if(decisionButton.dataset.solutionDecision==="incorrect"&&answer.value===item.dataset.originalAnswer)answer.value="";
    if(decisionButton.dataset.solutionDecision==="correct"&&!answer.value)answer.value=item.dataset.originalAnswer;
    setSolutionReviewReady();return;
  }
  if(e.target.closest("[data-solution-retry]")){
    if(!activeSolutionId)return;
    try{await request(`/api/admin/documents/${encodeURIComponent(activeSolutionId)}/solution/generate`,{method:"POST"});await loadSolutionState(activeSolutionId);}
    catch(error){const node=$("[data-solution-error]");node.hidden=false;node.textContent=error.message;}
    return;
  }
  if(e.target.closest("[data-solution-save]")){
    if(!activeSolutionId)return;
    const button=e.target.closest("[data-solution-save]");button.disabled=true;
    try{
      const questions=[...$("#exam-solution-dialog").querySelectorAll("[data-solution-item]")].map(item=>{
        const rubricText=item.querySelector("[data-solution-rubric]").value;
        let rubric=[];try{rubric=JSON.parse(rubricText);}catch{throw new Error(`Rubric ${item.dataset.solutionItem} phải là JSON hợp lệ.`);}
        return {targetId:item.dataset.solutionItem,decision:item.dataset.decision,answer:item.querySelector("[data-solution-answer]").value,
          explanation:item.querySelector("[data-solution-explanation]").value,rubric};
      });
      await request(`/api/admin/documents/${encodeURIComponent(activeSolutionId)}/solution/review`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({questions})});
      await loadSolutionState(activeSolutionId);await loadAnswerKeySections();
      toastNotice("Đã lưu bộ đáp án chuẩn theo xác nhận của admin.","success");
    }catch(error){const node=$("[data-solution-error]");node.hidden=false;node.textContent=error.message;}
    finally{setSolutionReviewReady();}
    return;
  }
  if(e.target.closest("[data-answer-key-open]")){
    const dialog=$("#answer-key-dialog");
    if(dialog&&!dialog.open)dialog.showModal();
    loadAnswerKeySections();
  }
  const deleteDocument=e.target.closest("[data-delete-document]");
  if(deleteDocument){
    const id=deleteDocument.dataset.deleteDocument;
    if(!confirm("Bạn có chắc muốn xóa tài liệu này?"))return;
    try{
      await request("/api/admin/documents/"+encodeURIComponent(id),{method:"DELETE"});
      const key="maihoc-uploaded-docs";
      const cached=JSON.parse(localStorage.getItem(key)||"[]");
      localStorage.setItem(key,JSON.stringify(cached.filter(d=>String(d.id)!==String(id))));
      toastNotice("Đã xóa tài liệu.");
      loadApprovedDocuments();
      
      window.dispatchEvent(new Event("maihoc-documents-changed"));
    }catch(error){toastNotice(error.message,"error");}
  }

  if(e.target.closest("#notifications-open")){await refreshNotifications();const d=$("#notifications-dialog");if(d&&!d.open)d.showModal();}
  const read=e.target.closest("[data-notification-read]");
  if(read){try{await request("/api/notifications/"+read.dataset.notificationRead+"/read",{method:"POST"});refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  if(e.target.closest("#notifications-read-all")){try{await request("/api/notifications/read-all",{method:"POST"});refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  const deleteAllNotifications=e.target.closest("#notifications-delete-all");
  if(deleteAllNotifications){
    if(!confirm("Xóa toàn bộ thông báo của tài khoản này? Thao tác này không thể hoàn tác."))return;
    deleteAllNotifications.disabled=true;
    try{await request("/api/notifications",{method:"DELETE"});await refreshNotifications();toastNotice("Đã xóa toàn bộ thông báo.");}
    catch(err){toastNotice(err.message,"error");}
    finally{deleteAllNotifications.disabled=false;}
  }
  const review=e.target.closest("[data-review-id]");
  if(review){const decision=review.dataset.reviewDecision;const note=decision==="rejected"?(prompt("Lý do từ chối (không bắt buộc):")||""):"";try{await request("/api/admin/submissions/"+review.dataset.reviewId+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,note})});toastNotice(decision==="approved"?"Đã duyệt tài liệu.":"Đã từ chối tài liệu.");loadSubmissions();refreshNotifications();if(decision==="approved")window.dispatchEvent(new Event("maihoc-documents-changed"));}catch(err){toastNotice(err.message,"error");}}
  const startExam=e.target.closest('[data-action="start-exam"]');
  if(startExam&&activeUser){const card=startExam.closest(".exam-card");saveProgress({itemType:"exam",itemId:startExam.dataset.id,itemTitle:card?.querySelector("h3")?.textContent||startExam.dataset.id,subject:"Toán",grade:"10",status:"in_progress",progressPercent:0,lastPosition:"0"});}
});
document.addEventListener("change",async e=>{
  const input=e.target.closest("[data-answer-key-upload]");
  if(!input?.files?.[0])return;
  const form=new FormData();form.append("answerKey",input.files[0]);
  input.disabled=true;
  try{
    const result=await request(`/api/admin/documents/${encodeURIComponent(input.dataset.answerKeyUpload)}/answer-key`,{method:"POST",body:form});
    toastNotice(result.gradingAvailable?"Đã lưu đáp án; chấm tự động đã sẵn sàng.":"Đã lưu đáp án. Tệp này chỉ xem được, chưa thể dùng để chấm tự động.",result.gradingAvailable?"success":"error");
    await loadAnswerKeySections();loadApprovedDocuments();window.dispatchEvent(new Event("maihoc-documents-changed"));
  }catch(error){toastNotice(error.message,"error");}
  finally{input.disabled=false;input.value="";}
});
document.addEventListener("DOMContentLoaded",loadUser);
fetch("/api/documents").then(r=>r.ok?r.json():[]).then(list=>{if(!Array.isArray(list))return;const key="maihoc-uploaded-docs";const existing=JSON.parse(localStorage.getItem(key)||"[]");const known=new Set(existing.map(d=>d.id));for(const d of list){if(!known.has(d.id))existing.push({...d,sample:false,description:d.originalName||"Tài liệu đã được Admin duyệt"});}localStorage.setItem(key,JSON.stringify(existing));}).catch(()=>{});
const observer=new MutationObserver(()=>{
  if(activeUser?.role==="admin" && $("#admin-users-table") && !$("#admin-review-panel")) addAdminReviewPanel();
  const reader=$("#reader-layout");
  if(reader&&activeUser&&(activeReader?.id!==reader.dataset.readerId||activeReaderRoot!==reader))startReaderTracking(reader);
  else if(!reader&&activeReader){readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(activeReaderRoot)));const payload=readerPayload(readerMaxProgress===100?"completed":"in_progress");if(payload)saveProgress(payload);activeReaderCleanup?.();activeReaderCleanup=null;activeReader=null;activeReaderRoot=null;clearTimeout(readerSaveTimer);}
});
observer.observe(document.body,{childList:true,subtree:true});
setInterval(()=>{loadUser();},45000);
loadUser();
window.addEventListener("maihoc-auth-changed",loadUser);
