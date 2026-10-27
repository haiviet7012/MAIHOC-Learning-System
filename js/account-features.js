const $ = (s, root=document) => root.querySelector(s);
const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let activeUser = null;
let activeReader = null;
let activeReaderRoot = null;
let activeReaderCleanup = null;
let readerMaxProgress = 0;
let readerSaveTimer = null;
async function request(url, options={}) {
  const response = await fetch(url, {credentials:"same-origin", ...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Yêu cầu không thành công.");
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
    box.innerHTML='<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tài liệu</th><th>Danh mục</th><th>Dung lượng</th><th>Thao tác</th></tr></thead><tbody>'+documents.map(d=>'<tr><td><strong>'+esc(d.title)+'</strong><br><span class="muted tiny">'+esc(d.originalName||d.filename)+'</span></td><td>'+esc(d.subject)+' / '+esc(d.grade)+' / '+esc(d.category)+'</td><td>'+Math.ceil((Number(d.size)||0)/1024)+' KB</td><td><button class="button secondary small" data-delete-document="'+esc(d.id)+'">Xóa</button></td></tr>').join('')+'</tbody></table></div>';
  }catch(error){box.innerHTML='<p class="auth-error">'+esc(error.message)+'</p>';}
}
function answerKeyExportLinks(id){
  const base=`/api/admin/documents/${encodeURIComponent(id)}/answer-key/normalized?format=`;
  return `<span class="answer-key-format-label">\u0110\u00e3 chu\u1ea9n h\u00f3a:</span><span class="answer-key-format-links"><a href="${base}json">JSON</a><a href="${base}csv">CSV</a><a href="${base}txt">TXT</a></span>`;
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
          status='<span class="answer-key-status is-ready">\u0110\u00e3 c\u00f3 \u0111\u00e1p \u00e1n</span>'+
            (doc.gradingAvailable?'<span class="answer-key-status is-ready">\u0110\u00e3 chu\u1ea9n h\u00f3a, s\u1eb5n s\u00e0ng ch\u1ea5m</span>':'<span class="answer-key-status">T\u1ec7p ch\u01b0a chuy\u1ec3n \u0111\u01b0\u1ee3c sang JSON/CSV/TXT</span>')+
            `<a class="text-button" href="/api/admin/documents/${encodeURIComponent(doc.id)}/answer-key" target="_blank" rel="noopener">Xem t\u1ec7p g\u1ed1c</a>`+
            (doc.gradingAvailable?answerKeyExportLinks(doc.id):"");
        }else status='<span class="answer-key-status is-missing">Ch\u01b0a c\u00f3 \u0111\u00e1p \u00e1n</span>';
        const upload=category==="theory"?"":`<label class="button secondary small answer-key-upload-label">${doc.hasAnswerKey?"Thay \u0111\u00e1p \u00e1n":"Upload \u0111\u00e1p \u00e1n"}<input type="file" accept=".pdf,.txt,.json,.csv,.docx" data-answer-key-upload="${esc(doc.id)}" hidden></label>`;
        return `<article class="answer-key-row"><div class="answer-key-main"><strong>${esc(doc.title)}</strong><span class="muted tiny">L\u1edbp ${esc(doc.grade)}${doc.answerKeyOriginalName?" \u00b7 "+esc(doc.answerKeyOriginalName):""}</span><div class="answer-key-statuses"><a class="text-button" href="/api/documents/${encodeURIComponent(doc.id)}/file" target="_blank" rel="noopener">Xem \u0111\u1ec1</a>${status}</div></div>${upload}</article>`;
      }).join("");
    }
  }catch(error){
    for(const category of ["theory","practice","exam"]){const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(list)list.innerHTML=`<p class="auth-error">${esc(error.message)}</p>`;}
  }
}
async function loadUploadAnswerManager(){
  const box=$("[data-upload-answer-list]");if(!box)return;
  box.innerHTML='<p class="muted">\u0110ang t\u1ea3i danh s\u00e1ch \u0111\u1ec1...</p>';
  try{
    const data=await request("/api/admin/answer-keys");
    const groups=[["practice","\u0110\u1ec1 \u00f4n t\u1eadp"],["exam","\u0110\u1ec1 thi th\u1eed"]];
    box.innerHTML=groups.map(([category,label])=>{
      const docs=data.sections?.[category]||[];
      const rows=docs.map(doc=>{
        const status=doc.hasAnswerKey
          ? `<span class="answer-key-status ${doc.gradingAvailable?"is-ready":"is-missing"}">${doc.gradingAvailable?"\u0110\u00e3 chu\u1ea9n h\u00f3a":"Ch\u01b0a chuy\u1ec3n \u0111\u1ed5i"}</span><a class="text-button" href="/api/admin/documents/${encodeURIComponent(doc.id)}/answer-key" target="_blank" rel="noopener">T\u1ec7p g\u1ed1c</a>${doc.gradingAvailable?answerKeyExportLinks(doc.id):""}`
          : '<span class="answer-key-status is-missing">Ch\u01b0a c\u00f3 \u0111\u00e1p \u00e1n</span>';
        return `<article class="upload-answer-row"><div class="upload-answer-file"><strong>${esc(doc.title)}</strong><span class="muted tiny">${esc(doc.originalName||("L\u1edbp "+doc.grade))}</span></div><div class="upload-answer-status">${status}<label class="button secondary small">${doc.hasAnswerKey?"Thay":"Upload"}<input type="file" accept=".pdf,.txt,.json,.csv,.docx" data-answer-key-upload="${esc(doc.id)}" hidden></label></div></article>`;
      }).join("");
      return `<section class="upload-answer-group"><h3>${label}</h3>${rows||'<p class="muted">Ch\u01b0a c\u00f3 \u0111\u1ec1.</p>'}</section>`;
    }).join("");
  }catch(error){box.innerHTML=`<p class="auth-error">${esc(error.message)}</p>`;}
}window.addEventListener("maihoc-upload-dialog-open",()=>{
  const panel=$("#upload-answer-manager");
  const layout=$("#upload-dialog-columns");
  if(!panel)return;
  panel.hidden=activeUser?.role!=="admin";
  layout?.classList.toggle("has-answer-manager",!panel.hidden);
  if(!panel.hidden)loadUploadAnswerManager();
});
async function loadAdminProgress(){
 const box=$("#admin-progress-list");if(!box)return;
 try{const data=await request("/api/admin/progress");const rows=data.progress||[];
 if(!rows.length){box.innerHTML="<p class=\"muted\">Chưa có tiến trình được ghi nhận.</p>";return;}
 const table=document.createElement("table");table.className="admin-table";
 table.innerHTML="<thead><tr><th>User</th><th>Nội dung</th><th>Môn/Lớp</th><th>Trạng thái</th><th>Tiến trình</th><th>Cập nhật</th></tr></thead>";
 const body=document.createElement("tbody");
 rows.forEach(p=>{const tr=document.createElement("tr");[p.userName+" ("+p.userEmail+")",p.itemType+" · "+(p.itemTitle||p.itemId),p.subject+" · "+p.grade,p.status,Number(p.progressPercent)+"%",p.updatedAt].forEach(value=>{const td=document.createElement("td");td.textContent=String(value??"");tr.append(td);});body.append(tr);});
 table.append(body);const wrap=document.createElement("div");wrap.className="admin-table-wrap";wrap.append(table);box.replaceChildren(wrap);
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
      loadUploadAnswerManager();
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
    await loadAnswerKeySections();await loadUploadAnswerManager();loadApprovedDocuments();window.dispatchEvent(new Event("maihoc-documents-changed"));
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
