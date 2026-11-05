import { isSuperAdminUser, isTeacherUser } from './auth.js';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
export async function closeEmptyClassrooms(db,live,now=Date.now()){
  const meetings=await db.prepare('SELECT id,empty_since FROM classroom_meetings WHERE closed=false').all();
  for(const meeting of meetings){
    const name=`maihoc-session-${meeting.id}`;let people;
    try{people=await live.listParticipants(name);}catch(error){if(error.code===5||error.status===404)people=[];else continue;}
    if(people.some(person=>!person.permission?.hidden)){
      await db.prepare('UPDATE classroom_meetings SET empty_since=NULL WHERE id=? AND closed=false').run(meeting.id);continue;
    }
    if(meeting.empty_since==null){await db.prepare('UPDATE classroom_meetings SET empty_since=? WHERE id=? AND closed=false AND empty_since IS NULL').run(now,meeting.id);continue;}
    if(now-Number(meeting.empty_since)<600000)continue;
    // Recheck immediately before deletion; an unavailable service never counts as empty.
    try{const current=await live.listParticipants(name);if(current.some(p=>!p.permission?.hidden)){await db.prepare('UPDATE classroom_meetings SET empty_since=NULL WHERE id=?').run(meeting.id);continue;}}catch(error){if(error.code!==5&&error.status!==404)continue;}
    try{await live.deleteRoom(name);}catch(error){if(error.code!==5&&error.status!==404)continue;}
    await db.prepare('UPDATE classroom_meetings SET closed=true WHERE id=? AND closed=false').run(meeting.id);
  }
}
const classes = new Set([
  ...Array.from({length:10},(_,i)=>`10A${i+1}`),
  ...[11,12].flatMap(g=>Array.from({length:9},(_,i)=>`${g}${g===11?'B':'C'}${i+1}`)),
  ...[10,11,12].flatMap(g=>Array.from({length:10},(_,i)=>`${g}LC${i+1}`)),
  ...[10,11,12].flatMap(g=>['A00','A01','B00','C00','D01','D07'].map(b=>`${g}${b}`)),
]);
export function installClassroomAccess(app,{db,requireAuth,requireSameOrigin,notifyAdmins,notifyUser,roomService}){
  let ready;
  let sweepBusy=false;
  const sweepTimer=setInterval(async()=>{if(sweepBusy)return;sweepBusy=true;try{await ensure();await closeEmptyClassrooms(db,service());}catch{/* Retry next minute without interpreting configuration/network errors as empty. */}finally{sweepBusy=false;}},60000);
  sweepTimer.unref?.();
  const ensure=()=>ready ||= db.exec(`CREATE TABLE IF NOT EXISTS classroom_media_requests(id TEXT PRIMARY KEY,meeting_id TEXT NOT NULL,kind TEXT NOT NULL,created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS classroom_meetings(id TEXT PRIMARY KEY,class_code TEXT NOT NULL,owner_id BIGINT NOT NULL REFERENCES users(id),closed BOOLEAN NOT NULL DEFAULT false);
  CREATE UNIQUE INDEX IF NOT EXISTS classroom_one_open_meeting ON classroom_meetings(class_code) WHERE closed=false;
  ALTER TABLE classroom_meetings ADD COLUMN IF NOT EXISTS empty_since BIGINT;
  CREATE TABLE IF NOT EXISTS classroom_waiting(meeting_id TEXT REFERENCES classroom_meetings(id),student_id BIGINT REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(meeting_id,student_id));
  CREATE TABLE IF NOT EXISTS classroom_live_sessions(class_code TEXT PRIMARY KEY,owner_id BIGINT REFERENCES users(id),expires_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS classroom_join_requests (
    student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by BIGINT REFERENCES users(id), PRIMARY KEY(student_id,class_code)
  )`).catch(error=>{ready=null;throw error;});
  const staff=user=>isSuperAdminUser(user)||isTeacherUser(user);
  const service=()=>{
    if(roomService)return roomService;
    const url=process.env.LIVEKIT_URL?.trim();
    if(!url?.startsWith('wss://')||!process.env.LIVEKIT_API_KEY||!process.env.LIVEKIT_API_SECRET)throw Object.assign(Error('Chưa cấu hình LiveKit hợp lệ.'),{status:503});
    return new RoomServiceClient(url.replace('wss:','https:'),process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{requestTimeout:10000});
  };
  const allowed=async(user,code)=>{
    if(!classes.has(code))return false;
    // Classroom sessions are open to every authenticated school account.
    // Keep the join-request tables for backwards compatibility and admin review,
    // but do not block direct entry or force the teacher to open the room first.
    return true;
  };
  const active=code=>db.prepare('SELECT * FROM classroom_meetings WHERE class_code=? AND closed=false').get(code);
  const host=user=>staff(user);
  const missingRoom=error=>error?.code===5||error?.status===404;
  const ensureOpenMeeting=async(code,user)=>{
    let meeting=await active(code),created=false;
    if(!meeting){
      const id=randomUUID();
      await db.prepare('INSERT INTO classroom_meetings(id,class_code,owner_id) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(id,code,user.id);
      meeting=await active(code);created=meeting?.id===id;
    }
    const liveService=service(),name=`maihoc-session-${meeting.id}`;
    try{
      if(created)await liveService.createRoom({name,maxParticipants:50,emptyTimeout:600});
      else await liveService.listParticipants(name);
    }catch(error){
      if(!created&&missingRoom(error))await liveService.createRoom({name,maxParticipants:50,emptyTimeout:600});
      else{if(created)await db.prepare('UPDATE classroom_meetings SET closed=true WHERE id=?').run(meeting.id);throw error;}
    }
    await db.prepare('UPDATE classroom_meetings SET empty_since=COALESCE(empty_since,?) WHERE id=?').run(Date.now(),meeting.id);
    return meeting;
  };
  const wrap=fn=>async(req,res,next)=>{try{await ensure();await fn(req,res);}catch(error){res.status(error.status||502).json({error:error.status?error.message:'Không thực hiện được thao tác phòng học. Hãy thử lại.'});}};
  // All current and future classroom endpoints pass through this role boundary.
  app.use('/api/classroom-access',requireAuth,async(req,res,next)=>{
    try{
      await ensure();res.set('Cache-Control','private, no-store');
      const role=isSuperAdminUser(req.user)?'admin':isTeacherUser(req.user)?'teacher':req.user.role==='user'?'student':null;
      if(!role)return res.status(403).json({error:'Vai trò không được phép sử dụng phòng học.'});
      req.classroomRole=role;
      if(!['GET','HEAD','OPTIONS'].includes(req.method)){
        let passed=false;requireSameOrigin(req,res,()=>{passed=true;});if(!passed)return;
      }
      if(req.path==='/review'&&role!=='admin')return res.status(403).json({error:'Chỉ admin được kiểm duyệt lớp.'});
      if(req.path.startsWith('/admin/')&&role!=='admin')return res.status(403).json({error:'Chỉ admin được giám sát phòng.'});
      if(req.path==='/request'&&role!=='student')return res.status(403).json({error:'Chỉ học sinh được gửi yêu cầu tham gia lớp.'});
      const match=req.path.match(/^\/rooms\/([^/]+)(?:\/([^/]+))?$/);
      if(match){
        const code=decodeURIComponent(match[1]),action=match[2];
        if(!classes.has(code))return res.status(404).json({error:'Lớp không tồn tại.'});
        if(!await allowed(req.user,code))return res.status(403).json({error:'Bạn chưa được phân công hoặc duyệt vào lớp này.'});
        if(['open','admit','close','media-request'].includes(action)&&role==='student')return res.status(403).json({error:'Học sinh không có quyền quản lý buổi học.'});
        if(['admit','close','media-request'].includes(action)){
          const meeting=await active(code);if(!meeting||!host(req.user,meeting))return res.status(403).json({error:'Chỉ chủ phòng hoặc admin được quản lý buổi học.'});
        }
      }
      next();
    }catch(error){next(error);}
  });
  app.get('/api/classroom-access/admin/rooms',wrap(async(req,res)=>{
    const rooms=await db.prepare('SELECT m.id,m.class_code,m.owner_id,u.name AS teacher_name FROM classroom_meetings m JOIN users u ON u.id=m.owner_id WHERE m.closed=false').all();
    res.json({rooms});
  }));
  app.post('/api/classroom-access/rooms/:code/open',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    if(!staff(req.user)||!classes.has(req.params.code))return res.status(403).json({error:'Chỉ giáo viên hoặc admin được mở buổi học.'});
    const liveService=service();
    let meeting=await active(req.params.code);
    if(!meeting){const id=randomUUID();await db.prepare('INSERT INTO classroom_meetings(id,class_code,owner_id) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(id,req.params.code,req.user.id);meeting=await active(req.params.code);}
    try{await liveService.createRoom({name:`maihoc-session-${meeting.id}`,maxParticipants:50,emptyTimeout:600});await db.prepare('UPDATE classroom_meetings SET empty_since=COALESCE(empty_since,?) WHERE id=?').run(Date.now(),meeting.id);}catch(error){await db.prepare('UPDATE classroom_meetings SET closed=true WHERE id=?').run(meeting.id);throw error;}
    res.json({ok:true,meetingId:meeting.id});
  }));
  app.get('/api/classroom-access/rooms/:code/session',requireAuth,wrap(async(req,res)=>{
    if(!await allowed(req.user,req.params.code))return res.status(403).json({error:'Bạn chưa được duyệt vào lớp.'});
    const meeting=await ensureOpenMeeting(req.params.code,req.user);
    const isHost=host(req.user,meeting);
    const mediaRequest=!staff(req.user)?await db.prepare('SELECT id,kind FROM classroom_media_requests WHERE meeting_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1').get(meeting.id,Date.now()-30000):null;
    res.json({open:true,meetingId:meeting.id,host:isHost,admission:'approved',waiting:[],mediaRequest});
  }));
  app.post('/api/classroom-access/rooms/:code/media-request',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    const meeting=await active(req.params.code);if(!meeting||!staff(req.user)||!host(req.user,meeting))return res.status(403).json({error:'Chỉ giáo viên chủ phòng được yêu cầu thiết bị.'});
    if(!['mic','camera'].includes(req.body.kind))return res.status(400).json({error:'Thiết bị không hợp lệ.'});
    await db.prepare('INSERT INTO classroom_media_requests(id,meeting_id,kind,created_at) VALUES(?,?,?,?)').run(randomUUID(),meeting.id,req.body.kind,Date.now());res.json({ok:true});
  }));
  app.post('/api/classroom-access/rooms/:code/media-accept',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    const meeting=await active(req.params.code);if(!meeting||!await allowed(req.user,req.params.code))return res.status(403).json({error:'Không có quyền.'});
    const admission=await db.prepare("SELECT status FROM classroom_waiting WHERE meeting_id=? AND student_id=?").get(meeting.id,req.user.id);
    const request=await db.prepare('SELECT kind FROM classroom_media_requests WHERE id=? AND meeting_id=? AND created_at>?').get(req.body.requestId,meeting.id,Date.now()-30000);
    if(admission?.status!=='approved'||!request)return res.status(403).json({error:'Yêu cầu không còn hiệu lực.'});
    if(request.kind==='camera')await service().updateParticipant(`maihoc-session-${meeting.id}`,String(req.user.id),undefined,{canPublish:true,canSubscribe:true,canPublishData:true,canPublishSources:[TrackSource.MICROPHONE,TrackSource.CAMERA]});
    res.json({ok:true,kind:request.kind});
  }));
  app.post('/api/classroom-access/rooms/:code/wait',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    if(!await allowed(req.user,req.params.code))return res.status(403).json({error:'Bạn chưa được duyệt vào lớp.'});
    const meeting=await active(req.params.code);if(!meeting)return res.status(409).json({error:'Giáo viên chưa mở phòng.'});
    await db.prepare("INSERT INTO classroom_waiting(meeting_id,student_id) VALUES(?,?) ON CONFLICT DO NOTHING").run(meeting.id,req.user.id);res.json({ok:true});
  }));
  app.post('/api/classroom-access/rooms/:code/admit',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    const meeting=await active(req.params.code);if(!meeting||!host(req.user,meeting))return res.status(403).json({error:'Chỉ chủ phòng hoặc admin được duyệt.'});
    if(req.body.meetingId!==meeting.id)return res.status(409).json({error:'Buổi học đã thay đổi.'});
    if(!['approved','rejected'].includes(req.body.decision))return res.status(400).json({error:'Quyết định không hợp lệ.'});
    if(req.body.decision==='approved'&&!await allowed({id:req.body.studentId},req.params.code))return res.status(403).json({error:'Học sinh không còn quyền vào lớp.'});
    await db.prepare("UPDATE classroom_waiting SET status=? WHERE meeting_id=? AND student_id=? AND status='pending'").run(req.body.decision,meeting.id,req.body.studentId);res.json({ok:true});
  }));
  app.post('/api/classroom-access/rooms/:code/close',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    const meeting=await active(req.params.code);if(!meeting||!host(req.user,meeting))return res.status(403).json({error:'Chỉ chủ phòng hoặc admin được đóng phòng.'});
    await db.prepare('UPDATE classroom_meetings SET closed=true WHERE id=?').run(meeting.id);
    try{await service().deleteRoom(`maihoc-session-${meeting.id}`);}catch(error){if(error.code!==5&&error.status!==404){await db.prepare('UPDATE classroom_meetings SET closed=false WHERE id=?').run(meeting.id);throw error;}}
    await db.prepare('DELETE FROM classroom_live_sessions WHERE class_code=?').run(req.params.code);res.json({ok:true});
  }));
  app.get('/api/classroom-access',requireAuth,async(req,res,next)=>{try{
    await ensure();
    const mine=await db.prepare('SELECT class_code,status FROM classroom_join_requests WHERE student_id=?').all(req.user.id);
    const pending=isSuperAdminUser(req.user)?await db.prepare("SELECT r.student_id,r.class_code,u.name,u.email FROM classroom_join_requests r JOIN users u ON u.id=r.student_id WHERE r.status='pending'").all():[];
    const allRooms=await db.prepare('SELECT id,class_code,owner_id FROM classroom_meetings WHERE closed=false').all();
    const visibleRooms=[];for(const room of allRooms)if(await allowed(req.user,room.class_code))visibleRooms.push(room);
    const liveService=['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'].every(k=>Boolean(process.env[k]?.trim()))?service():null;
    const rooms=await Promise.all(visibleRooms.map(async room=>{
      let participantCount=0;
      if(liveService)try{participantCount=(await liveService.listParticipants(`maihoc-session-${room.id}`)).filter(person=>!person.permission?.hidden).length;}catch(error){if(!missingRoom(error))participantCount=0;}
      return {class_code:room.class_code,owner_id:room.owner_id,participant_count:participantCount};
    }));
    res.json({staff:staff(req.user),admin:isSuperAdminUser(req.user),mine,pending,rooms,videoConfigured:['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'].every(k=>Boolean(process.env[k]?.trim()))});
  }catch(error){next(error);}});
  app.post('/api/classroom-access/request',requireSameOrigin,requireAuth,async(req,res,next)=>{try{
    await ensure();const code=String(req.body.classCode||'');
    if(staff(req.user)||!classes.has(code))return res.status(400).json({error:'Lớp hoặc tài khoản không hợp lệ.'});
    const result=await db.prepare("INSERT INTO classroom_join_requests(student_id,class_code) VALUES(?,?) ON CONFLICT(student_id,class_code) DO UPDATE SET status='pending',reviewed_by=NULL WHERE classroom_join_requests.status='rejected' RETURNING class_code").all(req.user.id,code);
    if(result.length)await notifyAdmins('classroom_join_request','Yêu cầu tham gia phòng học',`${req.user.name} yêu cầu tham gia ${code}.`,'/school/rooms');
    res.json({ok:true});
  }catch(error){next(error);}});
  app.post('/api/classroom-access/review',requireSameOrigin,requireAuth,async(req,res,next)=>{try{
    if(!isSuperAdminUser(req.user))return res.status(403).json({error:'Chỉ admin được kiểm duyệt.'});
    await ensure();const {studentId,classCode,decision}=req.body;
    if(!['approved','rejected'].includes(decision))return res.status(400).json({error:'Quyết định không hợp lệ.'});
    const result=await db.prepare("UPDATE classroom_join_requests SET status=?,reviewed_by=? WHERE student_id=? AND class_code=? AND status='pending' RETURNING class_code").all(decision,req.user.id,studentId,classCode);
    if(!result.length)return res.status(409).json({error:'Yêu cầu đã được xử lý.'});
    await notifyUser(studentId,'classroom_join_review',decision==='approved'?'Đã duyệt tham gia lớp':'Yêu cầu chưa được duyệt',`Lớp ${classCode}`,'/school/rooms');res.json({ok:true});
  }catch(error){next(error);}});
  app.get('/api/classroom-access/rooms/:code',requireAuth,async(req,res,next)=>{try{
    await ensure();if(!classes.has(req.params.code))return res.status(404).json({error:'Không tìm thấy lớp.'});
    res.json({ok:true});
  }catch(error){next(error);}});
  app.post('/api/classroom-access/rooms/:code/connect',requireSameOrigin,requireAuth,async(req,res,next)=>{try{
    await ensure();const code=req.params.code;
    if(!classes.has(code))return res.status(404).json({error:'Không tìm thấy lớp.'});
    if(!['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'].every(k=>process.env[k]?.trim()))return res.status(503).json({error:'Chưa cấu hình LiveKit trên máy chủ.'});
    const url=process.env.LIVEKIT_URL.trim();if(!url.startsWith('wss://'))return res.status(503).json({error:'LiveKit cần URL wss:// hợp lệ.'});
    const liveService=service();
    const meeting=await ensureOpenMeeting(code,req.user);
    const name=`maihoc-session-${meeting.id}`;
    const existing=await liveService.listParticipants(name).catch(error=>{if(error.code===5||error.status===404)return [];throw error;});
    if(existing.some(p=>p.identity===String(req.user.id))&&!req.body.takeover)return res.status(409).json({error:'Tài khoản đang ở phòng trên thiết bị khác.',takeover:true});
    if(req.body.takeover&&existing.some(p=>p.identity===String(req.user.id)))await liveService.removeParticipant(name,String(req.user.id));
    const token=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{identity:String(req.user.id),name:req.user.name,ttl:'2m'});
    token.addGrant({roomJoin:true,room:name,canPublish:true,canSubscribe:true,canPublishData:true,canUpdateOwnMetadata:true,canPublishSources:[TrackSource.MICROPHONE,TrackSource.CAMERA,TrackSource.SCREEN_SHARE]});
    await db.prepare('INSERT INTO classroom_live_sessions(class_code,owner_id,expires_at) VALUES(?,?,?) ON CONFLICT(class_code) DO UPDATE SET expires_at=EXCLUDED.expires_at').run(code,req.user.id,Date.now()+60000);
    const stillOpen=await active(code);if(stillOpen?.id!==meeting.id)return res.status(409).json({error:'Buổi học đã kết thúc.'});
    res.set('Cache-Control','private, no-store');res.json({url,token:await token.toJwt(),meetingId:meeting.id});
  }catch(error){next(error);}});
  app.post('/api/classroom-access/rooms/:code/heartbeat',requireSameOrigin,requireAuth,async(req,res,next)=>{try{
    await ensure();const code=req.params.code;
    await db.prepare('UPDATE classroom_live_sessions SET expires_at=? WHERE class_code=?').run(Date.now()+60000,code);res.json({ok:true});
  }catch(error){next(error);}});
}
