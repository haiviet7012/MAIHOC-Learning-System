import { questionFingerprint } from '../js/platform/question-identity.js';
import { contentTimestamp } from '../js/platform/content-filters.js';

export async function questionBankHistory(db, userId) {
  const history = new Map();
  const record = (question, completedAt) => {
    const time = contentTimestamp(completedAt);
    if (time === null) return;
    const fingerprint = questionFingerprint(question), previous = history.get(fingerprint);
    if (!previous || contentTimestamp(previous.lastCompletedAt) < time) history.set(fingerprint, { fingerprint, lastCompletedAt: new Date(time).toISOString() });
  };
  const school = (await db.query(`SELECT q.subject,q.grade,i.snapshot,a.submitted_at,aa.answer
    FROM assessment_attempts a JOIN attempt_answers aa ON aa.attempt_id=a.id
    JOIN assessment_items i ON i.id=aa.assessment_item_id
    JOIN question_versions q ON q.id=i.question_version_id
    WHERE a.student_id=$1 AND a.submitted_at IS NOT NULL AND a.status<>'in_progress'`, [userId])).rows;
  for (const row of school) {
    const answered = row.snapshot.type === 'true_false'
      ? JSON.parse(row.answer || '[]').some(x => x !== '' && x != null)
      : String(row.answer ?? '').trim().length > 0;
    if (answered) record({ ...row.snapshot, subject: row.subject, grade: row.grade }, row.submitted_at);
  }
  const sessions = await db.prepare('SELECT snapshot_json,result_json FROM national_exam_sessions WHERE user_id=? AND result_json IS NOT NULL').all(userId);
  for (const session of sessions) {
    const exam = JSON.parse(session.snapshot_json), result = JSON.parse(session.result_json);
    for (const q of exam.questions) {
      if (!result.questions?.some(item => item.id === q.id && item.blank === false)) continue;
      record({ ...q, stem: q.text, choices: (q.options || q.statements || []).map(option => option.text), subject: exam.subject, grade: '12' }, result.submittedAt);
    }
  }
  return [...history.values()];
}

export function installQuestionBankHistory(app, { db, requireAuth }) {
  app.get('/api/question-bank/history', requireAuth, async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ history: await questionBankHistory(db, req.user.id) });
    } catch (error) { next(error); }
  });
}
