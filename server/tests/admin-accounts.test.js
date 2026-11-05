import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { testDatabase } from '../platform/test-db.js';
import { setTestPool } from '../postgres.js';
import { publicUser } from '../auth.js';

test('owner deletion, delegated management and exclusive roles use real HTTP and PostgreSQL transactions', async () => {
  delete process.env.DATABASE_URL;
  delete process.env.MAIHOC_TEST_DATABASE_URL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_EMAIL;
  Object.assign(process.env, { MAIHOC_SKIP_AUTO_LISTEN: '1', NODE_ENV: 'test', MAIHOC_PLATFORM_ENABLED: '1' });
  for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) process.env[key] = 'isolated-admin-test';
  const fixture = await testDatabase({ memoryOnly: true });
  setTestPool(fixture.pool);
  let runtime;
  try {
    runtime = await import('../server.js');
    await runtime.initializeApplicationRuntime();
    await new Promise(resolve => runtime.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${runtime.server.address().port}`;
    const request = (path, cookie, method = 'GET', body) => fetch(origin + path, {
      method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const signup = async email => {
      const response = await request('/api/auth/register', null, 'POST', { name: 'Test Account', email, password: 'admin-test-password' });
      assert.equal(response.status, 201, await response.clone().text());
      return { user: (await response.json()).user, cookie: response.headers.get('set-cookie').split(';')[0] };
    };
    const owner = await signup('owner@gmail.com');
    const manager = await signup('manager@gmail.com');
    const student = await signup('student@gmail.com');
    const teacher = await signup('teacher@gmail.com');
    const otherAdmin = await signup('other-admin@gmail.com');
    process.env.ADMIN_EMAIL = owner.user.email;
    await fixture.db.query("UPDATE users SET role='admin',admin_level=2 WHERE id=ANY($1::bigint[])", [[owner.user.id, otherAdmin.user.id]]);
    await fixture.db.query("UPDATE users SET role='admin',admin_level=2,is_manager=true WHERE id=$1", [manager.user.id]);
    await fixture.db.query("UPDATE users SET role='admin',admin_level=1 WHERE id=$1", [teacher.user.id]);
    await fixture.db.query("INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES($1,$2,'10A1','Toán','subject')", [randomUUID(), teacher.user.id]);
    await fixture.db.query("INSERT INTO school_class_members(user_id,class_code) VALUES($1,'10A1')", [student.user.id]);
    const school = (await fixture.db.query("INSERT INTO schools(code,name) VALUES('ADMIN-TEST','Test School') RETURNING id")).rows[0];
    await fixture.db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'student')", [school.id, student.user.id]);
    const year = (await fixture.db.query("INSERT INTO academic_years(school_id,code,start_date,end_date) VALUES($1,'2026','2026-09-01','2027-06-01') RETURNING id", [school.id])).rows[0];
    const cls = (await fixture.db.query("INSERT INTO classes(school_id,academic_year_id,class_code,name,grade_level) VALUES($1,$2,'10A1','10A1',10) RETURNING id", [school.id, year.id])).rows[0];
    await fixture.db.query("INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES($1,$2,$3,$4,'test',$5)", [school.id, year.id, cls.id, student.user.id, manager.user.id]);
    for (const [uid, role] of [[teacher.user.id, 'student'], [student.user.id, 'teacher'], [manager.user.id, 'teacher']]) {
      const email = uid === teacher.user.id ? teacher.user.email : uid === student.user.id ? student.user.email : manager.user.email;
      const res = await request(`/api/platform/schools/${school.id}/members`, manager.cookie, 'POST', { email, role });
      assert.equal(res.status, 409, await res.clone().text());
    }
    await assert.rejects(fixture.db.query("INSERT INTO school_class_members(user_id,class_code) VALUES($1,'10A1')", [teacher.user.id]), /một vai trò/);
    await assert.rejects(fixture.db.query("INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES($1,$2,'10A1','Toán','subject')", [randomUUID(), student.user.id]), /một vai trò/);
    const promoted = await request('/api/admin/admins', manager.cookie, 'POST', { email: teacher.user.email });
    assert.equal(promoted.status, 200, await promoted.clone().text());
    assert.equal((await fixture.db.query('SELECT * FROM school_teacher_assignments WHERE teacher_id=$1', [teacher.user.id])).rows.length, 0);
    const normalized = publicUser({ id: 99, role: 'admin', admin_level: 2, homeroom_class: '10A1', student_class: '10A2' });
    assert.equal(normalized.accountRole, 'admin');
    assert.equal(normalized.homeroomClass, undefined);
    assert.equal(normalized.classCode, undefined);
    const staleManager = publicUser({ id: 100, role: 'user', admin_level: 0, is_manager: true, homeroom_class: '10A1' });
    assert.equal(staleManager.isManager, false);
    assert.equal(staleManager.accountRole, 'student');
    assert.equal(staleManager.homeroomClass, undefined);
    assert.equal((await (await request('/api/study-rooms', manager.cookie)).json()).isAdmin, true);
    for (const session of [manager.cookie, otherAdmin.cookie, teacher.cookie, student.cookie]) {
      assert.equal((await request(`/api/admin/users/${student.user.id}`, session, 'DELETE')).status, 403);
    }
    assert.equal((await request(`/api/admin/users/${owner.user.id}`, owner.cookie, 'DELETE')).status, 400);
    const before = await (await request('/api/admin/users', owner.cookie)).json();
    assert.equal(before.isOwnerAdmin, true);
    assert.equal((await (await request('/api/admin/users', manager.cookie)).json()).isOwnerAdmin, false);
    // A paid learner must remain deletable without losing the order/transaction history.
    const orderId = randomUUID();
    await fixture.db.query("INSERT INTO billing_orders(id,order_code,buyer_user_id,buyer_type,unit_price_vnd,quantity,amount_vnd,duration_days,payment_deadline) VALUES($1,'ADMIN-DELETE',$2,'student',10000,1,10000,30,now()+interval '1 day')", [orderId, student.user.id]);
    await fixture.db.query('INSERT INTO billing_order_recipients(order_id,user_id) VALUES($1,$2)', [orderId, student.user.id]);
    await fixture.db.query("INSERT INTO audit_logs(school_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,'test','user','test')", [school.id, student.user.id]);
    const deleted = await request(`/api/admin/users/${student.user.id}`, owner.cookie, 'DELETE');
    assert.equal(deleted.status, 200, await deleted.clone().text());
    const result = await deleted.json();
    assert.equal(result.deleted, true);
    assert.equal(result.deletedId, student.user.id);
    assert.equal(result.total, before.total - 1);
    assert.equal((await fixture.db.query('SELECT * FROM users WHERE id=$1', [student.user.id])).rows.length, 0);
    assert.equal((await fixture.db.query('SELECT * FROM sessions WHERE user_id=$1', [student.user.id])).rows.length, 0);
    assert.equal((await fixture.db.query('SELECT buyer_user_id FROM billing_orders WHERE id=$1', [orderId])).rows[0].buyer_user_id, null);
    assert.equal((await fixture.db.query("SELECT actor_id FROM audit_logs WHERE entity_id='test'")).rows[0].actor_id, null);
    const after = await (await request('/api/admin/users', owner.cookie)).json();
    assert.ok(!after.users.some(user => user.id === student.user.id));
    assert.equal(after.total, result.total);
    assert.equal((await request(`/api/admin/users/${student.user.id}`, owner.cookie, 'DELETE')).status, 404);
    assert.equal((await request('/api/auth/me', student.cookie)).status, 200);
    assert.equal((await (await request('/api/auth/me', student.cookie)).json()).user, null);
    const sharedAssessment = (await fixture.db.query("INSERT INTO assessments(school_id,title,created_by,subject) VALUES($1,'Shared test',$2,'Toán') RETURNING id", [school.id, manager.user.id])).rows[0];
    const deleteManager = await request(`/api/admin/users/${manager.user.id}`, owner.cookie, 'DELETE');
    assert.equal(deleteManager.status, 200, await deleteManager.clone().text());
    assert.equal((await deleteManager.json()).deleted, true);
    assert.equal((await fixture.db.query('SELECT created_by FROM assessments WHERE id=$1', [sharedAssessment.id])).rows[0].created_by, null);
    assert.equal((await fixture.db.query('SELECT * FROM student_enrollments WHERE student_id=$1', [student.user.id])).rows.length, 0);
  } finally {
    runtime?.stopPresenceCleanup();
    if (runtime?.server.listening) await new Promise(resolve => runtime.server.close(resolve));
    await fixture.close();
  }
});


test('role migration repairs existing conflicts without removing account identity or password', async () => {
  const fixture = await testDatabase({ memoryOnly: true });
  try {
    const db = fixture.db;
    await db.exec("DROP FUNCTION align_account_role() CASCADE; DROP FUNCTION check_account_assignment_role() CASCADE; DROP FUNCTION account_school_role(TEXT,BIGINT);");
    await db.query("INSERT INTO users(id,name,email,password_hash,role,admin_level) VALUES(901,'Teacher','repair-teacher@test.local','keep-teacher','admin',1),(902,'Student','repair-student@test.local','keep-student','user',0)");
    await db.query("INSERT INTO school_class_members(user_id,class_code) VALUES(901,'10A1')");
    await db.query("INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES('bad-assignment',902,'10A1','Toán','subject')");
    const school = (await db.query("INSERT INTO schools(code,name) VALUES('REPAIR','Repair') RETURNING id")).rows[0];
    await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,901,'student'),($1,902,'teacher')", [school.id]);
    await db.query(await readFile(new URL('../platform/migrations/010_exclusive_account_roles.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('SELECT * FROM school_class_members WHERE user_id=901')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM school_teacher_assignments WHERE teacher_id=902')).rows.length, 0);
    assert.deepEqual((await db.query('SELECT role FROM school_memberships ORDER BY user_id')).rows.map(row => row.role), ['teacher', 'student']);
    assert.deepEqual((await db.query('SELECT password_hash FROM users ORDER BY id')).rows.map(row => row.password_hash), ['keep-teacher', 'keep-student']);
  } finally { await fixture.close(); }
});
