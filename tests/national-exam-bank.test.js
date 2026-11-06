import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { testDatabase } from '../server/platform/test-db.js';
import { ensureNationalExamBank, installNationalExamBank } from '../server/national-exam-bank.js';
import { installNationalExamRoutes } from '../server/national-exams.js';
import { gradeNationalExam, validateNationalExam } from '../server/national-exam-engine.js';
import { canManageNationalExams } from '../js/platform/national-exam-access.js';

const mocks = JSON.parse(await readFile(new URL('../server/national-exam-mock.json', import.meta.url), 'utf8')).exams;
const fullAnswers = exam => Object.fromEntries(exam.questions.flatMap(q => q.type === 'true_false'
  ? q.statements.map(s => [`${q.id}${s.id}`, String(q.correctAnswer[s.id])]) : [[q.id, q.correctAnswer]]));

test('Six private JSON samples grade to 10 and cover all levels, sections, decimal values and partial truth scores', () => {
  assert.equal(mocks.length, 6); assert.equal(new Set(mocks.map(exam => exam.subject)).size, 6);
  for (const mock of mocks) {
    const exam = { ...validateNationalExam(mock), id: mock.id, mock: true };
    const grade = gradeNationalExam(exam, fullAnswers(exam), 123);
    assert.equal(grade.score, 10, exam.subject); assert.equal(grade.correctCount, 4); assert.equal(grade.blankCount, 0);
    assert.equal(grade.levels.length, 4); assert.equal(grade.levels.every(level => level.total === 1 && level.correct === 1), true);
    assert.equal(grade.timeSpentSeconds, 123);
    const blank = gradeNationalExam(exam, {}, 1); assert.equal(blank.blankCount, 4); assert.equal(blank.score, 0);
  }
  const math = validateNationalExam(mocks[0]);
  const partial = gradeNationalExam(math, { 'I-1': 'B', 'I-2': 'A', 'II-1a': 'true', 'II-1b': 'true', 'II-1c': 'true', 'II-1d': 'true' }, 4);
  assert.equal(partial.score, 3); assert.equal(partial.correctCount, 1); assert.equal(partial.incorrectCount, 2); assert.equal(partial.blankCount, 1);
  const chemistry = validateNationalExam(mocks.find(exam => exam.subject === 'Hóa học'));
  assert.equal(gradeNationalExam(chemistry, { 'III-1': '7,3' }, 2).questions.at(-1).correct, true);
  for (const override of [{ durationMinutes: -1 }, { access: 'admin' }, { questions: [] }, { questions: [{ ...mocks[0].questions[0], points: 1 }] }]) assert.throws(() => validateNationalExam({ ...mocks[0], ...override }));
  assert.equal(canManageNationalExams({ role: 'user', schoolPlan: 'standard' }), false);
});

