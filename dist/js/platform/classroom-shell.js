import { escapeHTML as e } from "../ui.js";
import { mountClassroomLive } from './classroom-live.js?v=20261106presentation1';

// Isolated UI scaffold: no writes to class membership, room APIs or account data.
export function mountClassroomShell(root, user, {onNavigate, classroomCode} = {}) {
  const admin = Boolean(user?.isSuperAdmin || (user?.role === "admin" && Number(user.adminLevel ?? user.admin_level) >= 2));
  const teacher = admin || Boolean(user?.isTeacher || user?.role === "teacher" || user?.role === "admin");
  const main = [ ...Array.from({length:10}, (_,i)=>`10A${i+1}`), ...Array.from({length:9}, (_,i)=>`11B${i+1}`), ...Array.from({length:9}, (_,i)=>`12C${i+1}`) ];
  const groups = {
    main: {name:"Lớp chính", rooms:main},
    lc: {name:"Lớp lựa chọn", rooms:[10,11,12].flatMap(g=>Array.from({length:10},(_,i)=>`${g}LC${i+1}`))},
    exam: {name:"Ôn thi đại học", rooms:[10,11,12].flatMap(grade=>["A00","A01","B00","C00","D01","D07"].map(block=>`${grade}${block}`))},
  };
  let group="main", selected="", room="", raised=false;
  const initialGroup=Object.keys(groups).find(key=>groups[key].rooms.includes(classroomCode));
  if(initialGroup){group=initialGroup;room=classroomCode;}
  function navigateRoom(code){
    if(onNavigate){onNavigate('school-rooms',{classroomCode:code||null});return;}
    room=code||'';raised=false;render();
  }
  const controller = new AbortController();
  const tabId=crypto.randomUUID(), sessionKey=`maihoc:classroom-tab:${user.id}`;
  let ownsRoom=false;
  function readOwner(){try{return JSON.parse(localStorage.getItem(sessionKey)||'null');}catch{return null;}}
  function releaseRoom(){const owner=readOwner();if(ownsRoom&&owner?.tabId===tabId)localStorage.removeItem(sessionKey);ownsRoom=false;}
  async function claimRoom(){
    const claim=()=>{
      if(controller.signal.aborted)return false;
      const owner=readOwner();
      if(owner&&owner.tabId!==tabId&&Date.now()-owner.at<90000){
        if(!window.confirm('Tài khoản đang mở phòng học ở tab khác. Bạn có muốn chuyển đổi thiết bị/tab sang đây? Tab cũ sẽ tự rời phòng.'))return false;
      }
      localStorage.setItem(sessionKey,JSON.stringify({tabId,room,at:Date.now()}));ownsRoom=true;return true;
    };
    return navigator.locks? navigator.locks.request(sessionKey,claim):claim();
  }
  window.addEventListener('storage',event=>{
    if(event.key!==sessionKey||!ownsRoom||!event.newValue)return;
    const owner=readOwner();if(owner&&owner.tabId!==tabId){ownsRoom=false;navigateRoom(null);}
  },{signal:controller.signal});
  window.addEventListener('pagehide',releaseRoom,{signal:controller.signal});
  const heartbeat=setInterval(()=>{if(ownsRoom&&readOwner()?.tabId===tabId)localStorage.setItem(sessionKey,JSON.stringify({tabId,room,at:Date.now()}));},15000);
  let access=null;
  let disposeLive=()=>{};
  function roomPresence(code,data=access){
    const count=Number(data?.rooms?.find(item=>item.class_code===code)?.participant_count||0);
    return `${Math.max(0,count)} người có mặt`;
  }
  function updateRoomPresence(data=access){
    root.querySelectorAll('[data-cr-card]').forEach(card=>{
      const label=card.querySelector('[data-cr-presence]');
      if(label)label.textContent=roomPresence(card.dataset.crCard,data);
    });
  }
  async function requestAccess(path='',body){
    const response=await fetch('/api/classroom-access'+path,{credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Không tải được quyền lớp.');return data;
  }
  async function loadAccess(){
    try{access=await requestAccess();if(controller.signal.aborted)return;
      if(room){await requestAccess('/rooms/'+encodeURIComponent(room));if(controller.signal.aborted)return;if(!await claimRoom()){navigateRoom(null);return;}if(controller.signal.aborted)return;}
      render();
    }catch(error){if(!controller.signal.aborted){
      releaseRoom();room='';
      if(!access){root.innerHTML='<section class="portal-panel"><h2>Chưa kiểm tra được quyền lớp</h2><p data-cr-error role="alert"></p><button type="button" class="button secondary" data-cr-retry>Thử lại</button></section>';root.querySelector('[data-cr-error]').textContent=error.name==='TimeoutError'?'Máy chủ phản hồi quá lâu. Hãy thử lại.':error.message;}
      else{render();status(error.message);}
    }}
  }
  let pendingImage=null;
  let imageViewer=null;
  function closeImageViewer(){if(imageViewer){imageViewer.close();imageViewer.remove();imageViewer=null;}}
  function openImageViewer(src,name){
    closeImageViewer();
    const dialog=document.createElement('dialog');imageViewer=dialog;
    dialog.setAttribute('aria-label','Xem ảnh đính kèm');
    dialog.style.cssText='width:94vw;max-width:1400px;height:90vh;max-height:94vh;padding:16px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:20px;';
    dialog.style.display='flex';dialog.style.flexDirection='column';
    dialog.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><strong style="flex:1;min-width:0;overflow-wrap:anywhere" data-image-title></strong><label style="display:flex;align-items:center;gap:10px">Zoom <input type="range" min="10" max="400" step="1" value="100" data-zoom-range aria-label="Mức phóng to ảnh" style="width:160px;accent-color:var(--primary)"><output data-zoom-percent style="min-width:48px">100%</output></label><button type="button" class="button secondary" data-zoom-reset>Vừa khung</button><a class="button secondary" data-image-download>Tải ảnh</a><button type="button" class="button secondary" data-image-close aria-label="Đóng ảnh">✕</button></div><div data-image-scroll style="flex:1;min-height:0;overflow:auto;background:var(--surface-2);border-radius:12px"><img data-image-full style="display:block;margin:auto" alt=""></div>';
    dialog.querySelector('[data-image-title]').textContent=name;
    const img=dialog.querySelector('[data-image-full]');img.src=src;img.alt=name;
    const download=dialog.querySelector('[data-image-download]');download.href=src;download.download=name;
    const slider=dialog.querySelector('[data-zoom-range]'), percent=dialog.querySelector('[data-zoom-percent]');
    function resize(value){const zoom=Math.max(10,Math.min(400,Math.round(value)));slider.value=String(zoom);percent.textContent=`${zoom}%`;slider.setAttribute('aria-valuetext',`${zoom}%`);img.style.maxWidth='none';img.style.maxHeight='none';img.style.width=`${Math.round(img.naturalWidth*zoom/100)}px`;img.style.height='auto';}
    function fit(){const viewport=dialog.querySelector('[data-image-scroll]');if(img.naturalWidth)resize(Math.min(100,viewport.clientWidth/img.naturalWidth*100,viewport.clientHeight/img.naturalHeight*100));}
    slider.addEventListener('input',()=>resize(Number(slider.value)));
    const viewport=dialog.querySelector('[data-image-scroll]');
    viewport.style.cursor='grab';viewport.style.touchAction='none';
    img.draggable=false;img.style.userSelect='none';
    viewport.addEventListener('wheel',event=>{
      event.preventDefault();
      if(!img.naturalWidth||event.deltaY===0)return;
      const rect=img.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
      const ratioX=(event.clientX-rect.left)/rect.width,ratioY=(event.clientY-rect.top)/rect.height;
      const next=Number(slider.value)+(event.deltaY<0?10:-10);
      resize(next);
      const updated=img.getBoundingClientRect();
      viewport.scrollLeft+=updated.left+ratioX*updated.width-event.clientX;
      viewport.scrollTop+=updated.top+ratioY*updated.height-event.clientY;
    },{passive:false});
    let drag=null;
    viewport.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      if(viewport.scrollWidth<=viewport.clientWidth&&viewport.scrollHeight<=viewport.clientHeight)return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
      viewport.setPointerCapture(event.pointerId);viewport.style.cursor='grabbing';event.preventDefault();
    });
    viewport.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      viewport.scrollLeft=drag.left-(event.clientX-drag.x);
      viewport.scrollTop=drag.top-(event.clientY-drag.y);
    });
    const stopDrag=event=>{if(!drag||drag.id!==event.pointerId)return;drag=null;viewport.style.cursor='grab';if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);};
    viewport.addEventListener('pointerup',stopDrag);
    viewport.addEventListener('pointercancel',stopDrag);
    viewport.addEventListener('lostpointercapture',()=>{drag=null;viewport.style.cursor='grab';});
    viewport.title='Lăn chuột để zoom · Giữ chuột trái và kéo để di chuyển ảnh';
    img.addEventListener('load',fit,{once:true});
    dialog.querySelector('[data-zoom-reset]').onclick=fit;
    dialog.querySelector('[data-image-close]').onclick=closeImageViewer;
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeImageViewer();});
    dialog.addEventListener('click',event=>{if(event.target===dialog)closeImageViewer();});
    root.append(dialog);dialog.showModal();if(img.complete&&img.naturalWidth)fit();
  }
  const imageUrls=new Set();
  const styles = `<style>
  .classroom-shell{display:grid;gap:24px}.classroom-shell .cr-head,.classroom-shell .cr-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:space-between}.classroom-shell .cr-search-label{display:flex;align-items:center;gap:14px}.classroom-shell .cr-search-label [data-cr-search]{min-width:248px}.classroom-shell .cr-room-nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.classroom-shell h1{margin:4px 0}.classroom-shell .cr-tabs{display:flex;flex-wrap:wrap;gap:10px}.classroom-shell .cr-tabs [aria-pressed=true]{background:var(--primary);color:var(--surface)}.classroom-shell .cr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}.classroom-shell .cr-room{display:grid;gap:12px;padding:20px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.classroom-shell .cr-room h3{margin:0}.classroom-shell .cr-muted{color:var(--muted);font-size:12px}.classroom-shell .cr-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px}.classroom-shell .cr-stage{min-height:320px;display:grid;place-content:center;text-align:center;padding:28px;border-radius:20px;background:var(--surface-2)}.classroom-shell .cr-log{min-height:140px;max-height:260px;overflow:auto;overflow-wrap:anywhere}.classroom-shell input,.classroom-shell select{padding:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);max-width:100%}.classroom-shell .cr-tools{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.classroom-shell .cr-note{padding:14px 18px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2)}@media(max-width:800px){.classroom-shell .cr-layout{grid-template-columns:1fr}.classroom-shell .cr-search-label{width:100%;justify-content:space-between}.classroom-shell .cr-search-label [data-cr-search]{min-width:0;flex:1}}
  .classroom-shell aside:has([data-cr-chat]){display:flex;flex-direction:column;align-self:start;min-width:0;padding:0!important;overflow:hidden;min-height:480px}.classroom-shell aside:has([data-cr-chat])>h2{padding:20px 20px 0;margin:0;font-size:18px}.classroom-shell aside:has([data-cr-chat])>.cr-muted{padding:8px 20px 16px;margin:0;font-size:11px;border-bottom:1px solid var(--border)}.classroom-shell .cr-log{height:300px;min-height:180px;max-height:380px;padding:18px 14px;display:flex;flex-direction:column;gap:14px;background:var(--surface-subtle,var(--surface-2));scrollbar-width:thin;scrollbar-color:var(--border) transparent;scroll-behavior:smooth}.classroom-shell .cr-log:empty:before{content:'Bắt đầu cuộc trò chuyện';margin:auto;text-align:center;color:var(--muted);font-size:12px}.classroom-shell .cr-message{align-self:flex-end;max-width:92%;display:grid;gap:5px}.classroom-shell .cr-message-meta{font-size:10px;color:var(--muted);text-align:right;padding:0 4px}.classroom-shell .cr-bubble{padding:11px 14px;background:var(--school-soft,var(--surface));color:var(--text);border:1px solid var(--border);border-radius:16px 16px 4px 16px;line-height:1.6;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.classroom-shell [data-cr-chat]{display:flex;align-items:center;gap:8px;padding:14px;border-top:1px solid var(--border);margin:0;background:var(--surface)}.classroom-shell [data-cr-chat] label{flex:1;min-width:0;font-size:0}.classroom-shell [data-cr-chat] input{width:100%;min-width:0;min-height:44px;font-size:12px;border-radius:14px!important;background:var(--surface-2)}.classroom-shell [data-cr-chat] button{width:44px;height:44px;min-width:44px;padding:0!important;border-radius:14px!important;flex-shrink:0;font-size:20px}
  .classroom-shell .cr-attachments{display:flex;gap:8px;padding:10px 14px 0;align-items:center}.classroom-shell .cr-attachments button{padding:7px 10px;font-size:12px}.classroom-shell .cr-preview{padding:10px 14px}.classroom-shell .cr-preview img{max-width:100%;max-height:120px;border-radius:10px}.classroom-shell .cr-bubble img{display:block;max-width:100%;height:auto;max-height:260px;object-fit:contain;border-radius:10px;margin-top:6px}
  .classroom-shell .cr-lobby-panel{display:flex;flex-direction:column;gap:20px}.classroom-shell .cr-lobby-panel>h2{margin:0}.classroom-shell .cr-search-row{display:flex;width:100%;margin:0 0 4px}.classroom-shell .cr-search-label{max-width:100%;gap:16px}.classroom-shell .cr-search-label input{min-width:0;max-width:100%}
  </style>`;
  function render(){
    disposeLive();disposeLive=()=>{};
    closeImageViewer();
    pendingImage=null;
    imageUrls.forEach(url=>URL.revokeObjectURL(url));imageUrls.clear();
    root.innerHTML=styles+`<section class="classroom-shell"><header class="cr-head"><div><p class="eyebrow">MAIHOC SCHOOL · PHÒNG HỌC ONLINE</p><h1>${room?`Phòng ${e(room)}`:"Phòng học School"}</h1><p>Chọn lớp và vào phòng học trực tuyến.</p></div><span class="pill" ${room?'hidden':''}>${admin?"Quản trị viên":teacher?"Giáo viên":"Học sinh"}</span></header><div class="cr-note">Tất cả phòng luôn mở · Số người có mặt được cập nhật tự động.</div>${room?roomMarkup():lobbyMarkup()}<p data-cr-status role="status" aria-live="polite"></p></section>`;
    const send = root.querySelector('[data-cr-chat] button');
    if(send){send.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg>';send.setAttribute('aria-label','Gửi tin nhắn xem thử');send.title='Gửi tin nhắn xem thử';}
    const form=root.querySelector('[data-cr-chat]');
    if(form){form.elements.message.required=false;form.insertAdjacentHTML('beforebegin','<div class="cr-preview" data-cr-preview hidden></div>');form.insertAdjacentHTML('afterbegin','<button type="button" class="button secondary" data-cr-pick aria-label="Đính kèm ảnh hoặc tệp" title="Đính kèm ảnh hoặc tệp">+</button><input type="file" data-cr-image hidden>');}
    if(!access){root.innerHTML='<p role="status">Đang kiểm tra quyền tham gia lớp…</p>';return;}
    if(!access.staff){
      const assigned=access.mine.filter(item=>item.status==='approved').map(item=>item.class_code);
      root.querySelectorAll('[data-cr-card]').forEach(card=>{card.hidden=!assigned.includes(card.dataset.crCard);});
      if(room&&assigned.length){const label=document.createElement('label');label.textContent='Đổi lớp ';const select=document.createElement('select');select.dataset.crSwitch='';for(const code of assigned)select.add(new Option(code,code,false,code===room));label.append(select);root.querySelector('.cr-room-nav').append(label);}
    }
    if(room){disposeLive=mountClassroomLive(root,room,status,{staff:access.staff,onChat:appendLiveChat});root.querySelector('.cr-note').textContent='Phòng luôn mở · Xem trước camera và mic trước khi tham gia.';}
    if(!room)updateRoomPresence();
    if(!access.staff&&!room){
      root.querySelectorAll('[data-cr-join]').forEach(button=>{
        const membership=access.mine.find(m=>m.class_code===button.dataset.crJoin);
        if(membership?.status==='approved'){button.textContent='Vào phòng';return;}
        button.dataset.crRequest=button.dataset.crJoin;delete button.dataset.crJoin;
        button.textContent=membership?.status==='pending'?'Đang chờ admin duyệt':'Yêu cầu tham gia';button.disabled=membership?.status==='pending';
      });
      const note=root.querySelector('.cr-note');note.textContent='Tất cả phòng luôn mở. Học sinh chỉ nhìn thấy các lớp đã được admin duyệt.';
    }
    if(access.admin&&!room){
      const panel=document.createElement('section');panel.className='portal-panel';panel.innerHTML='<h2>Yêu cầu tham gia lớp</h2>';
      if(!access.pending.length)panel.insertAdjacentHTML('beforeend','<p>Không có yêu cầu chờ duyệt.</p>');
      for(const item of access.pending){const row=document.createElement('div');row.className='cr-note';row.append(document.createTextNode(`${item.name} · ${item.email} · ${item.class_code} `));for(const [decision,label] of [['approved','Đồng ý'],['rejected','Từ chối']]){const b=document.createElement('button');b.className='button secondary';b.textContent=label;b.type='button';b.onclick=async()=>{b.disabled=true;try{await requestAccess('/review',{studentId:item.student_id,classCode:item.class_code,decision});await loadAccess();}catch(error){status(error.message);b.disabled=false;}};row.append(b);}panel.append(row);}
      root.querySelector('.cr-tabs').before(panel);
    }
  }
  function lobbyMarkup(){return `<nav class="cr-tabs" aria-label="Loại lớp">${Object.entries(groups).map(([key,g])=>`<button class="button secondary" data-cr-group="${key}" aria-pressed="${key===group}">${g.name}</button>`).join("")}</nav><section class="portal-panel cr-lobby-panel"><h2>${groups[group].name}</h2><div class="cr-search-row"><label class="cr-search-label">Tìm lớp <input data-cr-search placeholder="Nhập tên lớp…"></label></div>${group==="lc"?'<p class="cr-muted">Các mã LC là khung dự kiến; tổ hợp Xã hội / Tự nhiên sẽ được gán khi cấu hình lớp.</p>':""}<div class="cr-grid">${groups[group].rooms.map(name=>`<article class="cr-room" data-cr-card="${name}"><h3>${name}</h3><span class="cr-muted" data-cr-presence>${roomPresence(name)}</span><button class="button primary" data-cr-join="${name}">Vào phòng</button></article>`).join("")}</div></section>${admin?'<section class="portal-panel"><h2>Giám sát phòng học</h2><p>Số người có mặt trong từng phòng được hiển thị trực tiếp trên thẻ lớp.</p></section>':""}`;}
  function roomMarkup(){return `<div class="cr-toolbar"><div class="cr-room-nav"><button class="button secondary" data-cr-leave>← Danh sách lớp</button>${teacher?`<label>Đổi lớp <select data-cr-switch>${Object.values(groups).flatMap(g=>g.rooms).map(n=>`<option ${n===room?"selected":""}>${n}</option>`).join("")}</select></label>`:""}</div></div><div class="cr-layout"><section class="portal-panel"><div class="cr-stage"><div><h2>${teacher?"Sẵn sàng tổ chức buổi học":"Đang ở khung phòng chờ"}</h2><p>Camera, âm thanh và học sinh sẽ xuất hiện khi phòng trực tuyến được kết nối.</p><span class="cr-muted">Không có người tham gia hoặc video mô phỏng.</span></div></div><div class="cr-tools"><button class="button secondary" data-cr-feature="Mic">🎤 Mic</button><button class="button secondary" data-cr-feature="Camera">📷 Camera</button><button class="button secondary" data-cr-feature="Chia sẻ màn hình">🖥 Chia sẻ màn hình</button><button class="button secondary" data-cr-hand aria-pressed="${raised}">✋ ${raised?"Hạ tay":"Giơ tay"}</button><button class="button secondary" data-cr-reaction="👏">👏</button><button class="button secondary" data-cr-reaction="👍">👍</button><button class="button secondary" data-cr-leave>Rời phòng</button></div><p class="cr-muted">Chia sẻ tab, cửa sổ hoặc toàn màn hình sẽ dùng hộp chọn của trình duyệt khi tích hợp dịch vụ họp.</p>${teacher?'<section class="cr-note"><h3>Quản lý học sinh</h3><p>Chưa có học sinh kết nối.</p></section>':""}</section><aside class="portal-panel"><h2>Chat trong phòng</h2><p class="cr-muted">Xem thử giao diện trên máy này; tin nhắn chưa gửi tới người khác.</p><div class="cr-log" data-cr-log role="log"></div><form data-cr-chat><label>Tin nhắn<input name="message" required maxlength="500" placeholder="Nhập tin nhắn…"></label><button class="button primary" type="submit">Xem thử tin nhắn</button></form></aside></div>`;}
  root.addEventListener("click",ev=>{
    const b=ev.target.closest("button");if(!b)return;
    if(b.hasAttribute('data-cr-retry')){render();loadAccess();return;}
    if(b.dataset.crRequest){b.disabled=true;requestAccess('/request',{classCode:b.dataset.crRequest}).then(loadAccess).catch(error=>{status(error.message);b.disabled=false;});return;}
    if(b.hasAttribute('data-cr-pick')){root.querySelector('[data-cr-image]').click();return;}
    if(b.hasAttribute('data-cr-view-image')){const img=b.querySelector('img');openImageViewer(img.src,img.alt);return;}
    if(b.hasAttribute('data-cr-remove-image')){clearImage();return;}
    if(b.dataset.crGroup){group=b.dataset.crGroup;render();}
    else if(b.dataset.crJoin){requestAccess('/rooms/'+encodeURIComponent(b.dataset.crJoin)).then(()=>{if(!controller.signal.aborted)navigateRoom(b.dataset.crJoin);}).catch(error=>status(error.message));}
    else if(b.hasAttribute("data-cr-leave")){navigateRoom(null);}
    else if(b.hasAttribute("data-cr-hand")){b.disabled=true;Promise.resolve().then(()=>{if(!disposeLive.setHand)throw Error('Hãy tham gia phòng trước.');return disposeLive.setHand(!raised);}).then(()=>{raised=!raised;b.setAttribute('aria-pressed',String(raised));b.textContent='✋';b.title=raised?'Hạ tay':'Giơ tay';b.setAttribute('aria-label',b.title);}).catch(error=>status(error.message)).finally(()=>b.disabled=false);}
    else if(b.dataset.crReaction){Promise.resolve().then(()=>{if(!disposeLive.react)throw Error('Hãy tham gia phòng trước.');return disposeLive.react(b.dataset.crReaction);}).catch(error=>status(error.message));}
    else if(b.dataset.crFeature) return;
  },{signal:controller.signal});
  root.addEventListener("input",ev=>{if(ev.target.hasAttribute("data-cr-search")){const q=ev.target.value.trim().toLowerCase();root.querySelectorAll("[data-cr-card]").forEach(el=>el.hidden=!el.dataset.crCard.toLowerCase().includes(q));}},{signal:controller.signal});
  root.addEventListener("change",ev=>{if(ev.target.hasAttribute("data-cr-switch")){navigateRoom(ev.target.value);}},{signal:controller.signal});
  root.addEventListener('change',ev=>{if(ev.target.hasAttribute('data-cr-image')){const file=ev.target.files[0];if(file)setImage(file);ev.target.value='';}},{signal:controller.signal});
  root.addEventListener('paste',ev=>{if(!ev.target.closest('[data-cr-chat]'))return;const file=Array.from(ev.clipboardData?.files||[]).find(f=>f.type.startsWith('image/'));if(file){ev.preventDefault();setImage(file);}},{signal:controller.signal});
  function clearImage(){if(pendingImage){URL.revokeObjectURL(pendingImage.url);imageUrls.delete(pendingImage.url);}pendingImage=null;const box=root.querySelector('[data-cr-preview]');if(box){box.replaceChildren();box.hidden=true;}}
  function setImage(file){
    if(file.size>10*1024*1024){status('Tệp đính kèm tối đa 10 MB.');return;}
    const isImage=['image/png','image/jpeg','image/webp','image/gif'].includes(file.type);
    clearImage();const url=URL.createObjectURL(file);imageUrls.add(url);pendingImage={url,name:file.name||'Ảnh được dán',isImage,file};
    const box=root.querySelector('[data-cr-preview]');const preview=document.createElement(isImage?'img':'span');
    if(isImage){preview.src=url;preview.alt='Ảnh đính kèm chờ gửi';}else{preview.textContent=`📎 ${pendingImage.name} · ${Math.ceil(file.size/1024)} KB`;}
    const remove=document.createElement('button');remove.type='button';remove.className='button secondary small';remove.dataset.crRemoveImage='';remove.textContent='Bỏ tệp';box.append(preview,remove);box.hidden=false;
  }
  function appendLiveChat({text,name,mine,image,file}){
    const log=root.querySelector('[data-cr-log]');if(!log)return;
    const item=document.createElement('div');item.className='cr-message';if(!mine)item.style.alignSelf='flex-start';
    const meta=document.createElement('div');meta.className='cr-message-meta';meta.textContent=`${name} · ${new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}`;
    const bubble=document.createElement('div');bubble.className='cr-bubble';bubble.textContent=text;
    if(file){const link=document.createElement('a');link.href=file.src;link.download=file.name;link.textContent='📎 '+file.name+' · Tải xuống';link.style.cssText='display:block;color:inherit;overflow-wrap:anywhere';bubble.append(link);}
    if(image){const button=document.createElement('button');button.type='button';button.dataset.crViewImage='';button.setAttribute('aria-label','Xem ảnh lớn');button.style.cssText='display:block;max-width:100%;padding:0;border:0;background:transparent;cursor:zoom-in';const img=document.createElement('img');img.src=image;img.alt='Ảnh trong phòng học';button.append(img);bubble.append(button);}
    item.append(meta,bubble);log.append(item);while(log.childElementCount>300)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;
  }
  root.addEventListener('submit',async ev=>{
    if(!ev.target.hasAttribute('data-cr-chat'))return;ev.preventDefault();ev.stopImmediatePropagation();
    const form=ev.target,text=form.elements.message.value.trim();if(!text&&!pendingImage)return;
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{if(!disposeLive.sendChat)throw Error('Hãy tham gia phòng trước khi gửi.');
      if(pendingImage){if(!pendingImage.isImage){status('Đang gửi tệp…');await disposeLive.sendFile(pendingImage.file);}else{const bitmap=await createImageBitmap(pendingImage.file);const canvas=document.createElement('canvas');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let src=canvas.toDataURL('image/jpeg',.8);if(src.length>800000)src=canvas.toDataURL('image/jpeg',.45);await disposeLive.sendImage(src);}clearImage();status('Đã gửi tệp tới phòng.');}
      if(text)await disposeLive.sendChat(text);if(!controller.signal.aborted){form.reset();form.elements.message.focus();}}
    catch(error){if(!controller.signal.aborted)status(error.message);}finally{button.disabled=false;}
  },{signal:controller.signal,capture:true});
  root.addEventListener("submit",ev=>{
    if(!ev.target.hasAttribute("data-cr-chat"))return;
    ev.preventDefault();
    const message=ev.target.elements.message.value.trim();if(!message&&!pendingImage)return;
    const item=document.createElement('div');item.className='cr-message';
    const meta=document.createElement('div');meta.className='cr-message-meta';
    meta.textContent=`${user?.name||'Bạn'} · ${new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}`;
    const bubble=document.createElement('div');bubble.className='cr-bubble';bubble.textContent=message;
    if(pendingImage){
      const attachment=document.createElement(pendingImage.isImage?'img':'a');
      if(pendingImage.isImage){attachment.src=pendingImage.url;attachment.alt=pendingImage.name;}
      else{attachment.href=pendingImage.url;attachment.download=pendingImage.name;attachment.textContent=`📎 ${pendingImage.name}`;attachment.style.display='block';attachment.style.color='inherit';}
      if(pendingImage.isImage){const open=document.createElement('button');open.type='button';open.dataset.crViewImage='';open.setAttribute('aria-label','Xem ảnh lớn: '+pendingImage.name);open.title='Bấm để xem ảnh lớn';open.style.cssText='display:block;border:0;padding:0;background:transparent;cursor:zoom-in;max-width:100%;';open.append(attachment);bubble.append(open);}else bubble.append(attachment);
      pendingImage=null;const preview=root.querySelector('[data-cr-preview]');preview.replaceChildren();preview.hidden=true;
    }
    item.append(meta,bubble);const log=root.querySelector('[data-cr-log]');log.append(item);log.scrollTop=log.scrollHeight;
    ev.target.reset();ev.target.elements.message.focus();
  },{signal:controller.signal});
  function status(message){root.querySelector("[data-cr-status]").textContent=message;}
  render();
  loadAccess();
  const roomListTimer=setInterval(async()=>{if(room||controller.signal.aborted)return;try{const latest=await requestAccess();access=latest;updateRoomPresence(latest);}catch{}},5000);
  return ()=>{disposeLive();clearInterval(roomListTimer);releaseRoom();clearInterval(heartbeat);closeImageViewer();controller.abort();imageUrls.forEach(url=>URL.revokeObjectURL(url));};
}
