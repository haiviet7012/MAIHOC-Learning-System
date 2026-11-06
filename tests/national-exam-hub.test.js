import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { testDatabase } from '../server/platform/test-db.js';
import { installNationalExamRoutes, nationalExamMetadata } from '../server/national-exams.js';
import { ensureNationalExamBank } from '../server/national-exam-bank.js';
import { filterNationalExams } from '../js/platform/national-exam-hub.js';
import { routeUrl, parseRoute } from '../js/platform/router.js';

test('THPT route supports direct links and combined accent-insensitive filters', () => {
  assert.equal(routeUrl({ route: 'national-exam-hub' }), '/learning/national-exams');
  assert.deepEqual(parseRoute(new URL('https://maihoc.test/learning/national-exams')), { route: 'national-exam-hub' });
  const exams = [
    { id: 'M101', title: 'Đề minh họa Toán 2026', subject: 'Toán', year: '2026', examType: 'illustrative' },
    { id: 'L102', title: 'Đề chính thức Vật lý 2025', subject: 'Vật lý', year: '2025', examType: 'official' },
  ];
  assert.deepEqual(filterNationalExams(exams, { subject: 'Toán', year: '2026', type: 'illustrative', query: 'de toan' }), [exams[0]]);
  assert.deepEqual(filterNationalExams(exams, { query: 'l102' }), [exams[1]]);
  assert.equal(filterNationalExams(exams, { year: '2024' }).length, 0);
  assert.equal(nationalExamMetadata({ title: 'Đề thi thử', uploadedAt: '2026-01-01' }).year, null);
  assert.equal(nationalExamMetadata({ title: 'Đề tham khảo 2026' }).examType, 'illustrative');
  assert.equal(nationalExamMetadata({ title: 'Đề chính thức 2024', questionIds: ['1', '2'] }).questionCount, 2);
});

test('THPT API uses real submissions, counts unique completed exams and protects history', async t => {
  const fixture = await testDatabase({ memoryOnly: true });
  t.after(() => fixture.close());
  const { db } = fixture;
  await ensureNationalExamBank(db, { seed: false });
  await db.query("INSERT INTO users(id,name,email,password_hash) VALUES(81,'Student','exam81@test.local','fixture'),(82,'Other','exam82@test.local','fixture')");
  for (const [id, grade, category, subject, title] of [
    ['N101', '12', 'exam', 'Toán', 'Đề minh họa Bộ GD&ĐT 2026'],
    ['N102', '12', 'exam', 'Vật lý', 'Đề chính thức 2025'],
    ['N103', '11', 'exam', 'Toán', 'Đề lớp 11'],
    ['N104', '12', 'test', 'Toán', 'Bài kiểm tra riêng'],
    ['N105', '12', 'exam', 'IELTS', 'IELTS riêng'],
  ]) await db.query('INSERT INTO documents(id,grade,category,subject,title,filename,original_name,size) VALUES($1,$2,$3,$4,$5,$1,$1,1)', [id, grade, category, subject, title]);
  for (const [user, id, graded, score, scale] of [[81, 'N101', 1, 8, 10], [81, 'N101', 1, 10, 20], [81, 'N102', 0, null, null], [82, 'N101', 1, 1, 10]]) {
    await db.query("INSERT INTO exam_attempts(user_id,document_id,title,subject,grade,category,graded,score,scale,answers_json,result_json) VALUES($1,$2,'Fixture','Toán','12','exam',$3,$4,$5,'{}','{}')", [user, id, graded, score, scale]);
  }
  const require = createRequire(new URL('../server/package.json', import.meta.url));
  const app = require('express')();
  app.use((req, _res, next) => { if (req.get('x-test-user')) req.user = { id: Number(req.get('x-test-user')) }; next(); });
  installNationalExamRoutes(app, { db,
    requireAuth: (req, res, next) => req.user ? next() : res.sendStatus(401),
    documentResponse: row => ({ id: row.id, title: row.title, subject: row.subject, originalName: row.original_name }),
    assessmentConfigFor: () => ({ layout: { totalQuestions: 22 } }),
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const get = (path = '', user) => fetch(`http://127.0.0.1:${server.address().port}/api/national-exams${path}`, { headers: user ? { 'x-test-user': String(user) } : {} });
  const guest = await (await get()).json();
  assert.deepEqual(guest.stats, { total: 2, completed: null, average: null });
  assert.ok(!JSON.stringify(guest).includes('answers_json'));
  const response = await get('', 81);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  const data = await response.json();
  assert.deepEqual(data.stats, { total: 2, completed: 2, average: 6.5 });
  const math = data.exams.find(exam => exam.id === 'N101');
  assert.equal(math.bestScore, 8);
  assert.equal(math.attemptCount, 3);
  assert.equal(math.questionCount, 22);
  assert.equal(math.year, '2026');
  assert.equal(math.examType, 'illustrative');
  assert.equal((await get('/N101/history')).status, 401);
  const history = await (await get('/N101/history', 81)).json();
  assert.equal(history.attempts.length, 2);
  assert.ok(history.attempts.every(attempt => !Object.hasOwn(attempt, 'answers')));
  assert.equal((await get('/N104/history', 81)).status, 404);
  assert.equal((await (await get('/N101/history', 82)).json()).attempts.length, 1);
});
