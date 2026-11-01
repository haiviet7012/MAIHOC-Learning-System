import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { testDatabase } from '../platform/test-db.js';
import { setTestPool } from '../postgres.js';

test('teacher signup and recovery email success/failure preserve roles, OTP privacy, cooldown and reset', async () => {
  delete process.env.DATABASE_URL; delete process.env.MAIHOC_TEST_DATABASE_URL;
  process.env.MAIHOC_SKIP_AUTO_LISTEN = '1'; process.env.NODE_ENV = 'test'; process.env.MAIHOC_PLATFORM_ENABLED = '0';
  for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) process.env[key] = 'isolated-auth-test';
  const fixture = await testDatabase({ memoryOnly: true }); setTestPool(fixture.pool);
  const originalTransport = nodemailer.createTransport;
  let server, stopPresenceCleanup;
  const sent = []; let fail = false;
  const envKeys = ['MAIL_PROVIDER', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'RESEND_API_KEY'];
  const saved = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_USER: 'test@gmail.com', SMTP_PASS: 'fixture-password', MAIL_FROM: 'test@gmail.com' });
  nodemailer.createTransport = () => ({ sendMail: async message => { if (fail) throw Object.assign(new Error('private SMTP detail'), { code: 'EAUTH' }); sent.push(message); return { accepted: message.to, rejected: [] }; }, close() {} });
  try {
    const runtime = await import('../server.js'); server = runtime.server; stopPresenceCleanup = runtime.stopPresenceCleanup;
    await runtime.initializeApplicationRuntime();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body, cookie) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    const register = await post('/api/auth/register', { name: 'Giáo viên mới', email: 'new-teacher@maihoc.test', password: 'teacher-fixture-password', accountType: 'teacher', role: 'admin', adminLevel: 2, classCode: '10A1' });
    assert.equal(register.status, 201); const teacher = (await register.json()).user;
    assert.equal(teacher.isTeacher, true); assert.equal(teacher.isSuperAdmin, false); assert.equal(teacher.adminLevel, 1); assert.equal(teacher.classCode, undefined);
    const cookie = register.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(origin + '/api/admin/users', { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await fixture.db.query('SELECT * FROM school_teacher_assignments WHERE teacher_id=$1', [teacher.id])).rows.length, 0);
    const student = await post('/api/auth/register', { name: 'Học sinh mới', email: 'new-student@maihoc.test', password: 'student-fixture-password', accountType: 'external', role: 'admin', adminLevel: 2 });
    assert.equal((await student.json()).user.adminLevel, 0);
    const externalCookie = student.headers.get('set-cookie').split(';')[0];
    const get = (path, session) => fetch(origin + path, { headers: session ? { Cookie: session } : {} });
    const restricted = ['/api/school/classes', '/api/tests', '/api/test-submissions/1', '/api/platform/schools', '/api/learning/timetable', '/api/learning-advisor/snapshot?scope=school&schoolId=1'];
    for (const path of restricted) {
      assert.equal((await get(path)).status, 401, `Guest denied: ${path}`);
      assert.equal((await get(path, externalCookie)).status, 403, `External learner denied: ${path}`);
    }
    assert.deepEqual(await (await get('/api/platform/context', externalCookie)).json(), { enabled: false, schools: [], schoolAccess: false, backgroundAi: false });
    assert.equal((await get('/api/progress', externalCookie)).status, 200, 'Learning progress stays accessible');
    assert.equal((await get('/api/documents', externalCookie)).status, 200, 'Learning library stays accessible');
    assert.equal((await post('/api/school/join-class', { classCode: '10A1', accountType: 'school' }, externalCookie)).status, 403, 'Request body cannot upgrade School access');
    assert.equal((await fetch(origin + '/api/progress', { method: 'PUT', headers: { Origin: origin, Cookie: externalCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemType: 'test', itemId: '1' }) })).status, 403);
    const schoolStudent = await post('/api/auth/register', { name: 'Học sinh trong trường', email: 'school-student@maihoc.test', password: 'student-fixture-password', accountType: 'school' });
    assert.equal(schoolStudent.status, 201);
    const schoolCookie = schoolStudent.headers.get('set-cookie').split(';')[0];
    for (const session of [schoolCookie, cookie]) {
      assert.equal((await get('/api/learning/timetable', session)).status, 200);
      assert.equal((await get('/api/tests', session)).status, 200);
      assert.equal((await get('/api/school/classes', session)).status, 200);
    }
    await fixture.db.query("INSERT INTO documents(id,subject,grade,category,title,filename,original_name,size) VALUES('school-test','Toán','10','test','School only','test.pdf','test.pdf',0),('learning-doc','Toán','10','theory','Learning','doc.pdf','doc.pdf',0)");
    const library = await (await get('/api/documents', externalCookie)).json();
    assert.ok(library.some(doc => doc.id === 'learning-doc'));
    assert.ok(!library.some(doc => doc.id === 'school-test'));
    assert.equal((await get('/api/documents/school-test/file', externalCookie)).status, 403);
    assert.equal((await get('/api/documents/school-test/file')).status, 401);
    const email = teacher.email;
    fail = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const failed = await post('/api/auth/forgot-password', { email }); assert.equal(failed.status, 503);
      const body = await failed.json(); assert.ok(!JSON.stringify(body).includes('private SMTP detail')); assert.equal(body.devCode, undefined);
      assert.equal((await fixture.db.query("SELECT * FROM email_verification_codes WHERE user_id=$1", [teacher.id])).rows.length, 0);
    }
    assert.equal((await fixture.db.query("SELECT * FROM notifications WHERE user_id=$1 AND type='verification_code'", [teacher.id])).rows.length, 0);
    fail = false;
    const success = await post('/api/auth/forgot-password', { email }); assert.equal(success.status, 200);
    const response = await success.json(); assert.equal(response.sentByEmail, true); assert.equal(response.devCode, undefined);
    const code = sent.at(-1).subject.match(/\d{6}/)[0]; assert.ok(!JSON.stringify(response).includes(code));
    const cooldown = await post('/api/auth/forgot-password', { email }); assert.equal(cooldown.status, 429);
    const wrong = await post('/api/auth/reset-password', { email, code: code === '000000' ? '111111' : '000000', password: 'updated-fixture-password' }); assert.equal(wrong.status, 400);
    const reset = await post('/api/auth/reset-password', { email, code, password: 'updated-fixture-password' }); assert.equal(reset.status, 200);
    assert.equal((await post('/api/auth/reset-password', { email, code, password: 'updated-fixture-password' })).status, 400);
    assert.equal((await post('/api/auth/login', { email, password: 'updated-fixture-password' })).status, 200);
    assert.equal((await post('/api/auth/login', { email, password: 'teacher-fixture-password' })).status, 401);
  } finally {
    nodemailer.createTransport = originalTransport;
    for (const key of envKeys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    stopPresenceCleanup?.(); if (server?.listening) await new Promise(resolve => server.close(resolve)); await fixture.close();
  }
});
