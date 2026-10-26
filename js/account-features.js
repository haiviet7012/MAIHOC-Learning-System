const $ = (s, root=document) => root.querySelector(s);
const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let activeUser = null;
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
  if(activeUser)refreshNotifications();
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
  if(!activeUser)return;
  try { await request("/api/progress",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});refreshNotifications(); }
  catch(e){console.warn("Không lưu được tiến trình:",e.message);}
}
function addAdminReviewPanel() {
  if(!activeUser||activeUser.role!=="admin"||!$("#admin-users-table")||$("#admin-review-panel"))return;
  const panel=document.createElement("section");panel.id="admin-review-panel";panel.className="admin-submissions";
  panel.innerHTML='<div class="section-head"><div><h2>Tài liệu chờ duyệt</h2><p class="muted">Tài liệu do User gửi sẽ được thông báo khi có quyết định.</p></div></div><div id="pending-submissions"><p class="muted">Đang tải…</p></div><div class="section-head"><div><h2>Tiến trình học tập</h2><p class="muted">Các bài học, tài liệu và lượt thi đã được ghi nhận.</p></div></div><div id="admin-progress-list"><p class="muted">Đang tải…</p></div>';
  $("#admin-users-table").after(panel);loadSubmissions();loadAdminProgress();
}
async function loadAdminProgress(){
 const box=$("#admin-progress-list");if(!box)return;
 try{const data=await request("/api/admin/progress");const rows=data.progress||[];
 if(!rows.length){box.innerHTML="<p class=\"muted\">Chưa có tiến trình được ghi nhận.</p>";return;}
 const table=document.createElement("table");table.className="admin-table";
 table.innerHTML="<thead><tr><th>User</th><th>Nội dung</th><th>Môn/Lớp</th><th>Trạng thái</th><th>Tiến trình</th><th>Cập nhật</th></tr></thead>";
 const body=document.createElement("tbody");
 rows.forEach(p=>{const tr=document.createElement("tr");[p.userName+" ("+p.userEmail+")",p.itemType+" · "+p.itemId,p.subject+" · "+p.grade,p.status,Number(p.progressPercent)+"%",p.updatedAt].forEach(value=>{const td=document.createElement("td");td.textContent=String(value??"");tr.append(td);});body.append(tr);});
 table.append(body);const wrap=document.createElement("div");wrap.className="admin-table-wrap";wrap.append(table);box.replaceChildren(wrap);
 }catch(e){box.textContent=e.message||"Không tải được tiến trình.";box.classList.add("auth-error");}
}
async function loadSubmissions() {
  const box=$("#pending-submissions");if(!box)return;
  try {
    const data=await request("/api/admin/submissions");
    box.innerHTML=(data.submissions||[]).length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tài liệu</th><th>Người gửi</th><th>Phân loại</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead><tbody>'+data.submissions.map(s=>'<tr><td><strong>'+esc(s.title)+'</strong><br><span class="muted tiny">'+esc(s.originalName)+' · '+Math.ceil(s.size/1024)+' KB</span></td><td>'+esc(s.userName)+'<br><span class="muted tiny">'+esc(s.userEmail)+'</span></td><td>'+esc(s.subject)+' · Lớp '+esc(s.grade)+'<br>'+esc(s.category)+'</td><td>'+esc(s.createdAt)+'</td><td><button class="button primary small" data-review-id="'+s.id+'" data-review-decision="approved">Duyệt</button> <button class="button secondary small" data-review-id="'+s.id+'" data-review-decision="rejected">Từ chối</button></td></tr>').join("")+'</tbody></table></div>':'<p class="muted">Không có tài liệu chờ duyệt.</p>';
  } catch(e) {box.innerHTML='<p class="auth-error">'+esc(e.message)+'</p>';}
}
document.addEventListener("click",async e=>{
  if(e.target.closest("#notifications-open")){await refreshNotifications();const d=$("#notifications-dialog");if(d&&!d.open)d.showModal();}
  const read=e.target.closest("[data-notification-read]");
  if(read){try{await request("/api/notifications/"+read.dataset.notificationRead+"/read",{method:"POST"});refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  if(e.target.closest("#notifications-read-all")){try{await request("/api/notifications/read-all",{method:"POST"});refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  const review=e.target.closest("[data-review-id]");
  if(review){const decision=review.dataset.reviewDecision;const note=decision==="rejected"?(prompt("Lý do từ chối (không bắt buộc):")||""):"";try{await request("/api/admin/submissions/"+review.dataset.reviewId+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,note})});toastNotice(decision==="approved"?"Đã duyệt tài liệu.":"Đã từ chối tài liệu.");loadSubmissions();refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  const readDoc=e.target.closest('[data-action="read-doc"]');
  if(readDoc&&activeUser){saveProgress({itemType:"document",itemId:readDoc.dataset.id,subject:"Toán",grade:document.querySelector(".grade")?.textContent?.match(/\d+/)?.[0]||"10",status:"in_progress",progressPercent:10,lastPosition:"opened"});}
  const startExam=e.target.closest('[data-action="start-exam"]');
  if(startExam&&activeUser){saveProgress({itemType:"exam",itemId:startExam.dataset.id,subject:"Toán",grade:"10",status:"in_progress",progressPercent:0,lastPosition:"started"});}
  if(e.target.closest("#confirm-yes")&&activeUser){const answers={};document.querySelectorAll("[data-answer]").forEach(el=>answers[el.dataset.answer]=el.value);saveProgress({itemType:"exam",itemId:document.querySelector(".exam-toolbar strong")?.textContent||"exam",subject:"Toán",grade:"10",status:"completed",progressPercent:100,answers,lastPosition:"submitted"});}
});
document.addEventListener("DOMContentLoaded",loadUser);
fetch("/api/documents").then(r=>r.ok?r.json():[]).then(list=>{if(!Array.isArray(list))return;const key="maihoc-uploaded-docs";const existing=JSON.parse(localStorage.getItem(key)||"[]");const known=new Set(existing.map(d=>d.id));for(const d of list){if(!known.has(d.id))existing.push({...d,sample:false,description:d.originalName||"Tài liệu đã được Admin duyệt"});}localStorage.setItem(key,JSON.stringify(existing));}).catch(()=>{});
const observer=new MutationObserver(()=>{if(activeUser?.role==="admin" && $("#admin-users-table") && !$("#admin-review-panel")) addAdminReviewPanel();});
observer.observe(document.body,{childList:true,subtree:true});
setInterval(()=>{loadUser();},45000);
loadUser();
window.addEventListener("maihoc-auth-changed",loadUser);
