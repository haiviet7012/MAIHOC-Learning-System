import { Room, RoomEvent, Track } from '../vendor/livekit-client.js';

export function mountClassroomLive(root,code,report,{staff=false,onChat=()=>{}}={}){
  let disposed=false,preview=null,meeting=null,timer=null;
  let session=null,polling=false;
  const stage=root.querySelector('.cr-stage');
  const meetingStyle=document.createElement('style');meetingStyle.textContent=`
  .classroom-shell.cr-in-call{position:fixed;inset:0;z-index:1300;background:#111315;color:#f1f3f4;padding:16px;display:flex;flex-direction:column;gap:12px;overflow:hidden;--surface:#202326;--surface-2:#292d31;--text:#f1f3f4;--muted:#b4bac3;--border:#3a3e44}
  .cr-in-call>.cr-head{min-height:40px}.cr-in-call>.cr-head h1{font-size:17px!important;color:#fff;margin:0}.cr-in-call>.cr-head p,.cr-in-call>.cr-head .eyebrow,.cr-in-call>.cr-note,.cr-in-call>.cr-toolbar{display:none}
  .classroom-shell.cr-in-call .cr-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;padding-bottom:84px}
  .classroom-shell.cr-in-call.cr-chat-hidden .cr-layout{grid-template-columns:1fr}.cr-in-call.cr-chat-hidden .cr-layout>aside{display:none}
  .classroom-shell.cr-in-call .cr-layout>section{background:transparent!important;border:0!important;padding:0!important;min-height:0;overflow:auto;box-shadow:none}
  .classroom-shell.cr-in-call .cr-stage{height:100%;min-height:280px;background:transparent;padding:0;display:flex;align-items:center;justify-content:center}
  .cr-in-call [data-live-videos]{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:14px!important;width:100%;height:100%;align-content:center}
  .cr-in-call .cr-video-tile{position:relative;overflow:hidden;border-radius:24px!important;background:#202326;min-height:200px;height:100%;max-height:calc(100dvh - 180px);display:flex;align-items:center;justify-content:center}
  .cr-in-call .cr-video-tile p{position:absolute;bottom:12px;left:16px;z-index:2;background:#0007;color:#fff;padding:5px 10px;border-radius:10px;font-size:13px}
  .cr-in-call .cr-video-tile video{width:100%!important;height:100%;max-height:calc(100dvh - 180px)!important;object-fit:contain;border-radius:24px!important}
  .classroom-shell.cr-in-call .cr-tools{position:absolute;bottom:16px;left:16px;right:16px;display:flex;justify-content:center;align-items:center;gap:12px;margin:0;padding:10px;background:#202326;border-radius:30px;flex-wrap:wrap}
  .classroom-shell.cr-in-call .cr-tools button{border-radius:22px!important;min-height:48px;padding:10px 16px!important;background:#34383d;color:#fff;border:0}
  .classroom-shell.cr-in-call .cr-tools button[aria-pressed=false]{background:#84333c}.classroom-shell.cr-in-call .cr-tools [data-cr-leave]{background:#dc3545!important;color:white}
  .cr-in-call .cr-layout>section>.cr-muted,.cr-in-call .cr-layout>section>.cr-note:not([data-session-panel]){display:none}
  .cr-in-call [data-session-panel]{padding:10px!important;margin-top:10px}.cr-in-call [data-session-panel] h3{font-size:13px!important;margin:0 0 8px}
  .classroom-shell.cr-in-call aside:has([data-cr-chat]){height:100%;min-height:0;border-radius:22px!important}.cr-in-call .cr-log{flex:1;height:auto;max-height:none}.cr-in-call>.cr-hand-list{position:absolute;top:18px;right:170px;font-size:12px;max-width:40%;padding:8px;border:0;background:transparent}.cr-in-call>[data-cr-status]{position:absolute;top:58px;left:20px;font-size:11px;pointer-events:none;max-width:65%}
  @media(max-width:800px){.classroom-shell.cr-in-call .cr-layout{grid-template-columns:1fr}.classroom-shell.cr-in-call:not(.cr-chat-hidden) .cr-layout>aside{position:absolute;top:70px;bottom:110px;right:12px;width:min(320px,90vw);height:auto;z-index:3}.classroom-shell.cr-in-call .cr-tools{gap:6px;bottom:8px;padding:8px}.classroom-shell.cr-in-call .cr-tools button{padding:8px 10px!important;font-size:11px;min-height:40px}}
  /* The animated #view creates a containing block for fixed descendants. */
  body:has(.cr-in-call) #view{animation:none!important;transform:none!important;filter:none!important;contain:none!important}
  body:has(.cr-in-call){overflow:hidden!important}
  body[data-school-ui] .classroom-shell.cr-in-call{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;margin:0!important;display:flex!important;z-index:10000!important;border-radius:0!important;box-sizing:border-box}
  body[data-school-ui] .cr-in-call>.cr-head{flex:0 0 40px!important;display:flex!important;padding-right:220px}
  body[data-school-ui] .cr-in-call>.cr-layout{flex:1 1 0!important;height:0!important;min-height:0!important;padding-bottom:90px!important;overflow:hidden}
  body[data-school-ui] .cr-in-call .cr-layout>section{display:flex!important;flex-direction:column!important;height:100%!important;overflow:hidden!important}
  body[data-school-ui] .cr-in-call .cr-stage{flex:1 1 0!important;height:0!important;min-height:180px!important;overflow:hidden!important}
  body[data-school-ui] .cr-in-call .cr-tools{position:fixed!important;top:auto!important;bottom:12px!important;left:16px!important;right:16px!important;width:auto!important;min-height:64px;z-index:5;box-sizing:border-box;border-radius:28px!important}
  body[data-school-ui] .cr-in-call>.cr-hand-list{top:20px!important;right:20px!important;max-width:35%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  body[data-school-ui] .cr-in-call>[data-cr-status]{top:58px!important;left:24px!important;max-width:70%;margin:0;background:#111315b0;border-radius:8px;padding:4px 8px}
  body[data-school-ui] .cr-in-call [data-live-videos]{min-height:180px;height:100%!important;align-content:stretch!important}
  .cr-in-call .cr-avatar{display:grid;place-items:center;width:100px;height:100px;border-radius:50%;background:#7254b6;color:white;font-size:40px;font-weight:700}
  body[data-school-ui] .cr-in-call .cr-tools [data-cr-hand][aria-pressed=false]{background:#34383d!important}
  @media(max-width:800px){body[data-school-ui] .cr-in-call>.cr-layout{padding-bottom:140px!important}body[data-school-ui] .cr-in-call .cr-tools{gap:8px!important}}
  body[data-school-ui] .classroom-shell.cr-in-call aside:has([data-cr-chat]){display:flex!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important}
  body[data-school-ui] .classroom-shell.cr-in-call.cr-chat-hidden .cr-layout>aside:has([data-cr-chat]){display:none!important}
  body[data-school-ui] .cr-in-call .cr-log{flex:1 1 0!important;min-height:60px!important;overflow-y:auto!important}
  body[data-school-ui] .cr-in-call [data-cr-preview]{flex:0 0 auto;max-height:155px;overflow:auto;padding:10px 14px;box-sizing:border-box}
  body[data-school-ui] .cr-in-call [data-cr-preview] img{max-height:90px!important;max-width:100%;object-fit:contain}
  body[data-school-ui] .cr-in-call [data-cr-chat]{flex:0 0 auto!important;display:flex!important;min-height:72px;gap:8px;padding:12px!important}
  body[data-school-ui] .cr-in-call [data-cr-chat] button{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 44px!important;min-width:44px!important;width:44px!important;height:44px!important;padding:0!important}
  body[data-school-ui] .cr-in-call .cr-tools button{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important;box-sizing:border-box}
  body[data-school-ui] .cr-in-call .cr-reaction-menu{gap:8px!important;padding:12px!important;bottom:calc(100% + 6px);border-radius:22px!important;max-width:calc(100vw - 32px);flex-wrap:wrap}
  body[data-school-ui] .cr-in-call .cr-reaction-menu button{flex:0 0 40px!important;width:40px!important;min-width:40px!important;height:44px!important;min-height:44px!important;padding:0!important;font-size:25px!important;line-height:1!important;border-radius:14px!important}
  body[data-school-ui] .cr-in-call .cr-reaction-menu{display:none;flex-wrap:nowrap!important;width:max-content!important;max-width:calc(100vw - 32px)!important;overflow:visible!important;scrollbar-width:none;gap:6px!important;left:50%;transform:translateX(-50%)}
  .cr-reaction-menu::-webkit-scrollbar{display:none}
  @media(max-width:480px){body[data-school-ui] .cr-in-call .cr-reaction-menu{gap:2px!important;padding:8px!important}body[data-school-ui] .cr-in-call .cr-reaction-menu button{flex:0 0 30px!important;min-width:30px!important;width:30px!important;font-size:22px!important}}
  body[data-school-ui] .cr-in-call .cr-reaction-picker:hover .cr-reaction-menu,body[data-school-ui] .cr-in-call .cr-reaction-picker:focus-within .cr-reaction-menu{display:flex!important;flex-direction:row!important}
  body[data-school-ui] .cr-in-call .cr-layout{grid-template-columns:minmax(0,1fr) 340px!important;align-items:stretch}
  body[data-school-ui] .cr-in-call.cr-chat-hidden .cr-layout{grid-template-columns:1fr!important}
  body[data-school-ui] .cr-in-call .cr-layout>aside{grid-column:2;grid-row:1;min-width:0;width:auto}
  body[data-school-ui] .cr-in-call [data-live-videos]{grid-template-columns:repeat(var(--video-columns,1),minmax(0,1fr))!important;grid-auto-rows:minmax(0,1fr);align-content:stretch!important;align-items:stretch;min-height:0!important}
  body[data-school-ui] .cr-in-call .cr-video-tile{min-height:0!important;max-height:none!important;transition:width .25s ease,height .25s ease}
  body[data-school-ui] .cr-in-call .cr-video-tile video{width:100%!important;height:100%!important;max-height:100%!important;object-fit:contain}
  body[data-school-ui] .cr-in-call .cr-layout>section{position:relative}
  body[data-school-ui] .cr-in-call [data-session-panel]{flex:0 0 auto;max-height:130px;overflow:auto}
  @media(max-width:800px){body[data-school-ui] .cr-in-call .cr-layout{grid-template-columns:1fr!important}body[data-school-ui] .cr-in-call .cr-layout>aside{grid-column:auto}}
  body[data-school-ui] .classroom-shell .cr-video-tile [data-hand-badge]{background:transparent!important;border:0!important;box-shadow:none!important;backdrop-filter:none!important;padding:4px!important}
  `;document.head.append(meetingStyle);
  const seenMessages=new Set();
  let reactionCloseTimer;
  meetingStyle.textContent+=`
  body[data-school-ui] .cr-in-call .cr-reaction-picker[data-open="true"] .cr-reaction-menu{display:flex!important;flex-direction:row!important}
  .cr-reaction-menu::after{content:'';position:absolute;top:100%;left:0;right:0;height:18px;background:transparent}
  `;
  const incomingImages=new Map();
  const incomingFiles=new Map();
  function receiveFile(data,participant){
    if(!participant||typeof data.id!=='string'||data.id.length>80||!Number.isInteger(data.index)||!Number.isInteger(data.total)||data.total<1||data.total>1450||data.index<0||data.index>=data.total||typeof data.chunk!=='string'||data.chunk.length>10000||typeof data.name!=='string'||data.name.length>255)return;
    for(const [key,item] of incomingFiles)if(Date.now()-item.at>120000)incomingFiles.delete(key);
    const key=participant.identity+':'+data.id;let item=incomingFiles.get(key);
    if(!item){if(incomingFiles.size>=2)return;item={at:Date.now(),total:data.total,name:data.name,parts:new Map()};incomingFiles.set(key,item);}
    if(item.total!==data.total)return;item.parts.set(data.index,data.chunk);
    if(item.parts.size===item.total){incomingFiles.delete(key);const src=Array.from({length:item.total},(_,i)=>item.parts.get(i)).join('');if(!/^data:application\/octet-stream;base64,[A-Za-z0-9+/=]+$/.test(src)||src.length>14000000)return;onChat({text:'',file:{src,name:item.name},name:participant.name||participant.identity,mine:false});}
  }
  function receiveImage(data,participant){
    if(!participant||typeof data.id!=='string'||data.id.length>80||!Number.isInteger(data.index)||!Number.isInteger(data.total)||data.total<1||data.total>80||data.index<0||data.index>=data.total||typeof data.chunk!=='string'||data.chunk.length>10000)return;
    const key=participant.identity+':'+data.id;
    for(const [k,v] of incomingImages)if(Date.now()-v.at>60000)incomingImages.delete(k);
    let item=incomingImages.get(key);if(!item){if(incomingImages.size>=8)return;item={at:Date.now(),parts:new Map(),total:data.total};incomingImages.set(key,item);}
    if(item.total!==data.total)return;item.parts.set(data.index,data.chunk);
    if(item.parts.size===item.total){incomingImages.delete(key);const src=Array.from({length:item.total},(_,i)=>item.parts.get(i)).join('');if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src))return;onChat({text:'',image:src,name:participant.name||participant.identity,mine:participant===meeting.localParticipant});}
  }
  const hands=document.createElement('div');hands.className='cr-hand-list';hands.setAttribute('aria-live','polite');
  function updateHands(){if(!meeting)return;const names=[meeting.localParticipant,...meeting.remoteParticipants.values()].filter(p=>p.attributes?.['classroom.hand']==='true').map(p=>p.name||p.identity);hands.textContent=names.length?'✋ '+names.join(', '):'';}
  function receiveChat(data,participant){if(!participant||typeof data.id!=='string'||data.id.length>80||typeof data.text!=='string'||!data.text.trim()||data.text.length>4000||seenMessages.has(data.id))return;seenMessages.add(data.id);if(seenMessages.size>1000)seenMessages.delete(seenMessages.values().next().value);onChat({text:data.text,name:participant.name||participant.identity,mine:participant===meeting.localParticipant});}
  async function sendEvent(type,payload){if(meeting?.state!=='connected')throw Error('Hãy tham gia phòng học trước khi gửi.');const data={id:crypto.randomUUID(),type,...payload};await meeting.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)),{reliable:true,topic:'classroom.events.v1'});return data;}
  const emojis=['👍','👏','❤️','😂','🎉','😮','🤔','🙌'];
  function showReaction(emoji,participant){
    const tile=Array.from(root.querySelectorAll('[data-live-videos] .cr-video-tile')).find(item=>item.dataset.identity===participant.identity);
    if(!tile)return;
    const group=document.createElement('span');group.dataset.reactionOverlay='';group.title=participant.name||participant.identity;group.setAttribute('role','status');group.setAttribute('aria-label',`${participant.name||participant.identity} thả cảm xúc ${emoji}`);group.style.cssText='position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden';
    tile.append(group);const active=tile.querySelectorAll('[data-reaction-overlay]');if(active.length>4)active[0].remove();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let remaining=5;
    for(let i=0;i<5;i++){
      const particle=document.createElement('i');particle.textContent=emoji;particle.style.cssText=`position:absolute;left:50%;top:55%;font-style:normal;font-size:${22+Math.round(Math.random()*8)}px;line-height:1;filter:drop-shadow(0 3px 7px #0008)`;group.append(particle);
      const drift=Math.round(Math.random()*110-55),rise=110+Math.round(Math.random()*80),delay=i*130+Math.round(Math.random()*100);
      const animation=particle.animate(reduced?[{opacity:1},{opacity:0}]:[{transform:'translate(-50%,-50%) translateY(18px) scale(.65)',opacity:0},{offset:.18,transform:`translate(-50%,-50%) translate(${Math.round(drift*.2)}px,0) scale(1)`,opacity:1},{offset:.72,opacity:.9},{transform:`translate(-50%,-50%) translate(${drift}px,-${rise}px) scale(1.08)`,opacity:0}],{duration:reduced?1200:3000+Math.round(Math.random()*700),delay,easing:'ease-out',fill:'both'});
      animation.onfinish=()=>{particle.remove();if(!--remaining)group.remove();};
    }
  }
  const reactionCss=document.createElement('style');reactionCss.textContent='.classroom-shell .cr-reaction-picker{position:relative;display:inline-flex}.cr-reaction-menu{display:none;position:absolute;bottom:100%;padding:12px 8px 18px;left:50%;transform:translateX(-50%);gap:6px;background:#292d31;border-radius:22px;z-index:20;box-shadow:0 8px 30px #0006}.cr-reaction-picker:hover .cr-reaction-menu,.cr-reaction-picker:focus-within .cr-reaction-menu{display:flex}.classroom-shell .cr-reaction-menu button{min-width:38px!important;width:38px!important;padding:4px!important;font-size:24px!important}';document.head.append(reactionCss);
  stage.classList.add('cr-prejoin');
  stage.innerHTML=`<style>
  .classroom-shell .cr-stage.cr-prejoin{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(220px,1fr);gap:28px;background:transparent;padding:0;text-align:left;align-items:center}.cr-prejoin .pj-preview{position:relative;aspect-ratio:16/10;background:#202124;border-radius:24px;overflow:hidden;color:white}.cr-prejoin video[data-camera-preview]{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;max-width:none!important}.pj-name{position:absolute;top:18px;left:20px;z-index:1;font-size:14px;font-weight:700;text-shadow:0 1px 5px #000}.pj-off{position:absolute;inset:0;display:grid;place-items:center;font-size:22px}.pj-controls{position:absolute;bottom:18px;left:0;right:0;display:flex;justify-content:center;gap:12px;z-index:1}.classroom-shell .pj-controls button{border-radius:50%!important;width:54px;height:54px;min-width:54px;padding:0!important;background:#e7e9ed;color:#202124;border:0;font-size:22px}.classroom-shell .pj-controls button[aria-pressed=false]{background:#f9dedd;color:#a22422}.pj-devices{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.pj-devices label{flex:1;min-width:120px;font-size:11px;color:var(--muted)}.classroom-shell .pj-devices select{width:100%;border-radius:24px!important;font-size:12px;min-height:40px}.pj-join{text-align:center}.pj-join h2{font-size:26px!important;margin:0 0 16px}.pj-join p{font-size:13px;line-height:1.7}.classroom-shell .pj-join [data-live-connect]{border-radius:32px!important;padding:16px 30px;min-width:200px;margin:16px 0}.pj-join details{margin-top:12px;font-size:12px}.pj-join summary{cursor:pointer;color:var(--primary)}.classroom-shell .cr-layout:has(.cr-prejoin){grid-template-columns:1fr}.classroom-shell .cr-layout:has(.cr-prejoin)>aside{display:none}.classroom-shell section:has(>.cr-prejoin)>.cr-tools{display:none}.classroom-shell section:has(>.cr-prejoin)>.cr-muted{display:none}@media(max-width:900px){.classroom-shell .cr-stage.cr-prejoin{grid-template-columns:1fr;gap:24px}.pj-preview{min-height:220px}}
  </style><div><div class="pj-preview"><span class="pj-name">Bạn · Phòng ${code}</span><div class="pj-off" data-camera-off>Camera đang tắt</div><video data-camera-preview autoplay muted playsinline hidden></video><div class="pj-controls"><button type="button" data-preview-mic aria-label="Bật mic" aria-pressed="false">🎤</button><button type="button" data-preview-camera aria-label="Bật camera" aria-pressed="false">📷</button></div></div><div class="pj-devices"><label>🎤 Microphone<select data-device-mic aria-label="Chọn microphone"><option value="">Mặc định</option></select></label><label>📷 Camera<select data-device-camera aria-label="Chọn camera"><option value="">Mặc định</option></select></label><button type="button" class="button secondary" data-test-speaker>🔊 Thử loa</button></div></div><div class="pj-join"><h2>Sẵn sàng tham gia?</h2><p data-live-status>Kiểm tra camera và mic trước khi vào phòng.</p><button class="button primary" data-live-connect>Đang kiểm tra phòng…</button><details><summary>Thông tin tham gia</summary><p>Phòng luôn mở. Camera và mic xem trước chỉ dùng trên máy bạn cho đến khi bạn bấm vào phòng.</p></details></div>`;
  const status=message=>{report(message);const el=root.querySelector('[data-live-status]');if(el)el.textContent=message;};
  async function readJson(response){if(!response.headers.get('content-type')?.includes('application/json'))throw Error('API phòng học chưa được cập nhật trên server đang chạy. Hãy khởi động lại server Node rồi tải lại trang.');return response.json();}
  const api=async(path,body)=>{const r=await fetch(`/api/classroom-access/rooms/${encodeURIComponent(code)}/${path}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await readJson(r);if(!r.ok)throw Object.assign(Error(data.error||'Không kết nối được phòng.'),{takeover:data.takeover});return data;};
  let cameraBusy=false,micStream=null,cameraWanted=false,recoveryCount=0,lastVideoTime=-1,stalledChecks=0;
  let meterContext=null,meterSource=null,meterTrack=null,analyser=null;
  const meter=document.createElement('span');meter.setAttribute('role','meter');meter.setAttribute('aria-label','Mức âm thanh microphone');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.style.cssText='display:inline-flex;align-items:center;justify-content:center;gap:3px;height:28px;min-width:27px;pointer-events:none';
  for(let i=0;i<5;i++){const bar=document.createElement('i');bar.style.cssText='display:block;width:3px;height:4px;background:#7c8792;border-radius:3px';meter.append(bar);}
  const toolbarMicButton=root.querySelector('[data-cr-feature="Mic"]');
  if(toolbarMicButton){toolbarMicButton.append(meter);toolbarMicButton.style.gap='8px';toolbarMicButton.style.minWidth='88px';}
  const meterTimer=setInterval(()=>{
    const track=meeting?.state==='connected'?meeting.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack:micStream?.getAudioTracks()[0];
    const enabled=track&&track.readyState==='live'&&track.enabled;
    if(enabled&&meterTrack!==track){try{meterSource?.disconnect();meterContext ||= new AudioContext();analyser=meterContext.createAnalyser();analyser.fftSize=256;meterSource=meterContext.createMediaStreamSource(new MediaStream([track]));meterSource.connect(analyser);meterTrack=track;meterContext.resume().catch(()=>{});}catch{}}
    let value=0;if(enabled&&analyser){const samples=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(samples);value=Math.min(100,Math.sqrt(samples.reduce((sum,x)=>sum+((x-128)/128)**2,0)/samples.length)*400);}
    meter.setAttribute('aria-valuenow',String(Math.round(value)));meter.title=enabled?`Mic đang thu: ${Math.round(value)}%`:'Mic đang tắt';
    Array.from(meter.children).forEach((bar,i)=>{bar.style.height=`${4+Math.max(0,Math.min(1,value/100-i*.12))*24}px`;bar.style.background=value>3?'#4ade80':'#7c8792';});
  },100);
  let cameraDevice='',micDevice='';
  async function listDevices(){try{const devices=await navigator.mediaDevices.enumerateDevices();for(const [selector,kind] of [['[data-device-camera]','videoinput'],['[data-device-mic]','audioinput']]){const select=root.querySelector(selector);if(!select)return;const value=select.value;select.replaceChildren(new Option('Mặc định',''));devices.filter(d=>d.kind===kind).forEach((d,i)=>select.add(new Option(d.label||`${kind==='videoinput'?'Camera':'Microphone'} ${i+1}`,d.deviceId)));select.value=value;}}catch{}}
  root.querySelector('[data-device-camera]').onchange=async event=>{cameraDevice=event.target.value;if(cameraWanted){preview?.getTracks().forEach(t=>t.stop());preview=null;await camera();}};
  root.querySelector('[data-device-mic]').onchange=event=>{micDevice=event.target.value;micStream?.getTracks().forEach(t=>t.stop());micStream=null;syncButtons();};
  root.querySelector('[data-test-speaker]').onclick=async()=>{try{const context=new AudioContext();await context.resume();const oscillator=context.createOscillator(),gain=context.createGain();gain.gain.value=.08;oscillator.connect(gain).connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.3);oscillator.onended=()=>context.close();}catch{status('Không phát được âm thanh kiểm tra.');}};
  listDevices();
  function applyMirror(){root.querySelectorAll('[data-camera-preview], [data-local-camera]').forEach(video=>video.style.transform='scaleX(-1)');}
  applyMirror();
  root.querySelector('[data-camera-preview]').hidden=true;
  const prejoinStyle=document.createElement('style');prejoinStyle.textContent=`
  .classroom-shell .pj-controls{gap:18px;bottom:22px}
  .classroom-shell .pj-controls button[aria-pressed="false"]{background:#dc3545!important;color:#fff!important}
  .classroom-shell .pj-controls button[aria-pressed="true"]{background:#e7e9ed!important;color:#202124!important}
  .classroom-shell .pj-devices{gap:16px;margin-top:20px;margin-bottom:24px;align-items:flex-end}
  .classroom-shell .pj-devices label{display:grid;gap:8px}
  .classroom-shell .pj-devices [data-test-speaker]{min-height:44px;padding:10px 18px}
  .classroom-shell .pj-join [data-live-connect]{margin:22px 0}
  `;stage.append(prejoinStyle);
  function deviceIcon(kind,on){
    const shape=kind==='mic'?'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>':'<rect x="3" y="5" width="12" height="14" rx="2"/><path d="m15 10 6-4v12l-6-4"/>';
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}${on?'':'<path d="m3 3 18 18" stroke-width="4.5" stroke="#dc3545"/><path d="m3 3 18 18" stroke-width="2"/>'}</svg>`;
  }
  const sessionPanel=document.createElement('section');sessionPanel.className='cr-note';sessionPanel.dataset.sessionPanel='';stage.after(sessionPanel);
  async function refreshSession(){
    if(disposed||polling)return;polling=true;
    try{
      const response=await fetch(`/api/classroom-access/rooms/${encodeURIComponent(code)}/session`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
      const data=await readJson(response);if(!response.ok)throw Error(data.error||'Không tải được phiên học.');if(disposed)return;
      session=data;
      if(meeting&&meeting.sessionId!==data.meetingId){await meeting.disconnect();meeting=null;status('Phòng đã được làm mới, vui lòng vào lại.');}
      sessionPanel.replaceChildren();const title=document.createElement('h3');title.textContent='Phòng luôn mở';sessionPanel.append(title);
      const connect=root.querySelector('[data-live-connect]');if(connect){connect.textContent='Vào phòng học';connect.disabled=false;}
    }catch(error){if(!disposed)status(error.message);}finally{polling=false;}
  }
  const sessionTimer=setInterval(refreshSession,3000);refreshSession();
  async function camera(){
    if(cameraBusy||disposed)return;cameraBusy=true;
    cameraWanted=true;
    try{
      if(!preview?.getVideoTracks().some(t=>t.readyState==='live'))preview=await navigator.mediaDevices.getUserMedia({video:{...(cameraDevice?{deviceId:{exact:cameraDevice}}:{facingMode:'user'}),width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}},audio:false});
      if(disposed){preview?.getTracks().forEach(t=>t.stop());return;}
      const video=root.querySelector('[data-camera-preview]');if(!video){preview?.getTracks().forEach(t=>t.stop());return;}
      video.hidden=false;if(video.srcObject!==preview)video.srcObject=preview;await video.play();applyMirror();status('Camera đang xem trước, chưa phát vào phòng.');syncButtons();listDevices();
    }catch{status('Không mở được camera. Kiểm tra quyền camera hoặc thiết bị đang được ứng dụng khác sử dụng.');}finally{cameraBusy=false;}
  }
  async function toggleCamera(){if(cameraWanted){cameraWanted=false;preview?.getTracks().forEach(t=>t.stop());preview=null;const video=root.querySelector('[data-camera-preview]');if(video){video.srcObject=null;video.hidden=true;}syncButtons();}else{recoveryCount=0;await camera();}}
  const cameraMonitor=setInterval(async()=>{
    if(disposed||!cameraWanted||cameraBusy||meeting||document.visibilityState!=='visible')return;
    const video=root.querySelector('[data-camera-preview]');if(!video)return;
    if(video.paused&&preview?.active){try{await video.play();}catch{}return;}
    const track=preview?.getVideoTracks()[0];
    stalledChecks=video.currentTime===lastVideoTime?stalledChecks+1:0;lastVideoTime=video.currentTime;
    if(track?.readyState==='ended'||stalledChecks>=3){
      stalledChecks=0;if(recoveryCount++<1){preview?.getTracks().forEach(t=>t.stop());preview=null;await camera();}
      else{cameraWanted=false;status('Camera bị ngắt hoặc không có hình. Hãy kiểm tra ứng dụng khác đang dùng camera rồi bấm bật lại.');}
    }
  },2000);
  root.querySelector('[data-preview-camera]').onclick=toggleCamera;
  function syncButtons(){
    const connected=meeting?.state==='connected';
    const cam=connected?meeting.localParticipant.isCameraEnabled:Boolean(preview?.getVideoTracks().some(t=>t.readyState==='live'));
    const mic=connected?meeting.localParticipant.isMicrophoneEnabled:Boolean(micStream?.getAudioTracks().some(t=>t.enabled&&t.readyState==='live'));
    for(const [key,enabled] of [['Camera',cam],['Mic',mic]]){const b=root.querySelector(`[data-cr-feature="${key}"]`);if(b){
      if(key==='Mic'){
        let icon=b.querySelector('[data-device-icon]');
        if(!icon){icon=document.createElement('span');icon.dataset.deviceIcon='';b.replaceChildren(icon,meter);}
        icon.innerHTML=deviceIcon('mic',enabled);b.style.gap='8px';b.style.minWidth='88px';
      }else b.innerHTML=deviceIcon('camera',enabled);
      b.title=`${enabled?'Tắt':'Bật'} ${key.toLowerCase()}`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(enabled));
    }}
    const b=root.querySelector('[data-preview-camera]');if(b){b.innerHTML=deviceIcon('camera',cam);b.setAttribute('aria-pressed',String(cam));b.setAttribute('aria-label',cam?'Tắt camera':'Bật camera');b.title=cam?'Tắt camera':'Bật camera';}
    const off=root.querySelector('[data-camera-off]');if(off)off.hidden=cam;
    const micButton=root.querySelector('[data-preview-mic]');if(micButton){micButton.innerHTML=deviceIcon('mic',mic);micButton.setAttribute('aria-pressed',String(mic));micButton.setAttribute('aria-label',mic?'Tắt mic':'Bật mic');micButton.title=mic?'Tắt mic':'Bật mic';}
  }
  if(!staff){root.querySelector('[data-preview-camera]').hidden=true;root.querySelector('[data-cr-feature="Camera"]')?.setAttribute('hidden','');root.querySelector('[data-cr-feature="Chia sẻ màn hình"]')?.setAttribute('hidden','');}
  root.querySelector('[data-live-connect]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
      if(!session){status('Đang kiểm tra phiên học, vui lòng thử lại.');return;}
      let auth;try{auth=await api('connect',{});}catch(error){if(!error.takeover||!confirm('Chuyển phòng sang thiết bị này? Thiết bị cũ sẽ rời phòng.'))throw error;auth=await api('connect',{takeover:true});}
      if(disposed)return;
      const cameraTrack=preview?.getVideoTracks().find(t=>t.readyState==='live'&&t.enabled);
      const microphoneTrack=micStream?.getAudioTracks().find(t=>t.readyState==='live'&&t.enabled);
      cameraWanted=false;
      meeting=new Room({adaptiveStream:true,dynacast:true});
      meeting.sessionId=auth.meetingId;
      meeting.on(RoomEvent.DataReceived,(bytes,participant,kind,topic)=>{if(disposed||topic!=='classroom.events.v1'||bytes.byteLength>16000)return;try{const data=JSON.parse(new TextDecoder().decode(bytes));if(data.type==='file-chunk')receiveFile(data,participant);else if(data.type==='image-chunk')receiveImage(data,participant);else if(data.type==='chat')receiveChat(data,participant);else if(data.type==='reaction'&&participant&&emojis.includes(data.emoji))showReaction(data.emoji,participant);}catch{}});
      meeting.on(RoomEvent.ParticipantAttributesChanged,updateHands);
      meeting.on(RoomEvent.ParticipantAttributesChanged,()=>{media();});
      meeting.on(RoomEvent.ParticipantDisconnected,updateHands);
      meeting.on(RoomEvent.ParticipantConnected,updateHands);
      const videos=document.createElement('div');videos.dataset.liveVideos='';videos.style.cssText='display:flex;flex-wrap:wrap;gap:12px;width:100%';
      const audioHost=document.createElement('div');audioHost.hidden=true;root.append(audioHost);
      const attachedAudio=new Map();let videoSignature='';
      function updateMicBadges(people){
        for(const person of people){
          const tile=Array.from(videos.children).find(el=>el.dataset.identity===person.identity);if(!tile)continue;
          let badge=tile.querySelector('[data-mic-muted]');
          if(person.isMicrophoneEnabled){badge?.remove();continue;}
          if(!badge){badge=document.createElement('span');badge.dataset.micMuted='';badge.title='Mic đang tắt';badge.setAttribute('aria-label','Mic đang tắt');badge.innerHTML=deviceIcon('mic',false);badge.style.cssText='position:absolute;bottom:16px;right:16px;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#dc3545;color:white;z-index:3;pointer-events:none';tile.append(badge);}
        }
      }
      function media(){if(disposed)return;
        const people=[meeting.localParticipant,...meeting.remoteParticipants.values()];
        const audioTracks=new Map();for(const person of meeting.remoteParticipants.values())for(const pub of person.trackPublications.values())if(pub.kind===Track.Kind.Audio&&pub.track&&!pub.isMuted)audioTracks.set(pub.trackSid,pub.track);
        for(const [sid,entry] of attachedAudio)if(audioTracks.get(sid)!==entry.track){entry.track.detach(entry.element);entry.element.remove();attachedAudio.delete(sid);}
        for(const [sid,track] of audioTracks)if(!attachedAudio.has(sid)){const element=track.attach();element.autoplay=true;audioHost.append(element);attachedAudio.set(sid,{track,element});}
        syncButtons();
        const priority=person=>Array.from(person.trackPublications.values()).some(p=>p.source===Track.Source.ScreenShare&&p.track&&!p.isMuted)?0:person.attributes?.['classroom.hand']==='true'?1:2;
        people.sort((a,b)=>priority(a)-priority(b));
        videos.style.setProperty('--video-columns',String(people.length<=1?1:people.length<=4?2:people.length<=9?3:4));
        for(const person of people){const tile=Array.from(videos.children).find(el=>el.dataset.identity===person.identity);if(tile){tile.style.order=String(people.indexOf(person));const caption=tile.querySelector('p');if(caption)caption.textContent=(person.attributes?.['classroom.hand']==='true'?'✋ ':'')+(person.name||person.identity);let badge=tile.querySelector('[data-hand-badge]');if(person.attributes?.['classroom.hand']==='true'){if(!badge){badge=document.createElement('span');badge.dataset.handBadge='';badge.textContent='✋';badge.style.cssText='position:absolute;top:16px;right:16px;font-size:30px;background:#34383d;border-radius:50%;padding:8px;z-index:3';tile.append(badge);}}else badge?.remove();}}
        const signature=JSON.stringify([...people].sort((a,b)=>a.identity.localeCompare(b.identity)).map(person=>[person.identity,person.name,...Array.from(person.trackPublications.values()).filter(pub=>pub.kind===Track.Kind.Video).map(pub=>[pub.trackSid,Boolean(pub.track),pub.isMuted])]));
        if(signature===videoSignature){updateMicBadges(people);return;}videoSignature=signature;
        videos.querySelectorAll('video').forEach(el=>{for(const person of people)for(const pub of person.trackPublications.values())pub.track?.detach(el);});
        videos.replaceChildren();for(const person of people){
        const tile=document.createElement('div');tile.className='cr-video-tile';tile.dataset.identity=person.identity;tile.style.cssText='flex:1 1 220px;min-width:0';tile.style.order=String(people.indexOf(person));const caption=document.createElement('p');caption.textContent=person.name||person.identity;tile.append(caption);
        if(!Array.from(person.trackPublications.values()).some(pub=>pub.kind===Track.Kind.Video&&pub.track&&!pub.isMuted)){const avatar=document.createElement('div');avatar.className='cr-avatar';avatar.textContent=(person.name||person.identity||'?').trim().charAt(0).toUpperCase();tile.append(avatar);}
        for(const pub of person.trackPublications.values()){if(pub.kind!==Track.Kind.Video||!pub.track||pub.isMuted)continue;const el=pub.track.attach();el.style.cssText='width:100%;max-height:350px;border-radius:14px';if(el.tagName==='VIDEO'){el.autoplay=true;el.playsInline=true;el.muted=person===meeting.localParticipant;if(person===meeting.localParticipant&&pub.source!==Track.Source.ScreenShare){el.dataset.localCamera='';el.style.setProperty('transform','scaleX(-1)','important');}}tile.append(el);}videos.append(tile);
      }updateMicBadges(people);applyMirror();syncButtons();}
      for(const type of [RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected])meeting.on(type,media);
      meeting.on(RoomEvent.Disconnected,()=>{clearInterval(timer);status('Đã rời phòng trực tuyến.');});
      await meeting.connect(auth.url,auth.token);if(disposed){meeting.disconnect();return;}
      // Publish the existing capture tracks instead of reopening the devices.
      if(cameraTrack&&staff)await meeting.localParticipant.publishTrack(cameraTrack,{source:Track.Source.Camera});
      if(microphoneTrack)await meeting.localParticipant.publishTrack(microphoneTrack,{source:Track.Source.Microphone});
      preview=null;micStream=null;
      meeting.once(RoomEvent.Disconnected,()=>{for(const entry of attachedAudio.values()){entry.track.detach(entry.element);entry.element.remove();}attachedAudio.clear();audioHost.remove();});
      stage.classList.remove('cr-prejoin');stage.replaceChildren(videos);
      const shell=root.querySelector('.classroom-shell');shell.classList.add('cr-in-call','cr-chat-hidden');shell.append(hands);
      const chatToggle=document.createElement('button');chatToggle.className='button secondary';chatToggle.type='button';chatToggle.textContent='💬 Chat';chatToggle.setAttribute('aria-expanded','false');chatToggle.onclick=()=>{shell.classList.toggle('cr-chat-hidden');chatToggle.setAttribute('aria-expanded',String(!shell.classList.contains('cr-chat-hidden')));};root.querySelector('.cr-tools').append(chatToggle);
      const full=document.createElement('button');full.className='button secondary';full.type='button';full.textContent='⛶ Toàn màn hình';full.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen();}catch{status('Không bật được toàn màn hình.');}};root.querySelector('.cr-tools').append(full);
      const toolbar=root.querySelector('.cr-tools');
      const hand=toolbar.querySelector('[data-cr-hand]');if(hand){hand.textContent='✋';hand.title='Giơ tay';hand.setAttribute('aria-label','Giơ tay');hand.style.cssText='width:52px;min-width:52px;padding:0;font-size:24px';}
      const like=toolbar.querySelector('[data-cr-reaction="👍"]');if(like){const picker=document.createElement('div');picker.className='cr-reaction-picker';like.before(picker);picker.append(like);like.title='Thả cảm xúc';like.setAttribute('aria-label','Thả cảm xúc');const menu=document.createElement('div');menu.className='cr-reaction-menu';menu.setAttribute('aria-label','Chọn cảm xúc');for(const emoji of emojis){const b=document.createElement('button');b.type='button';b.dataset.crReaction=emoji;b.textContent=emoji;b.setAttribute('aria-label',emoji);menu.append(b);}picker.append(menu);
        const open=()=>{clearTimeout(reactionCloseTimer);picker.dataset.open='true';like.setAttribute('aria-expanded','true');};
        const closeLater=()=>{clearTimeout(reactionCloseTimer);reactionCloseTimer=setTimeout(()=>{picker.dataset.open='false';like.setAttribute('aria-expanded','false');},650);};
        picker.addEventListener('pointerenter',open);picker.addEventListener('pointerleave',closeLater);
        menu.addEventListener('pointerenter',open);menu.addEventListener('pointerleave',closeLater);
        picker.addEventListener('focusin',open);picker.addEventListener('focusout',closeLater);
        like.addEventListener('click',open);
      }
      toolbar.querySelector('[data-cr-reaction="👏"]')?.remove();
      const iconButton=(button,label,path)=>{if(!button)return;button.title=label;button.setAttribute('aria-label',label);button.innerHTML=`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;button.style.width='52px';button.style.padding='0';};
      iconButton(toolbar.querySelector('[data-cr-feature="Chia sẻ màn hình"]'),'Chia sẻ màn hình','<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4M12 13V6m-4 4 4-4 4 4"/>');
      iconButton(chatToggle,'Mở/đóng chat','<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/>');
      iconButton(full,'Toàn màn hình','<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>');
      iconButton(toolbar.querySelector('[data-cr-leave]'),'Rời phòng','<path d="M3 15c5-5 13-5 18 0v4h-5v-4M3 15v4h5v-4"/>');
      media();updateHands();status('');
      const hint=root.querySelector('aside > .cr-muted');if(hint)hint.textContent='Tin nhắn được gửi trực tiếp tới mọi người đang ở trong phòng. Chưa lưu lịch sử trên server.';
      timer=setInterval(()=>api('heartbeat',{}).catch(error=>status(error.message)),20000);
    }catch(error){status(error.message);if(meeting){meeting.removeAllListeners();await meeting.disconnect();meeting=null;}}finally{button.disabled=false;}
  };
  const controls=new AbortController();
  root.querySelector('[data-preview-mic]').onclick=()=>root.querySelector('[data-cr-feature="Mic"]').click();
  root.addEventListener('click',async event=>{
    const action=event.target.closest('[data-cr-feature]')?.dataset.crFeature;if(!action)return;
    if(!staff&&['Camera','Chia sẻ màn hình'].includes(action)){
      if(action==='Camera'&&meeting?.localParticipant.isCameraEnabled){await meeting.localParticipant.setCameraEnabled(false);syncButtons();}return;
    }
    if(meeting?.state!=='connected'){
      try{if(action==='Camera')await toggleCamera();else if(action==='Mic'){if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}else{micStream=await navigator.mediaDevices.getUserMedia({audio:micDevice?{deviceId:{exact:micDevice}}:true,video:false});if(disposed){micStream.getTracks().forEach(t=>t.stop());return;}}status(micStream?'Mic đã bật để chuẩn bị; chưa phát vào phòng.':'Đã tắt mic.');syncButtons();listDevices();}}catch{status('Không mở được mic. Kiểm tra quyền thiết bị.');}return;
    }
    try{if(action==='Mic')await meeting.localParticipant.setMicrophoneEnabled(!meeting.localParticipant.isMicrophoneEnabled);else if(action==='Camera')await meeting.localParticipant.setCameraEnabled(!meeting.localParticipant.isCameraEnabled);else if(action==='Chia sẻ màn hình')await meeting.localParticipant.setScreenShareEnabled(!meeting.localParticipant.isScreenShareEnabled);}catch(error){status(error.message);}
  },{signal:controls.signal});
  // Display the camera frame immediately; capture still requires user permission.
  if(staff&&navigator.permissions)navigator.permissions.query({name:'camera'}).then(p=>{if(!disposed&&p.state==='granted')camera();}).catch(()=>{});
  syncButtons();
  const dispose=()=>{disposed=true;reactionCss.remove();clearInterval(meterTimer);meterSource?.disconnect();meterContext?.close().catch(()=>{});meter.remove();cameraWanted=false;controls.abort();clearInterval(cameraMonitor);clearInterval(timer);clearInterval(sessionTimer);micStream?.getTracks().forEach(t=>t.stop());preview?.getTracks().forEach(t=>t.stop());meeting?.localParticipant.trackPublications.forEach(p=>p.track?.stop());meeting?.disconnect();sessionPanel.remove();hands.remove();meetingStyle.remove();};
  dispose.sendChat=async text=>{const data=await sendEvent('chat',{text});receiveChat(data,meeting.localParticipant);};
  dispose.sendImage=async src=>{
    if(meeting?.state!=='connected')throw Error('Hãy tham gia phòng trước khi gửi ảnh.');
    if(src.length>800000)throw Error('Ảnh quá lớn để gửi trực tiếp.');const id=crypto.randomUUID(),total=Math.ceil(src.length/10000);
    for(let index=0;index<total;index++)await sendEvent('image-chunk',{id,index,total,chunk:src.slice(index*10000,(index+1)*10000)});
    onChat({text:'',image:src,name:meeting.localParticipant.name||'Bạn',mine:true});
  };
  dispose.sendFile=async file=>{
    if(meeting?.state!=='connected')throw Error('Hãy tham gia phòng trước khi gửi tệp.');
    if(file.size>10*1024*1024)throw Error('Tệp tối đa 10 MB.');
    const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Không đọc được tệp.'));reader.readAsDataURL(new Blob([file],{type:'application/octet-stream'}));});
    const id=crypto.randomUUID(),total=Math.ceil(src.length/10000);
    for(let index=0;index<total;index++)await sendEvent('file-chunk',{id,index,total,name:file.name.slice(0,255),chunk:src.slice(index*10000,(index+1)*10000)});
    onChat({text:'',file:{src,name:file.name},name:meeting.localParticipant.name||'Bạn',mine:true});
  };
  dispose.setHand=async raised=>{if(meeting?.state!=='connected')throw Error('Hãy tham gia phòng trước khi giơ tay.');await meeting.localParticipant.setAttributes({'classroom.hand':String(raised)});updateHands();};
  dispose.react=async emoji=>{if(!emojis.includes(emoji))return;await sendEvent('reaction',{emoji});showReaction(emoji,meeting.localParticipant);};
  return dispose;
}
