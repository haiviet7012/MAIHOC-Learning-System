import { loadSchoolReport, sendReportPdf } from '../school-reports.js';
import { randomUUID } from 'node:crypto';
import { membership, classPermission, homeroomPermission, integer, text, fail, audit } from './policy.js';
import { enqueueSchoolNotice } from '../school-notifications.js';
const query = async (db,sql,args=[]) => (await db.query(sql,args)).rows;
export function gradeSummary(items) {
 const groups = new Map();
 for (const row of items) {
   const p=row.payload,key=JSON.stringify([String(row.student_id),p.subject,p.term]);
   const g=groups.get(key)||{studentId:row.student_id,subject:p.subject,term:p.term,sum:0,weight:0,count:0};
   g.sum+=p.score*p.weight;g.weight+=p.weight;g.count++;groups.set(key,g);
 }
 return [...groups.values()].map(g=>{const average=Math.round(g.sum/g.weight*100)/100;return {studentId:g.studentId,subject:g.subject,term:g.term,count:g.count,average,classification:average>=8?'Tốt':average>=6.5?'Khá':average>=5?'Đạt':'Cần cố gắng'};});
}
export function installManagement(router,{db}) {
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function scope(req,write=false) {
   const sid=integer(req.params.schoolId,'Trường'),member=await membership(db,req.user,sid);
   const raw=write?req.body.classId:req.query.classId;
   const cid=raw?integer(raw,'Lớp'):null;
   if(cid) {
     if(!(await query(db,'SELECT id FROM classes WHERE school_id=$1 AND id=$2',[sid,cid])).length) fail('Không tìm thấy lớp.',404);
     await classPermission(db,req.user,sid,cid,{teach:write});
   } else if(write&&member.role!=='school_admin') fail('Chỉ quản trị trường được đăng toàn trường.',403);
   return {sid,cid,member};
 }
 router.get('/schools/:schoolId/management/reports',wrap(async(req,res)=>{
   const {sid,cid,member}=await scope(req);
   if(!cid||member.role==='student') fail('Chỉ giáo viên/quản trị được xem báo cáo lớp.',403);
   const studentId=req.query.studentId?integer(req.query.studentId,'Học sinh'):null;
   const includeAttendance=member.role==='school_admin'||(await query(db,"SELECT id FROM teacher_course_assignments WHERE school_id=$1 AND class_id=$2 AND teacher_id=$3 AND kind='homeroom'",[sid,cid,req.user.id])).length>0;
   const report=await loadSchoolReport(db,{schoolId:sid,classId:cid,studentId,includeAttendance});
   if(req.query.format==='pdf') return sendReportPdf(res,report);
   res.json(report);
 }));
 router.get('/schools/:schoolId/management',wrap(async(req,res)=>{
   const {sid,cid,member}=await scope(req);
   if(!cid&&member.role!=='school_admin') fail('Hãy chọn lớp.',400);
   const students=cid?await query(db,"SELECT u.id,u.name FROM student_enrollments e JOIN users u ON u.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.status='active' ORDER BY u.name",[sid,cid]):[];
   const canAttendance=member.role==='school_admin'||cid&&(await query(db,"SELECT id FROM teacher_course_assignments WHERE school_id=$1 AND class_id=$2 AND teacher_id=$3 AND kind='homeroom'",[sid,cid,req.user.id])).length>0;
   const items=await query(db,`SELECT * FROM school_management_records WHERE school_id=$1 AND (class_id=$2 OR class_id IS NULL) AND ($3::boolean OR kind IN ('board','event') OR student_id=$4) ORDER BY created_at DESC LIMIT 1000`,[sid,cid,member.role!=='student',req.user.id]);
   // Parent links are visible only to administrators, not classmates or subject teachers.
   const guardians=member.role==='school_admin'?await query(db,'SELECT g.*,u.name,u.email FROM school_guardians g JOIN users u ON u.id=g.guardian_id WHERE g.school_id=$1',[sid]):[];
   const gradeRows=await query(db,`SELECT student_id,payload FROM school_management_records WHERE school_id=$1 AND class_id=$2 AND kind='grade' AND ($3::boolean OR student_id=$4)`,[sid,cid,member.role!=='student',req.user.id]);
   res.json({items:canAttendance?items:items.filter(r=>r.kind!=='attendance'),students:member.role==='student'?students.filter(s=>String(s.id)===String(req.user.id)):students,guardians,summaries:gradeSummary(gradeRows),staff:member.role!=='student',admin:member.role==='school_admin'});
 }));
 router.post('/schools/:schoolId/management/guardians',wrap(async(req,res)=>{
   const {sid,cid,member}=await scope(req,true);
   if(member.role!=='school_admin'||!cid) fail('Chỉ quản trị trường được liên kết phụ huynh trong lớp.',403);
   const studentId=integer(req.body.studentId,'Học sinh');
   if(!(await query(db,"SELECT id FROM student_enrollments WHERE school_id=$1 AND class_id=$2 AND student_id=$3 AND status='active'",[sid,cid,studentId])).length) fail('Học sinh không thuộc lớp.');
   const guardian=(await query(db,'SELECT id FROM users WHERE lower(email)=lower($1)',[text(req.body.email,'Email',254)]))[0];
   if(!guardian||String(guardian.id)===String(studentId)) fail('Cần tài khoản phụ huynh riêng đã đăng ký.');
   await db.transaction(async()=>{
     await db.query('INSERT INTO school_guardians(school_id,student_id,guardian_id,auto_notify) VALUES($1,$2,$3,$4) ON CONFLICT(school_id,student_id,guardian_id) DO UPDATE SET auto_notify=excluded.auto_notify',[sid,studentId,guardian.id,req.body.autoNotify===true]);
     await audit(db,req.user,sid,'link','guardian',guardian.id,{studentId});
   })();res.json({ok:true});
 }));
 router.post('/schools/:schoolId/management/:kind',wrap(async(req,res)=>{
   const {sid,cid}=await scope(req,true),kind=req.params.kind,b=req.body;
   if(!['message','board','event','grade','attendance'].includes(kind)) fail('Mục không hợp lệ.');
   const studentId=['message','grade','attendance'].includes(kind)?integer(b.studentId,'Học sinh'):null;
   if(kind==='attendance')await homeroomPermission(db,req.user,sid,cid);
   if(studentId&&(!cid||!(await query(db,"SELECT id FROM student_enrollments WHERE school_id=$1 AND class_id=$2 AND student_id=$3 AND status='active'",[sid,cid,studentId])).length)) fail('Học sinh không thuộc lớp.');
   let p={title:text(b.title,'Tiêu đề',200)},key=randomUUID();
   if(kind==='grade') {
     const score=Number(b.score),weight=Number(b.weight);
     if(b.score===''||!Number.isFinite(score)||score<0||score>10||!Number.isFinite(weight)||weight<=0||weight>10) fail('Điểm phải từ 0–10, hệ số lớn hơn 0 và tối đa 10.');
     p={...p,subject:text(b.subject,'Môn học',100),term:text(b.term,'Học kỳ',100),score,weight};
     if(!/^\d{4}\.[12]$/.test(p.term)) fail('Học kỳ phải có định dạng năm.kỳ, ví dụ 2025.1.');
     await classPermission(db,req.user,sid,cid,{teach:true,subject:p.subject});
     key=JSON.stringify([cid,studentId,p.subject,p.term,p.title]);
   } else if(kind==='attendance') {
     if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date) fail('Ngày không hợp lệ.');
     if(!['present','late','excused','unexcused'].includes(b.status)) fail('Trạng thái không hợp lệ.');
     p={...p,date:b.date,session:text(b.session,'Buổi',80),status:b.status};key=JSON.stringify([cid,studentId,p.date,p.session]);
   } else {
     p={...p,body:text(b.body,'Nội dung',10000)};
     if(kind==='message'&&!['learning','behavior','fee'].includes(b.category)) fail('Loại thông báo không hợp lệ.');
     if(kind==='message') p.category=b.category;
     if(kind==='event') {
       const start=new Date(b.start),end=new Date(b.end);
       if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start) fail('Lịch phải có thời gian kết thúc sau bắt đầu.');
       p.start=start.toISOString();p.end=end.toISOString();
     }
     if(kind==='board'&&b.mediaUrl) {
       let url;try{url=new URL(b.mediaUrl);}catch{fail('Liên kết ảnh/video không hợp lệ.');}
       if(url.protocol!=='https:'||url.username||url.password) fail('Ảnh/video cần liên kết HTTPS.');
       if(!['image','video'].includes(b.mediaType)) fail('Loại tệp không hợp lệ.');
       p.mediaUrl=url.href;p.mediaType=b.mediaType;
     }
   }
   const saved=await db.transaction(async()=>{
     const row=(await query(db,`INSERT INTO school_management_records(id,school_id,class_id,kind,student_id,record_key,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(school_id,kind,record_key) DO UPDATE SET payload=excluded.payload,created_by=excluded.created_by,created_at=now() RETURNING *`,[randomUUID(),sid,cid,kind,studentId,key,JSON.stringify(p),req.user.id]))[0];
     await audit(db,req.user,sid,'save','management',row.id,{kind});
     if(studentId&&['message','grade','attendance'].includes(kind)) {
       const parents=await query(db,`SELECT guardian_id FROM school_guardians WHERE school_id=$1 AND student_id=$2 ${kind==='message'?'':'AND auto_notify=true'}`,[sid,studentId]);
       if(kind==='message'&&!parents.length) fail('Chưa liên kết tài khoản phụ huynh cho học sinh này.');
       const student=(await query(db,'SELECT name FROM users WHERE id=$1',[studentId]))[0];
       await enqueueSchoolNotice(db,{eventKey:`management:${row.id}:${randomUUID()}`,userIds:parents.map(g=>g.guardian_id),title:p.title,message:`Học sinh: ${student.name}\n${p.body|| (kind==='grade'?`${p.subject} · ${p.term}: ${p.score}/10 (hệ số ${p.weight})`:`${p.date} · ${p.session}: ${{present:'Có mặt',late:'Đi muộn',excused:'Nghỉ có phép',unexcused:'Nghỉ không phép'}[p.status]}`)}`,link:'/school'});
     }
     return row;
   })();res.status(201).json(saved);
 }));
}
