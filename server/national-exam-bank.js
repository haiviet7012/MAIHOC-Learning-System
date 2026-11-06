import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { canAccessSchool } from '../js/platform/school-access.js';
import { canManageNationalExams, isNationalAdmin } from '../js/platform/national-exam-access.js';
import { validateNationalExam, publicNationalExam, gradeNationalExam } from './national-exam-engine.js';

export async function ensureNationalExamBank(db, { seed = true } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS national_exam_bank (
    id TEXT PRIMARY KEY, definition_json TEXT NOT NULL, created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')));
    CREATE TABLE IF NOT EXISTS national_exam_sessions (
    id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    snapshot_json TEXT NOT NULL, started_at BIGINT NOT NULL, deadline BIGINT NOT NULL, result_json TEXT, attempt_id BIGINT);
    CREATE INDEX IF NOT EXISTS national_exam_sessions_user_idx ON national_exam_sessions(user_id,exam_id);`);
  if (!seed) return;
  const { exams } = JSON.parse(await readFile(new URL('./national-exam-mock.json', import.meta.url), 'utf8'));
  for (const exam of exams) {
    const validated = { ...validateNationalExam(exam), id: exam.id, mock: true };
    await db.prepare('INSERT INTO national_exam_bank(id,definition_json) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(exam.id, JSON.stringify(validated));
  }
}

export async function bankCatalog(db, user) {
  const rows = await db.prepare('SELECT * FROM national_exam_bank ORDER BY updated_at DESC,id').all();
  return rows.flatMap(row => {
    const exam = JSON.parse(row.definition_json);
    if (!exam.published) return [];
    const unlocked = exam.access === 'learn' || canAccessSchool(user);
    const summary = publicNationalExam(exam);
    if (!unlocked) delete summary.questions;
    return [{ ...summary, locked: !unlocked }];
  });
}

export function installNationalExamBank(app, { db, requireAuth, requireSameOrigin, notifyUser, upsertLearningResult }) {
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const privateResponse = res => res.setHeader('Cache-Control', 'private, no-store');
  const requireManager = (req, res, next) => canManageNationalExams(req.user) ? next() : res.status(req.user ? 403 : 401).json({ error: 'Chỉ Teacher/Admin được quản lý ngân hàng đề.' });
  const owns = (row, user) => isNationalAdmin(user) || (row.created_by != null && Number(row.created_by) === Number(user?.id));
  const getExam = async id => {
    const row = await db.prepare('SELECT * FROM national_exam_bank WHERE id=?').get(id);
    return row ? { row, exam: JSON.parse(row.definition_json) } : null;
  };
  const ownsSession = (session, user) => session.user_id == null ? !user : Number(session.user_id) === Number(user?.id);

  app.get('/api/national-exams/manage', requireManager, wrap(async (req, res) => {
    privateResponse(res);
    const rows = await db.prepare('SELECT * FROM national_exam_bank ORDER BY updated_at DESC,id').all();
    res.json({ exams: rows.filter(row => owns(row, req.user)).map(row => ({ ...JSON.parse(row.definition_json), revision: Number(row.revision) })) });
  }));
  app.post('/api/national-exams/manage', requireSameOrigin, requireManager, wrap(async (req, res) => {
    const exam = { ...validateNationalExam(req.body), id: `thpt-${randomUUID()}`, mock: false };
    await db.prepare('INSERT INTO national_exam_bank(id,definition_json,created_by) VALUES(?,?,?)').run(exam.id, JSON.stringify(exam), req.user.id);
    res.status(201).json({ exam: { ...exam, revision: 1 } });
  }));
  app.put('/api/national-exams/manage/:id', requireSameOrigin, requireManager, wrap(async (req, res) => {
    const found = await getExam(req.params.id);
    if (!found) return res.status(404).json({ error: 'Không tìm thấy đề thi.' });
    if (!owns(found.row, req.user)) return res.status(403).json({ error: 'Bạn chỉ được chỉnh sửa đề do mình tạo.' });
    const exam = { ...validateNationalExam(req.body), id: found.exam.id, mock: found.exam.mock };
    const revision = Number(req.body.revision);
    if (!Number.isInteger(revision) || revision < 1) return res.status(400).json({ error: 'Thiếu phiên bản chỉnh sửa.' });
    const update = await db.prepare("UPDATE national_exam_bank SET definition_json=?,revision=revision+1,updated_at=datetime('now') WHERE id=? AND revision=?").run(JSON.stringify(exam), exam.id, revision);
    if (!update.changes) return res.status(409).json({ error: 'Đề đã được sửa ở nơi khác. Hãy tải lại ngân hàng đề trước khi sửa.' });
    res.json({ exam: { ...exam, revision: revision + 1 } });
  }));

  app.post('/api/national-exams/:id/sessions', requireSameOrigin, wrap(async (req, res) => {
    privateResponse(res);
    const found = await getExam(req.params.id);
    if (!found || !found.exam.published) return res.status(404).json({ error: 'Không tìm thấy đề thi khả dụng.' });
    if (found.exam.access === 'school' && !canAccessSchool(req.user)) return res.status(403).json({ error: 'Đề này thuộc gói Paid School. Hãy mở gói School để làm bài.' });
    let session = req.body?.sessionId ? await db.prepare('SELECT * FROM national_exam_sessions WHERE id=?').get(String(req.body.sessionId)) : null;
    if (session && (!ownsSession(session, req.user) || session.exam_id !== req.params.id)) return res.status(403).json({ error: 'Phiên thi không thuộc tài khoản này.' });
    if (!session) {
      const now = Date.now(), id = randomUUID(), deadline = now + found.exam.durationMinutes * 60000;
      await db.prepare('INSERT INTO national_exam_sessions(id,exam_id,user_id,snapshot_json,started_at,deadline) VALUES(?,?,?,?,?,?)')
        .run(id, found.exam.id, req.user?.id || null, JSON.stringify(found.exam), now, deadline);
      session = { id, deadline, snapshot_json: JSON.stringify(found.exam) };
    }
    res.json({ sessionId: session.id, deadline: Number(session.deadline), serverTime: Date.now(),
      document: publicNationalExam(JSON.parse(session.snapshot_json)), result: session.result_json ? JSON.parse(session.result_json) : null });
  }));

  app.post('/api/national-exams/:id/submit', requireSameOrigin, wrap(async (req, res) => {
    privateResponse(res);
    const result = await db.transaction(async () => {
      const session = await db.prepare('SELECT * FROM national_exam_sessions WHERE id=? FOR UPDATE').get(String(req.body?.sessionId || ''));
      if (!session || session.exam_id !== req.params.id || !ownsSession(session, req.user)) throw Object.assign(new Error('Phiên thi không hợp lệ hoặc không thuộc tài khoản này.'), { status: 403 });
      if (session.result_json) return JSON.parse(session.result_json);
      const exam = JSON.parse(session.snapshot_json);
      if (exam.access === 'school' && !canAccessSchool(req.user)) throw Object.assign(new Error('Gói School chưa được kích hoạt hoặc đã hết hạn.'), { status: 403 });
      const spent = Math.max(0, Math.min(exam.durationMinutes * 60, Math.round((Date.now() - Number(session.started_at)) / 1000)));
      const graded = { ...gradeNationalExam(exam, req.body?.answers, spent), saved: Boolean(req.user), submittedAt: new Date().toISOString() };
      if (req.user) {
        const inserted = await db.prepare(`INSERT INTO exam_attempts(user_id,document_id,title,subject,grade,category,graded,score,scale,percent,correct_count,question_count,answers_json,result_json)
          VALUES(?,?,?,?,'12','exam',1,?,10,?,?,?, ?,?)`).run(req.user.id, exam.id, exam.title, exam.subject, graded.score, graded.percent, graded.correctCount, graded.questionCount, JSON.stringify(graded.answers), JSON.stringify(graded));
        graded.attemptId = Number(inserted.lastInsertRowid);
        await db.prepare('UPDATE exam_attempts SET result_json=? WHERE id=?').run(JSON.stringify(graded), graded.attemptId);
        await db.prepare(`INSERT INTO user_progress(user_id,item_type,item_id,item_title,subject,grade,status,progress_percent,score,answers_json,last_position,updated_at)
          VALUES(?,'exam',?,?,?,'12','completed',100,?,?,?,datetime('now')) ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET item_title=excluded.item_title,subject=excluded.subject,status='completed',progress_percent=100,score=excluded.score,answers_json=excluded.answers_json,last_position=excluded.last_position,updated_at=datetime('now')`)
          .run(req.user.id, exam.id, exam.title, exam.subject, graded.score, JSON.stringify(graded.answers), `result:${graded.attemptId}`);
        if (notifyUser) await notifyUser(req.user.id, 'exam_completed', `Đã hoàn thành ${exam.title}`, `Điểm: ${graded.score.toFixed(2)}/10 · ${graded.correctCount}/${graded.questionCount} câu đúng.`, `/learning/national-exams/results/${graded.attemptId}`);
        if (upsertLearningResult) await upsertLearningResult({ recordKey: `exam:${graded.attemptId}`, userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
          subject: exam.subject, grade: '12', category: 'exam', itemId: exam.id, itemTitle: exam.title, attemptId: graded.attemptId, score: graded.score, scale: 10,
          correctCount: graded.correctCount, questionCount: graded.questionCount, durationMinutes: exam.durationMinutes, timeSpentSeconds: spent, sectionBreakdown: graded.sections, submittedAt: graded.submittedAt });
      }
      await db.prepare('UPDATE national_exam_sessions SET result_json=?,attempt_id=? WHERE id=?').run(JSON.stringify(graded), graded.attemptId || null, session.id);
      return graded;
    })();
    res.json(result);
  }));

  app.get('/api/national-exams/results/:id', requireAuth, wrap(async (req, res) => {
    privateResponse(res);
    const row = await db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(Number(req.params.id));
    if (!row || (Number(row.user_id) !== Number(req.user.id) && !isNationalAdmin(req.user))) return res.status(404).json({ error: 'Không tìm thấy bài làm thuộc tài khoản này.' });
    const result = JSON.parse(row.result_json);
    res.json({ ...result, title: result.title || row.title, subject: row.subject, examId: row.document_id, attemptId: Number(row.id) });
  }));
}