test('Bank API enforces staff ownership and School access, hides solutions, preserves sessions and saves one result', async t => {
  const fixture = await testDatabase({ memoryOnly: true }); t.after(() => fixture.close());
  const { db } = fixture;
  await ensureNationalExamBank(db);
  for (const id of [81, 82, 83, 84, 85]) await db.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'Test',$2,'fixture')", [id, `bank-${id}@test.local`]);
  const users = {
    81: { id: 81, role: 'user', schoolPlan: 'none' }, 82: { id: 82, role: 'user', schoolPlan: 'standard' },
    83: { id: 83, role: 'admin', adminLevel: 1, isTeacher: true }, 84: { id: 84, role: 'teacher' },
    85: { id: 85, role: 'admin', adminLevel: 2 },
  };
  const require = createRequire(new URL('../server/package.json', import.meta.url));
  const app = require('express')(); app.use(require('express').json());
  app.use((req, _res, next) => { req.user = users[req.get('x-test-user')]; next(); });
  const origin = 'https://bank.test';
  const shared = { db, requireAuth: (req, res, next) => req.user ? next() : res.sendStatus(401),
    requireSameOrigin: (req, res, next) => req.get('origin') === origin ? next() : res.sendStatus(403),
    notifyUser: (userId, type, title, message, link) => db.prepare('INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)').run(userId, type, title, message, link) };
  installNationalExamBank(app, shared);
  installNationalExamRoutes(app, { ...shared, documentResponse: row => row, assessmentConfigFor: () => null });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (path = '', { user, method = 'GET', body } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/national-exams${path}`, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(user ? { 'x-test-user': String(user) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const catalog = await (await request()).json(); assert.equal(catalog.exams.length, 6);
  assert.ok(!JSON.stringify(catalog).includes('correctAnswer')); assert.ok(!JSON.stringify(catalog).includes('explanation'));
  assert.equal((await request('/manage', { user: 81 })).status, 403);
  assert.equal((await request('/manage', { user: 82 })).status, 403);
  const teacherList = await (await request('/manage', { user: 83 })).json(); assert.equal(teacherList.exams.length, 0);
  const createBody = { ...mocks[0], title: 'School Teacher exam', access: 'school' };
  assert.equal((await request('/manage', { user: 81, method: 'POST', body: createBody })).status, 403);
  const createdResponse = await request('/manage', { user: 83, method: 'POST', body: createBody });
  assert.equal(createdResponse.status, 201); const { exam: created } = await createdResponse.json();
  const paid = (await (await request('', { user: 81 })).json()).exams.find(exam => exam.id === created.id);
  assert.equal(paid.locked, true); assert.equal(paid.questions, undefined);
  assert.equal((await request(`/${created.id}/sessions`, { user: 81, method: 'POST', body: {} })).status, 403);
  assert.equal((await request(`/${created.id}/sessions`, { user: 82, method: 'POST', body: {} })).status, 200);
  assert.equal((await request(`/manage/${created.id}`, { user: 84, method: 'PUT', body: created })).status, 403);
  assert.equal((await request(`/manage/${created.id}`, { user: 83, method: 'PUT', body: { ...created, title: 'Updated teacher exam' } })).status, 200);
  assert.equal((await request(`/manage/${created.id}`, { user: 83, method: 'PUT', body: created })).status, 409);

  const mockId = mocks[0].id;
  const opened = await (await request(`/${mockId}/sessions`, { user: 81, method: 'POST', body: {} })).json();
  assert.ok(opened.sessionId); assert.ok(!JSON.stringify(opened).includes('correctAnswer'));
  const resumed = await (await request(`/${mockId}/sessions`, { user: 81, method: 'POST', body: { sessionId: opened.sessionId } })).json();
  assert.equal(resumed.deadline, opened.deadline);
  assert.equal((await request(`/${mockId}/sessions`, { user: 82, method: 'POST', body: { sessionId: opened.sessionId } })).status, 403);
  const answers = fullAnswers(validateNationalExam(mocks[0]));
  await db.prepare('UPDATE national_exam_sessions SET started_at=? WHERE id=?').run(Date.now() - 65000, opened.sessionId);
  const submitted = await request(`/${mockId}/submit`, { user: 81, method: 'POST', body: { sessionId: opened.sessionId, answers, score: 0, timeSpentSeconds: 999999 } });
  assert.equal(submitted.status, 200, await submitted.clone().text()); const result = await submitted.json();
  assert.equal(result.score, 10); assert.ok(result.timeSpentSeconds >= 65 && result.timeSpentSeconds < 68);
  assert.equal(result.questions[0].correctAnswer, 'B'); assert.ok(result.questions[0].explanation);
  const duplicate = await (await request(`/${mockId}/submit`, { user: 81, method: 'POST', body: { sessionId: opened.sessionId, answers: {} } })).json();
  assert.equal(duplicate.attemptId, result.attemptId); assert.equal(duplicate.score, 10);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM exam_attempts WHERE user_id=81').get()).n), 1);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=81').get()).n), 1);
  const progress = await db.prepare("SELECT * FROM user_progress WHERE user_id=81 AND item_type='exam'").get();
  assert.equal(progress.status, 'completed'); assert.equal(Number(progress.score), 10);
  assert.equal((await request(`/results/${result.attemptId}`, { user: 82 })).status, 404);
  assert.equal((await request(`/results/${result.attemptId}`, { user: 81 })).status, 200);
  const history = await (await request(`/${mockId}/history`, { user: 81 })).json(); assert.equal(history.attempts.length, 1);
  assert.equal((await (await request('', { user: 81 })).json()).stats.completed, 1);
  // Every seeded subject has an end-to-end usable guest session as well.
  for (const exam of mocks) {
    const session = await (await request(`/${exam.id}/sessions`, { method: 'POST', body: {} })).json();
    const response = await request(`/${exam.id}/submit`, { method: 'POST', body: { sessionId: session.sessionId, answers: fullAnswers(validateNationalExam(exam)) } });
    assert.equal(response.status, 200); assert.equal((await response.json()).score, 10);
  }
});
