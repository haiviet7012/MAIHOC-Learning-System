import { mountSchoolReports } from './school-reports.js';
import { api } from './api.js';
import { escapeHTML as e } from '../ui.js';
const modules=[['message','Sổ liên lạc điện tử / Nhắn tin','Trao đổi với phụ huynh về học tập, hành vi và khoản thu.'],['board','Bảng tin lớp học','Chia sẻ hoạt động, bài giảng và thông báo chung.'],['event','Thời khóa biểu & Lịch sự kiện','Lịch dạy, lịch thi và hoạt động của lớp hoặc toàn trường.'],['grade','Sổ điểm điện tử','Nhập điểm, hệ số và xem trung bình theo môn, học kỳ.'],['attendance','Theo dõi chuyên cần','Có mặt, đi muộn, nghỉ có phép hoặc không phép.']];
const statuses={present:'Có mặt',late:'Đi muộn',excused:'Nghỉ có phép',unexcused:'Nghỉ không phép'};
export function mountSchoolManagement(root,{schoolId,classes}) {
 let disposeReports=()=>{};const controller=new AbortController();let cls=String(classes[0]?.id||''),tab='message',data,version=0;
 const base=`/api/platform/schools/${encodeURIComponent(schoolId)}/management`;
 const request=(url,opts={})=>api(url,{...opts,signal:controller.signal});
 root.innerHTML=`<section class="portal-panel"><h2>Công cụ quản lý nhà trường</h2><div class="grid three">${modules.map(([key,label,desc])=>`<button type="button" class="card" data-management-tab="${key}" aria-pressed="${key===tab}"><strong>${label}</strong><p>${desc}</p></button>`).join('')}</div><label>Lớp học<select data-management-class><option value="">Toàn trường (quản trị)</option>${classes.map(c=>`<option value="${e(c.id)}" ${String(c.id)===cls?'selected':''}>${e(c.name)}</option>`).join('')}</select></label><p role="status" data-management-status></p><div data-management-content></div></section>`;
 const target=root.querySelector('[data-management-content]'),status=root.querySelector('[data-management-status]');
 const field=(name,label,type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" required ${extra}></label>`;
 const students=()=>`<label>Học sinh<select name="studentId" required>${data.students.map(s=>`<option value="${e(s.id)}">${e(s.name)}</option>`).join('')}</select></label>`;
 const name=id=>data.students.find(s=>String(s.id)===String(id))?.name||'Học sinh';
 function draw(){
   disposeReports();
   const [,label]=modules.find(m=>m[0]===tab);
   let fields=field('title',tab==='grade'?'Tên cột điểm (trùng tên sẽ cập nhật)':'Tiêu đề');
   if(['message','grade','attendance'].includes(tab))fields+=students();
   if(tab==='grade')fields+=field('subject','Môn học')+field('term','Học kỳ / năm học')+field('score','Điểm (0–10)','number','min="0" max="10" step="0.01"')+field('weight','Hệ số','number','min="0.1" max="10" step="0.1" value="1"');
   else if(tab==='attendance')fields+=field('date','Ngày','date')+field('session','Buổi / tiết')+`<label>Trạng thái<select name="status">${Object.entries(statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>`;
   else {
     fields+='<label>Nội dung<textarea name="body" required maxlength="10000" rows="5"></textarea></label>';
     if(tab==='message')fields+='<label>Nội dung liên lạc<select name="category"><option value="learning">Học tập</option><option value="behavior">Hành vi</option><option value="fee">Khoản thu</option></select></label>';
     if(tab==='event')fields+=field('start','Bắt đầu','datetime-local')+field('end','Kết thúc','datetime-local');
     if(tab==='board')fields+='<label>Liên kết ảnh / video HTTPS (không bắt buộc)<input name="mediaUrl" type="url" placeholder="https://…"></label><label>Loại nội dung<select name="mediaType"><option value="image">Hình ảnh</option><option value="video">Video bài giảng</option></select></label><p class="muted">Dán liên kết ảnh/video đã tải lên kho lưu trữ của trường. Không dùng liên kết công khai cho nội dung riêng tư.</p>';
   }
   const privateTab=['message','grade','attendance'].includes(tab);
   const canWrite=data.staff&&(!privateTab||cls&&data.students.length);
   const records=data.items.filter(r=>r.kind===tab);
   target.innerHTML=`<h3>${label}</h3>${canWrite?`<form class="portal-form" data-management-form="${tab}">${fields}<button class="button primary">${tab==='message'?'Gửi đến phụ huynh đã liên kết':'Lưu'}</button></form>`:''}${privateTab&&!cls?'<p>Chọn lớp để sử dụng chức năng này.</p>':''}${tab==='message'&&data.admin&&cls?`<details><summary>Liên kết tài khoản phụ huynh / thông báo tự động</summary><form class="portal-form" data-management-form="guardians">${students()}${field('email','Email tài khoản phụ huynh đã đăng ký','email')}<label><input type="checkbox" name="autoNotify"> Gửi tự động khi nhập/sửa điểm và chuyên cần</label><button class="button secondary">Lưu liên kết</button></form>${data.guardians.filter(g=>data.students.some(s=>String(s.id)===String(g.student_id))).map(g=>`<p>${e(name(g.student_id))} → ${e(g.name)} (${e(g.email)}) · tự động: ${g.auto_notify?'Bật':'Tắt'}</p>`).join('')}</details>`:''}
   ${tab==='grade'?`<h4>Trung bình môn theo học kỳ</h4><p class="muted">Σ(điểm × hệ số) / Σ(hệ số), làm tròn 2 chữ số. Phân loại tham khảo: ≥8 Tốt, ≥6,5 Khá, ≥5 Đạt; chưa phải xếp loại học lực chính thức.</p>${data.summaries.map(s=>`<article class="portal-record">${e(name(s.studentId))} · ${e(s.subject)} · ${e(s.term)}: <strong>${e(s.average)}/10 · ${e(s.classification)}</strong></article>`).join('')}`:''}
   <h4>${tab==='event'?'Lịch đã lên':'Nội dung đã lưu'}</h4>${records.length?records.map(r=>{const p=r.payload;return `<article class="card"><h4>${e(p.title)}</h4>${r.student_id?`<p>${e(name(r.student_id))}</p>`:''}${p.body?`<p style="white-space:pre-wrap">${e(p.body)}</p>`:''}${tab==='grade'?`<p>${e(p.subject)} · ${e(p.term)}: ${e(p.score)}/10 · hệ số ${e(p.weight)}</p>`:''}${tab==='attendance'?`<p>${e(p.date)} · ${e(p.session)} · ${e(statuses[p.status])}</p>`:''}${tab==='event'?`<p>${e(new Date(p.start).toLocaleString('vi-VN'))} – ${e(new Date(p.end).toLocaleString('vi-VN'))}</p>`:''}${p.mediaUrl?`${p.mediaType==='image'?`<img src="${e(p.mediaUrl)}" alt="${e(p.title)}" loading="lazy" referrerpolicy="no-referrer" style="max-width:100%;max-height:360px;object-fit:contain">`:''}<p><a href="${e(p.mediaUrl)}" target="_blank" rel="noopener noreferrer">Mở ${p.mediaType==='image'?'ảnh':'video bài giảng'}</a></p>`:''}</article>`;}).join(''):'<p>Chưa có dữ liệu.</p>'}`;
   if(cls&&data.staff){const host=document.createElement('div');target.append(host);disposeReports=mountSchoolReports(host,{url:`${base}/reports?classId=${encodeURIComponent(cls)}`});}

 }
 async function load(){const v=++version;status.textContent='Đang tải…';target.innerHTML='';try{const next=await request(`${base}?classId=${encodeURIComponent(cls)}`);if(v!==version)return;data=next;draw();status.textContent='';}catch(err){if(v===version&&!controller.signal.aborted)status.textContent=err.message;}}
 root.addEventListener('click',ev=>{const b=ev.target.closest('[data-management-tab]');if(!b)return;tab=b.dataset.managementTab;root.querySelectorAll('[data-management-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(data)draw();},{signal:controller.signal});
 root.addEventListener('change',ev=>{if(ev.target.matches('[data-management-class]')){cls=ev.target.value;data=null;void load();}},{signal:controller.signal});
 root.addEventListener('submit',async ev=>{const f=ev.target;if(!f.matches('[data-management-form]'))return;ev.preventDefault();ev.stopPropagation();const button=f.querySelector('button');button.disabled=true;const v=version;status.textContent='Đang lưu…';try{const body={...Object.fromEntries(new FormData(f)),classId:cls,autoNotify:f.elements.autoNotify?.checked===true};await request(`${base}/${f.dataset.managementForm}`,{method:'POST',body});if(v===version){await load();status.textContent='Đã lưu. Thông báo phụ huynh được đưa vào hàng đợi email nếu đã liên kết; cần cấu hình email để gửi.';}}catch(err){if(v===version&&!controller.signal.aborted)status.textContent=err.message;}finally{button.disabled=false;}},{signal:controller.signal});
 void load();return ()=>{version++;disposeReports();controller.abort();};
}
