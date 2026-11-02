import { escapeHTML as e } from './ui.js';
export function schoolPlansMarkup() {
  return `<section class="portal-panel"><p class="eyebrow">MAIHOC SCHOOL</p><h1>Tài khoản dành riêng cho trường học</h1><p>Learning dành cho mọi học sinh. School là phiên bản trả phí dành cho học sinh; giáo viên dùng tài khoản đã xác minh email trường.</p><div class="portal-form-grid">${['School Standard','School Premium'].map(name=>`<article class="portal-panel"><h2>${name}</h2><p><strong>Đang cập nhật giá</strong></p><p>Chi tiết quyền lợi đang được hoàn thiện.</p><button class="button secondary" disabled>Chưa mở đăng ký gói</button></article>`).join('')}</div></section>`;
}
const request=async(path,body)=>{
  const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Không thực hiện được yêu cầu.');return data;
};
export function wireAccountUpgrade() {
  const form=document.getElementById('register-form'), details=form.querySelector('[data-registration-details]');
  const panel=document.createElement('div');panel.hidden=true;
  panel.innerHTML='<p>Xác minh email trường có đuôi .edu.vn để tiếp tục. Việc xác minh chỉ xác nhận quyền sở hữu hộp thư.</p><button class="button secondary" type="button" data-teacher-send>Gửi mã xác minh</button><label>Mã xác minh<input data-teacher-code inputmode="numeric" maxlength="6"></label><button class="button secondary" type="button" data-teacher-verify>Xác minh email</button><p role="status" data-teacher-status></p>';
  form.querySelector('[data-registration-details]').before(panel);
  let challengeId='',token='',verifiedEmail='';
  const classes=['10A','11B','12C'].flatMap(p=>Array.from({length:9},(_,i)=>p+(i+1)));
  const profile=document.createElement('div');profile.hidden=true;
  profile.innerHTML=`<label>Loại giáo viên<select name="teacherKind"><option value="subject">Giáo viên bộ môn</option><option value="homeroom">Giáo viên chủ nhiệm</option></select></label><label>Lớp chủ nhiệm<select name="homeroomClass"><option value="">Chọn lớp chủ nhiệm (nếu có)</option>${classes.map(c=>`<option>${c}</option>`).join('')}</select></label><fieldset><legend>Bộ môn giảng dạy</legend>${['Toán','Tiếng Anh','Vật lý','Hóa học','Ngữ văn','Sinh học','IELTS'].map(s=>`<label><input type="checkbox" name="subjects" value="${s}">${s}</label>`).join('')}</fieldset><fieldset><legend>Các lớp đang giảng dạy</legend>${classes.map(c=>`<label><input type="checkbox" name="teachingClasses" value="${c}">${c}</label>`).join('')}</fieldset>`;
  details.append(profile);
  const isTeacher=()=>form.elements.accountType.value==='teacher';
  function update(){const teacher=isTeacher();panel.hidden=!teacher;profile.hidden=!teacher;details.hidden=teacher&&!token;details.querySelectorAll('input').forEach(input=>{input.disabled=details.hidden||(!teacher&&profile.contains(input));});details.querySelectorAll('select').forEach(input=>input.disabled=!teacher);form.querySelector('[type=submit]').disabled=teacher&&!token;}
  form.addEventListener('change',ev=>{if(ev.target.name==='accountType'){token='';update();}});
  form.elements.email.addEventListener('input',()=>{token='';update();});
  const status=panel.querySelector('[data-teacher-status]');
  panel.addEventListener('click',async ev=>{
    const send=ev.target.closest('[data-teacher-send]'),verify=ev.target.closest('[data-teacher-verify]');if(!send&&!verify)return;
    ev.target.disabled=true;
    try{if(send){const data=await request('/api/auth/teacher/request-code',{email:form.elements.email.value});challengeId=data.challengeId;status.textContent=data.message;}
      else{const data=await request('/api/auth/teacher/verify-code',{challengeId,code:panel.querySelector('[data-teacher-code]').value});token=data.token;verifiedEmail=data.email;status.textContent='Đã xác minh email. Hãy hoàn tất hồ sơ giáo viên.';update();}}
    catch(err){status.textContent=err.message;}finally{ev.target.disabled=false;}
  });
  document.addEventListener('submit',async ev=>{
    if(ev.target!==form||!isTeacher())return;ev.preventDefault();ev.stopImmediatePropagation();
    const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    try{if(!token||verifiedEmail!==form.elements.email.value.trim().toLowerCase())throw Error('Vui lòng xác minh email trước.');
      const data=Object.fromEntries(new FormData(form));if(data.password!==data.confirmPassword)throw Error('Mật khẩu nhập lại chưa khớp.');
      data.subjects=[...profile.querySelectorAll('[name=subjects]:checked')].map(n=>n.value);data.teachingClasses=[...profile.querySelectorAll('[name=teachingClasses]:checked')].map(n=>n.value);
      await request('/api/auth/teacher/register',{...data,challengeId,token});location.assign('/school/classes');
    }catch(err){const error=document.getElementById('register-error');error.hidden=false;error.textContent=err.message;}finally{button.disabled=false;}
  },true);
  form.closest('dialog').addEventListener('close',()=>{token='';challengeId='';update();});update();
}
