import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { gradeSummary } from './platform/management.js';
export function aggregateReport(records,students) {
 const attendance={present:0,late:0,excused:0,unexcused:0};
 const daily=new Map();
 for(const r of records){const p=r.payload;if(r.kind==='attendance'&&Object.hasOwn(attendance,p.status))attendance[p.status]++;
 if(r.kind==='grade'){const day=new Date(r.created_at).toISOString().slice(0,10);const key=JSON.stringify([day,p.subject,p.term]);const g=daily.get(key)||{date:day,subject:p.subject,term:p.term,rows:[]};g.rows.push(r);daily.set(key,g);}}
 const count=Object.values(attendance).reduce((a,b)=>a+b,0);
 const trend=[...daily.values()].map(g=>{const summaries=gradeSummary(g.rows);return {date:g.date,subject:g.subject,term:g.term,average:Math.round(summaries.reduce((s,r)=>s+r.average,0)/summaries.length*100)/100,sampleSize:summaries.length};}).sort((a,b)=>a.date.localeCompare(b.date));
 return {students,records,attendance,attendanceCount:count,attendanceRate:count?Math.round((attendance.present+attendance.late)/count*10000)/100:null,trend,summaries:gradeSummary(records.filter(r=>r.kind==='grade'))};
}
export async function loadSchoolReport(db,{schoolId,classId,studentId,legacyCode}) {
 const students=legacyCode?(await db.query('SELECT u.id,u.name FROM school_class_members m JOIN users u ON u.id=m.user_id WHERE m.class_code=$1 ORDER BY u.name',[legacyCode])).rows:(await db.query("SELECT u.id,u.name FROM student_enrollments e JOIN users u ON u.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.status='active' ORDER BY u.name",[schoolId,classId])).rows;
 if(studentId&&!students.some(s=>String(s.id)===String(studentId)))throw Object.assign(new Error('Học sinh không thuộc lớp.'),{status:404});
 let mapping=schoolId?{school_id:schoolId,class_id:classId}:(await db.query('SELECT school_id,class_id FROM legacy_class_mappings WHERE class_code=$1',[legacyCode])).rows[0];
 const selected=studentId?students.filter(s=>String(s.id)===String(studentId)):students;
 const ids=selected.map(s=>s.id);
 const records=mapping&&ids.length?(await db.query("SELECT kind,student_id,payload,created_at FROM school_management_records WHERE school_id=$1 AND class_id=$2 AND student_id=ANY($3::bigint[]) AND kind IN ('grade','attendance') ORDER BY created_at",[mapping.school_id,mapping.class_id,ids])).rows:[];
 const activities=ids.length?(await db.query('SELECT user_id AS student_id,item_title,subject,status,progress_percent,score,updated_at FROM user_progress WHERE user_id=ANY($1::bigint[]) ORDER BY updated_at',[ids])).rows:[];
 return {...aggregateReport(records,selected),activities,className:legacyCode||String(classId),generatedAt:new Date().toISOString(),note:'Chuyên cần = (có mặt + đi muộn) / số lượt đã điểm danh. Biểu đồ điểm theo ngày nhập/cập nhật, môn và học kỳ; mỗi học sinh có trọng số bằng nhau. Hoạt động là tiến độ hiện tại của tài khoản, không phải lịch sử điểm theo thời gian.'};
}
export async function sendReportPdf(res,report) {
 const doc=new PDFDocument({size:'A4',margin:40});const chunks=[];doc.on('data',c=>chunks.push(c));
 const done=new Promise((resolve,reject)=>{doc.on('end',resolve);doc.on('error',reject);});
 doc.font(fileURLToPath(new URL('./assets/DejaVuSans.ttf',import.meta.url)));
 doc.fontSize(18).text('MAIHOC · BÁO CÁO HỌC TẬP');doc.moveDown().fontSize(10).text(`Lớp: ${report.className} · ${report.generatedAt}`);
 doc.text(report.note);doc.moveDown().text(`Chuyên cần: ${report.attendanceRate==null?'Chưa có dữ liệu':report.attendanceRate+'%'} · ${report.attendanceCount} lượt điểm danh`);
 const names=new Map(report.students.map(s=>[String(s.id),s.name]));
 for(const s of report.summaries){doc.moveDown(.4).text(`${names.get(String(s.studentId))} · ${s.subject} · ${s.term}: ${s.average}/10 (${s.count} cột điểm)`);}
 doc.moveDown().fontSize(13).text('CHI TIẾT ĐIỂM VÀ CHUYÊN CẦN');doc.fontSize(9);
 for(const r of report.records){const p=r.payload;doc.moveDown(.3).text(`${names.get(String(r.student_id))} · ${r.kind==='grade'?`${p.subject} · ${p.term} · ${p.title}: ${p.score}/10 · hệ số ${p.weight}`:`${p.date} · ${p.session}: ${{present:'Có mặt',late:'Đi muộn',excused:'Nghỉ có phép',unexcused:'Nghỉ không phép'}[p.status]}`}`);}
 doc.moveDown().fontSize(13).text('HOẠT ĐỘNG HỌC TẬP HIỆN TẠI');doc.fontSize(9);
 for(const a of report.activities)doc.moveDown(.3).text(`${names.get(String(a.student_id))} · ${a.item_title||'Hoạt động'} · ${a.subject||''} · ${a.status||''} · tiến độ ${a.progress_percent??'—'}% · điểm gốc ${a.score??'—'}`);
 doc.end();await done;res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="maihoc-report.pdf"');res.send(Buffer.concat(chunks));
}
export function installLegacyReports(app,{db,requireAuth,requireSameOrigin,canAccessClass,isSuperAdminUser,notifyUser}) {
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function authorize(req){const code=String(req.params.classCode).toUpperCase();if(!await canAccessClass(req.user,code)||(!isSuperAdminUser(req.user)&&!await db.prepare('SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1').get(req.user.id,code)))throw Object.assign(new Error('Chỉ giáo viên được phân công được xem báo cáo.'),{status:403});return code;}
 app.get('/api/school/classes/:classCode/reports',requireAuth,wrap(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');const code=await authorize(req);const studentId=req.query.studentId?Number(req.query.studentId):null;if(req.query.studentId&&(!Number.isSafeInteger(studentId)||studentId<1))throw Object.assign(new Error('Học sinh không hợp lệ.'),{status:400});const report=await loadSchoolReport(db,{legacyCode:code,studentId});if(req.query.format==='pdf')return sendReportPdf(res,report);res.json(report);}));
 app.post('/api/school/classes/:classCode/students/:studentId/feedback',requireSameOrigin,requireAuth,wrap(async(req,res)=>{const code=await authorize(req),sid=Number(req.params.studentId),message=typeof req.body?.message==='string'?req.body.message.trim():'';if(!Number.isSafeInteger(sid)||!await db.prepare('SELECT user_id FROM school_class_members WHERE class_code=? AND user_id=?').get(code,sid))return res.status(404).json({error:'Học sinh không thuộc lớp.'});if(typeof message!=='string'||!message||message.length>4000)return res.status(400).json({error:'Nhận xét cần từ 1 đến 4000 ký tự.'});await notifyUser(sid,'teacher_feedback',`Nhận xét từ giáo viên ${req.user.name||''}`,`Lớp ${code}: ${message}`,'/school');res.json({ok:true});}));
}
