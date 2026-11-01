import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { testDatabase } from './test-db.js';
import { installTeachingAdvisor } from '../learning-advisor/teaching.js';

test('teaching advisor reads fresh scoped DB data and rejects unauthorized targets', async () => {
  const f = await testDatabase({ memoryOnly: true });
  let server; const prompts = [];
  try {
    await f.db.query(`INSERT INTO users(id,name,email,password_hash,role,admin_level) VALUES
      (710,'Teacher','teacher@fixture.test','x','admin',1),(711,'Student A','a@fixture.test','x','user',0),
      (712,'Student B','b@fixture.test','x','user',0),(713,'Other Class','other@fixture.test','x','user',0)`);
    await f.db.query("INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES('ta',710,'10A1','Toán','subject')");
    await f.db.query("INSERT INTO school_class_members(user_id,class_code) VALUES(711,'10A1'),(712,'10A1'),(713,'10A2')");
    await f.db.query("INSERT INTO user_progress(user_id,item_type,item_id,item_title,subject,progress_percent) VALUES(711,'document','a','Topic A','Toán',40),(712,'document','b','Topic B','Toán',80),(713,'document','private','Other class data','Toán',99)");
    await f.db.query("INSERT INTO exam_attempts(user_id,document_id,title,subject,grade,category,graded,score,scale,answers_json,result_json) VALUES(711,'a','Math','Toán','10','practice',1,7,10,'{}','{}')");
    const app = express(); app.use(express.json());
    installTeachingAdvisor(app, { db: f.db, requireAuth: (req,res,next) => { req.user = req.headers['x-test-student'] ? {id:711,role:'user',adminLevel:0} : {id:710,role:'admin',adminLevel:1}; next(); }, requireSameOrigin: (req,res,next) => req.headers.origin === 'http://fixture.test' ? next() : res.sendStatus(403), generate: async prompt => { prompts.push(prompt); return { inScope:true, reply:'Thiết kế dựa trên tiến trình', tasks: prompt.mode === 'plan' ? [{day:1,title:'Luyện chủ đề',subject:'Toán',minutes:20}] : [] }; } });
    server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
    const base = `http://127.0.0.1:${server.address().port}/api/teaching-advisor`;
    const body = {mode:'plan', classKey:'legacy:10A1', subject:'Toán', message:'Thiết kế lộ trình', minutes:45};
    const post = (data, headers={}) => fetch(base+'/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://fixture.test',...headers},body:JSON.stringify(data)});
    assert.equal((await (await fetch(base+'/classes')).json()).classes.length,1);
    assert.equal((await fetch(base+'/classes',{headers:{'x-test-student':'1'}})).status,403);
    assert.equal((await fetch(base+'/students?classKey=legacy:10A2')).status,403);
    assert.equal((await post({...body,studentId:713})).status,403);
    assert.equal((await post({...body,subject:'Vật lý'})).status,403);
    assert.equal((await post(body,{'x-test-student':'1'})).status,403);
    assert.equal((await post(body,{Origin:'http://other.test'})).status,403);
    const result = await post({...body,studentId:711,context:{progress:[{progress_percent:100}]}}); assert.equal(result.status,200);
    assert.equal(prompts.at(-1).context.progress[0].progress_percent,40);
    assert.equal(prompts.at(-1).context.learning.radar[0].percent,70);
    assert.equal(prompts.at(-1).context.studentCount,1);
    assert.ok(!JSON.stringify(prompts.at(-1)).includes('fixture.test'));
    await f.db.query('UPDATE user_progress SET progress_percent=60 WHERE user_id=711');
    assert.equal((await post(body)).status,200);
    assert.equal(prompts.at(-1).context.studentCount,2);
    assert.equal(prompts.at(-1).context.progress.length,2);
    assert.ok(prompts.at(-1).context.progress.some(p => p.progress_percent===60));
    assert.ok(!JSON.stringify(prompts.at(-1)).includes('Other class data'));
    assert.equal((await post({...body,mode:'lesson'})).status,200);
    assert.equal(prompts.at(-1).audience,'teacher'); assert.equal(prompts.at(-1).context.teachingMode,'lesson');
    assert.equal((await post({...body,mode:'unknown'})).status,400);
    const schoolId = (await f.db.query("INSERT INTO schools(code,name) VALUES('TEACH','School') RETURNING id")).rows[0].id;
    const yearId = (await f.db.query("INSERT INTO academic_years(school_id,code,start_date,end_date) VALUES($1,'2026','2026-01-01','2026-12-31') RETURNING id",[schoolId])).rows[0].id;
    const classId = (await f.db.query("INSERT INTO classes(school_id,academic_year_id,class_code,name,grade_level) VALUES($1,$2,'10A','Class',10) RETURNING id",[schoolId,yearId])).rows[0].id;
    await f.db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,710,'teacher'),($1,711,'student')",[schoolId]);
    await f.db.query("INSERT INTO teacher_course_assignments(school_id,class_id,teacher_id,subject,kind) VALUES($1,$2,710,'Toán','subject')",[schoolId,classId]);
    await f.db.query("INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES($1,$2,$3,711,'fixture',710)",[schoolId,yearId,classId]);
    assert.equal((await post({...body,classKey:`school:${classId}`,studentId:711})).status,200);
    assert.equal(prompts.at(-1).context.progress[0].progress_percent,60);
    assert.equal((await post({...body,classKey:`school:${classId}`,studentId:712})).status,403);
    await f.db.query('DELETE FROM teacher_course_assignments WHERE teacher_id=710');
    assert.equal((await post({...body,classKey:`school:${classId}`})).status,403);

  } finally { if(server) await new Promise(r=>server.close(r)); await f.close(); }
});
