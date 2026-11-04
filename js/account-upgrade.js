import { escapeHTML as e } from './ui.js';
export function schoolPlansMarkup() {
  return `<section class="portal-panel school-plans-page">
    <header class="school-plans-intro">
      <p class="eyebrow">MAIHOC SCHOOL · KHÔNG GIAN HỌC TẬP MỞ RỘNG</p>
      <h1>Học sâu hơn. Chủ động hơn.<br>Tiến bộ mỗi ngày.</h1>
      <p>MAIHOC School kết hợp học liệu, công cụ AI và hoạt động ôn luyện trong một không gian dành cho học sinh. Khám phá những công cụ hỗ trợ bạn học tập có định hướng và quản lý việc học thuận tiện hơn.</p>
    </header>
    <section class="school-plans-feature-grid" aria-label="Tính năng nổi bật của MAIHOC School">
      <article class="school-plans-feature">
        <span class="school-plans-feature-icon" aria-hidden="true">✦</span>
        <h2>Gia sư AI &amp; Cố vấn học tập</h2>
        <p>Hỗ trợ giải thích kiến thức, gợi mở cách làm và định hướng nội dung cần ôn luyện.</p>
      </article>
      <article class="school-plans-feature">
        <span class="school-plans-feature-icon" aria-hidden="true">▤</span>
        <h2>Số hóa đề &amp; Vở học AI</h2>
        <p>Hỗ trợ xử lý tài liệu học tập, xem lại nội dung và phát triển ghi chú ôn tập.</p>
      </article>
      <article class="school-plans-feature">
        <span class="school-plans-feature-icon" aria-hidden="true">◉</span>
        <h2>Phòng học trực tuyến</h2>
        <p>Không gian học nhóm để trao đổi, cùng học và chia sẻ nội dung.</p>
      </article>
      <article class="school-plans-feature">
        <span class="school-plans-feature-icon" aria-hidden="true">⚗</span>
        <h2>Thí nghiệm mô phỏng</h2>
        <p>Quan sát trực quan một số mô hình và hiện tượng Vật lý qua mô phỏng tương tác.</p>
      </article>
      <article class="school-plans-feature">
        <span class="school-plans-feature-icon" aria-hidden="true">✓</span>
        <h2>Bài tập &amp; kiểm tra</h2>
        <p>Theo dõi bài được giao, lịch kiểm tra và kết quả học tập trong cùng hệ thống.</p>
      </article>
      <article class="school-plans-feature">
        <span class="school-plans-feature-icon" aria-hidden="true">◎</span>
        <h2>IELTS &amp; học liệu School</h2>
        <p>Truy cập không gian học và ôn luyện được tổ chức riêng cho MAIHOC School.</p>
      </article>
    </section>
    <article class="school-standard-offer">
      <div class="school-standard-offer-head">
        <span class="school-standard-kicker">GÓI DÀNH CHO HỌC SINH</span>
        <h2>School Standard</h2>
        <p>Một gói duy nhất để mở khóa không gian học tập MAIHOC School và các tính năng được giới thiệu ở trên.</p>
      </div>
      <ul class="school-standard-includes">
        <li>Gia sư AI và Cố vấn học tập</li>
        <li>Số hóa đề, Vở học AI và học liệu School</li>
        <li>Phòng học trực tuyến và thí nghiệm mô phỏng</li>
        <li>Bài tập, kiểm tra và theo dõi kết quả</li>
      </ul>
      <div class="school-standard-offer-foot">
        <div class="school-standard-price-note">
          <strong>Giá và thời hạn đăng ký đang được hoàn thiện</strong>
          <span>Thông tin thanh toán sẽ được công bố khi hệ thống đăng ký chính thức mở.</span>
        </div>
        <button class="button primary" type="button" disabled>Đăng ký School Standard · Sắp mở</button>
      </div>
    </article>
  </section>`;
}
const request=async(path,body)=>{
  const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Không thực hiện được yêu cầu.');return data;
};
export function wireAccountUpgrade() {
  const form=document.getElementById('register-form'), details=form.querySelector('[data-registration-details]');
  const panel=document.createElement('div');panel.hidden=true;
  panel.innerHTML='<p data-teacher-instructions>Dùng email trường có đuôi .edu.vn và bấm link xác nhận trong hộp thư để tiếp tục. Không cần nhập mã.</p><button type="button" class="button secondary" data-teacher-send-link>Gửi link xác nhận</button><button type="button" class="button secondary" data-teacher-confirm-link hidden>Xác nhận email</button><p role="status" data-teacher-status></p>';
  let challengeId='',token='',verifiedEmail='',linkToken='';
  const status=panel.querySelector('[data-teacher-status]');
  details.before(panel);
  const educationEmail = /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+edu\.vn$/i;
  const classes=['10A','11B','12C'].flatMap(p=>Array.from({length:9},(_,i)=>p+(i+1)));
  const profile=document.createElement('div');profile.hidden=true;
  profile.innerHTML=`<label>Loại giáo viên<select name="teacherKind"><option value="subject">Giáo viên bộ môn</option><option value="homeroom">Giáo viên chủ nhiệm</option></select></label><label>Lớp chủ nhiệm<select name="homeroomClass"><option value="">Chọn lớp chủ nhiệm (nếu có)</option>${classes.map(c=>`<option>${c}</option>`).join('')}</select></label><fieldset><legend>Bộ môn giảng dạy</legend>${['Toán','Tiếng Anh','Vật lý','Hóa học','Ngữ văn','Sinh học','IELTS'].map(s=>`<label><input type="checkbox" name="subjects" value="${s}">${s}</label>`).join('')}</fieldset><fieldset><legend>Các lớp đang giảng dạy</legend>${classes.map(c=>`<label><input type="checkbox" name="teachingClasses" value="${c}">${c}</label>`).join('')}</fieldset>`;
  details.append(profile);
  const isTeacher=()=>form.elements.accountType.value==='teacher';
  function update(){
    const teacher=isTeacher(), valid=!teacher||educationEmail.test(form.elements.email.value.trim());
    panel.hidden=!teacher;profile.hidden=!teacher;details.hidden=teacher&&(!token||!valid);
    panel.querySelector('[data-teacher-send-link]').disabled=!valid||Boolean(linkToken)||Boolean(token);
    panel.querySelector('[data-teacher-send-link]').hidden=Boolean(token);
    panel.querySelector('[data-teacher-instructions]').hidden=Boolean(token);
    form.elements.email.readOnly=teacher&&Boolean(token);
    details.querySelectorAll('input,select').forEach(input=>{input.disabled=details.hidden||(!teacher&&profile.contains(input));});
    form.elements.email.setCustomValidity(valid?'':'Giáo viên cần email của trường có đuôi .edu.vn.');
    form.querySelector('[type=submit]').disabled=teacher&&(!valid||!token);
  }
  form.addEventListener('change',ev=>{if(ev.target.name==='accountType'){if(!isTeacher()){token='';verifiedEmail='';form.elements.email.readOnly=false;}update();}});
  form.elements.email.addEventListener('input',()=>{token='';verifiedEmail='';linkToken='';panel.querySelector('[data-teacher-confirm-link]').hidden=true;update();});
  panel.addEventListener('click',async ev=>{
    const button=ev.target.closest('[data-teacher-send-link], [data-teacher-confirm-link]');if(!button)return;button.disabled=true;
    try{
      if(button.hasAttribute('data-teacher-send-link')){const data=await request('/api/auth/teacher/request-link',{email:form.elements.email.value});status.textContent=data.message;}
      else{const data=await request('/api/auth/teacher/verify-link',{challengeId,linkToken});token=data.token;verifiedEmail=data.email;form.elements.email.value=data.email;linkToken='';button.hidden=true;status.textContent='Email đã được xác nhận. Hãy hoàn tất hồ sơ giáo viên.';}
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;update();}
  });
  document.addEventListener('submit',async ev=>{
    if(ev.target!==form||!isTeacher())return;ev.preventDefault();ev.stopImmediatePropagation();
    const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    try{if(!educationEmail.test(form.elements.email.value.trim()))throw Error('Giáo viên cần email của trường có đuôi .edu.vn.');
      if(!token||verifiedEmail!==form.elements.email.value.trim().toLowerCase())throw Error('Hãy xác nhận email qua link trong hộp thư trước.');
      const data=Object.fromEntries(new FormData(form));if(data.password!==data.confirmPassword)throw Error('Mật khẩu nhập lại chưa khớp.');
      data.subjects=[...profile.querySelectorAll('[name=subjects]:checked')].map(n=>n.value);data.teachingClasses=[...profile.querySelectorAll('[name=teachingClasses]:checked')].map(n=>n.value);
      await request('/api/auth/teacher/register',{...data,challengeId,token});location.assign('/school/classes');
    }catch(err){const error=document.getElementById('register-error');error.hidden=false;error.textContent=err.message;}finally{button.disabled=false;}
  },true);
  form.closest('dialog').addEventListener('close',()=>{token='';verifiedEmail='';linkToken='';panel.querySelector('[data-teacher-confirm-link]').hidden=true;update();});update();
  const confirmation=location.hash.match(/^#teacher-email-confirm=([a-f0-9-]{36}):([a-f0-9]{64})$/i);
  if(confirmation){
    challengeId=confirmation[1];linkToken=confirmation[2];
    history.replaceState(null,'',location.pathname+location.search);
    form.querySelector('[value=teacher]').checked=true;
    panel.querySelector('[data-teacher-confirm-link]').hidden=false;
    status.textContent='Bấm Xác nhận email để tiếp tục đăng ký giáo viên.';
    update();form.closest('dialog').showModal();
  }
}
