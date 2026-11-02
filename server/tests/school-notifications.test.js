import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import { testDatabase } from '../platform/test-db.js';
import { setTestPool } from '../postgres.js';
import { publicUser, requireSameOrigin } from '../auth.js';
import { schoolAccessGuard } from '../school-access.js';
import { installTestsModule } from '../tests-module/index.js';
import { createPlatformRouter } from '../platform/routes.js';
import { installSchoolAnnouncementRoutes, createSchoolMailWorker, enqueueSchoolNotice, targetClasses, publicAppOrigin } from '../school-notifications.js';

test('targeted school email: class/grade isolation, routes, dedupe, private delivery, retries and durable leases', async () => {
  delete process.env.DATABASE_URL; delete process.env.MAIHOC_TEST_DATABASE_URL;
  const fixture = await testDatabase({ memoryOnly: true }); setTestPool(fixture.pool);
  const db = fixture.db, users = new Map();
  for (const [id, role, level, type] of [[1,'admin',1,'school'],[2,'user',0,'school'],[3,'user',0,'school'],[4,'user',0,'school'],[5,'user',0,'external'],[6,'admin',1,'school'],[7,'user',0,'school'],[8,'user',0,'school'],[9,'admin',2,'school']]) {
    const row = (await db.query('INSERT INTO users(id,name,email,password_hash,role,admin_level,account_type) VALUES($1,$2,$3,\'fixture\',$4,$5,$6) RETURNING *', [id, `User ${id}`, `user${id}@maihoc.test`, role, level, type])).rows[0];
    users.set(id, publicUser({...row,school_plan:type==='school'?'legacy':'none'}));
  }
  for (const [id,code] of [[2,'10A1'],[3,'10A2'],[4,'11B1'],[5,'10A1'],[6,'10A1'],[8,'10A1'],[8,'10A2']]) await db.query('INSERT INTO school_class_members(user_id,class_code) VALUES($1,$2)', [id,code]);
  await db.query("INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES('assigned',1,'10A1','Toán','subject')");
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.user = users.get(Number(req.headers['x-user'])); next(); }); app.use(schoolAccessGuard);
  const requireAuth = (req,res,next) => req.user ? next() : res.sendStatus(401);
  const requireAdmin = (req,res,next) => req.user?.role === 'admin' ? next() : res.sendStatus(403);
  installSchoolAnnouncementRoutes(app,{db,requireAuth,requireSameOrigin});
  const tests = installTestsModule({app,db,upload:multer({storage:multer.memoryStorage()}),requireAuth,requireAdmin,requireSameOrigin,
    assessmentConfigFor:()=>({}), storedFilename:name=>name,contentTypeFor:()=> 'text/plain',notifyUser:async()=>{},notifyAdmins:async()=>{}});
  await tests.initTestsModuleDatabase();
  app.use('/api/platform',createPlatformRouter({db,requireAuth,requireSameOrigin,enabled:()=>true}));
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,user=1,extra={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'x-user':String(user),...extra},body:JSON.stringify(body)});
  const get=(path,user)=>fetch(origin+path,{headers:{'x-user':String(user)}});
  const recipients=async key=>(await db.query('SELECT user_id FROM school_mail_outbox WHERE event_key=$1 ORDER BY user_id',[key])).rows.map(r=>Number(r.user_id));
  const announcement={title:'Lịch học <mới>',message:'Nội dung <script>unsafe</script>',classCode:'10A1',grade:'10'};
  try {
    assert.equal((await post('/api/school/announcements',announcement,2)).status,403);
    assert.equal((await post('/api/school/announcements',announcement,5)).status,403);
    assert.equal((await post('/api/school/announcements',announcement,1,{Origin:'https://evil.test'})).status,403);
    assert.equal((await post('/api/school/announcements',{...announcement,classCode:'10A2'})).status,403);
    assert.equal((await post('/api/school/announcements',{...announcement,classCode:'ALL',grade:'13'})).status,400);
    const created=await post('/api/school/announcements',announcement);assert.equal(created.status,201);
    const {id}=await created.json();assert.deepEqual(await recipients(`announcement:${id}`),[2,8]);
    assert.equal((await get(`/api/school/announcements/${id}`,2)).status,200);
    assert.equal((await get(`/api/school/announcements/${id}`,3)).status,404);
    assert.equal((await get(`/api/school/announcements/${id}`,1)).status,200);
    assert.equal((await get('/api/school/announcements',3)).status,200);
    assert.equal((await (await get('/api/school/announcements',3)).json()).items.length,0);
    const grade=await (await post('/api/school/announcements',{...announcement,classCode:'ALL'})).json();
    assert.deepEqual(await recipients(`announcement:${grade.id}`),[2,3,8]);
    await db.transaction(()=>enqueueSchoolNotice(db,{eventKey:`announcement:${id}`,userIds:[2,2,8],title:'duplicate',message:'duplicate',link:`/school/announcements/${id}`}))();
    assert.equal((await db.query('SELECT id FROM notifications WHERE link=$1',[`/school/announcements/${id}`])).rows.length,2);
    const createTest=async(classCode,grade='10')=>{
      const form=new FormData();form.append('document',new Blob(['Câu 1. Một câu hỏi']), 'test.txt');
      for(const [key,value] of Object.entries({classCode,grade,title:'Đề kiểm tra',subject:'Toán',answerMode:'deferred',openAt:'2026-11-01T00:00:00Z',closeAt:'2026-12-01T00:00:00Z'}))form.append(key,value);
      const response=await fetch(origin+'/api/admin/tests',{method:'POST',headers:{Origin:origin,'x-user':'1'},body:form});
      const body=await response.json();assert.equal(response.status,201,JSON.stringify(body));return body.testId;
    };
    const testId=await createTest('ALL');assert.deepEqual(await recipients(`test:${testId}`),[2,3,8]);
    const classTest=await createTest('10A1');assert.deepEqual(await recipients(`test:${classTest}`),[2,8]);
    const otherGrade=await (await get('/api/tests',4)).json();assert.ok(!otherGrade.tests.some(t=>t.id===testId));
    const env={SMTP_USER:'sender@gmail.com',SMTP_PASS:'test-password',APP_PUBLIC_URL:'https://maihoc.test'};
    assert.equal(publicAppOrigin({APP_PUBLIC_URL:'javascript:alert(1)'}),null);
    assert.equal(publicAppOrigin({APP_PUBLIC_URL:'https://name:pass@evil.test'}),null);
    const sent=[],clock={value:Date.now()};let reject=true;
    const send=async mail=>{if(reject)throw Object.assign(Error('private provider secret'),{code:'EAUTH'});sent.push(mail)};
    const worker=createSchoolMailWorker(db,{env,send,now:()=>clock.value});
    assert.equal(await createSchoolMailWorker(db,{env:{},send}).drain(),0);
    await worker.drain({limit:1});
    const retry=(await db.query("SELECT * FROM school_mail_outbox WHERE attempts=1")).rows[0];assert.equal(retry.status,'queued');assert.equal(retry.last_error,'EAUTH');assert.ok(!JSON.stringify(retry).includes('private provider'));
    reject=false;clock.value+=120001;
    const restart=createSchoolMailWorker(db,{env,send,now:()=>clock.value});await restart.drain({limit:100});
    assert.equal(sent.length,10);assert.ok(sent.every(m=>typeof m.to==='string'&&!m.cc&&!m.bcc));
    assert.ok(sent.some(m=>m.html.includes('&lt;script&gt;')&&!m.html.includes('<script>')));
    assert.ok(sent.some(m=>m.text.includes(`https://maihoc.test/school/tests/${testId}`)));
    assert.ok(sent.some(m=>m.text.includes(`https://maihoc.test/school/announcements/${id}`)));
    assert.equal(await restart.drain(),0);
    const concurrent = await (await post('/api/school/announcements',announcement)).json();
    const concurrentSent = [];
    const slowSend = async mail => { concurrentSent.push(mail.to); await new Promise(resolve=>setTimeout(resolve,5)); };
    await Promise.all([createSchoolMailWorker(db,{env,send:slowSend,now:()=>clock.value}).drain(),createSchoolMailWorker(db,{env,send:slowSend,now:()=>clock.value}).drain()]);
    assert.deepEqual(concurrentSent.sort(),['user2@maihoc.test','user8@maihoc.test']);
    assert.deepEqual(await recipients(`announcement:${concurrent.id}`),[2,8]);
    // A crashed claim is reclaimed; a deleted event is cancelled instead of mailed.
    await db.query("UPDATE school_mail_outbox SET status='sending',next_at=$1 WHERE id=$2",[clock.value-1,retry.id]);
    await db.query('DELETE FROM school_announcements WHERE id=$1',[id]);
    assert.equal(await restart.drain(),0);
    assert.equal((await db.query('SELECT status FROM school_mail_outbox WHERE id=$1',[retry.id])).rows[0].status,'cancelled');
    assert.throws(()=>targetClasses({classCode:'10A1',grade:'11'}));
  } finally { await new Promise(resolve=>server.close(resolve));await fixture.close(); }
});
