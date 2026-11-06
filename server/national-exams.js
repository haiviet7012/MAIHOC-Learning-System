import { bankCatalog } from './national-exam-bank.js';
const SUBJECTS = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Ngữ văn'];
const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();

// Legacy documents have no year/type columns. Read explicit labels in their
// title/filename; never mistake an upload date for the year of an exam.
export function nationalExamMetadata(document, layout) {
  const text = normalize(`${document.title} ${document.originalName || ''}`);
  const year = text.match(/\b20\d{2}\b/)?.[0] || null;
  const examType = /minh hoa|tham khao/.test(text) ? 'illustrative'
    : /chinh thuc/.test(text) ? 'official' : 'trial';
  return {
    year, examType,
    // The shared exam room currently runs a 90-minute countdown.
    durationMinutes: 90,
    questionCount: document.questionIds?.length || layout?.totalQuestions || null,
  };
}

export function installNationalExamRoutes(app, { db, requireAuth, documentResponse, assessmentConfigFor }) {
  const catalog = async user => {
    const rows = await db.prepare(`SELECT d.*,ak.original_name AS answer_key_original_name,
      ak.question_ids AS answer_key_question_ids FROM documents d
      LEFT JOIN answer_keys ak ON ak.document_id=d.id
      WHERE d.category='exam' AND d.grade='12' ORDER BY d.uploaded_at DESC,d.id`).all();
    const legacy = rows.filter(row => SUBJECTS.includes(row.subject)).map(row => {
      const document = documentResponse(row);
      return { ...document, createdAt: row.uploaded_at, ...nationalExamMetadata(document, assessmentConfigFor(row.subject, row.category)?.layout) };
    });
    return [...await bankCatalog(db, user), ...legacy];
  };

  app.get('/api/national-exams', async (req, res, next) => {
    try {
      const documents = await catalog(req.user);
      const counts = await db.prepare("SELECT document_id,COUNT(*) AS count FROM exam_attempts WHERE category='exam' GROUP BY document_id").all();
      const attempts = req.user ? await db.prepare(`SELECT id,document_id,graded,score,scale,created_at
        FROM exam_attempts WHERE user_id=? AND category='exam' ORDER BY created_at DESC,id DESC`).all(req.user.id) : [];
      const available = new Set(documents.map(document => document.id));
      const ownAttempts = attempts.filter(attempt => available.has(attempt.document_id));
      const scoreOf = attempt => Number(attempt.graded) && attempt.score != null && Number(attempt.scale) > 0
        ? Number(attempt.score) / Number(attempt.scale) * 10 : null;
      const scores = ownAttempts.map(scoreOf).filter(score => score != null);
      const exams = documents.map(document => {
        const own = ownAttempts.filter(attempt => attempt.document_id === document.id);
        const best = own.map(scoreOf).filter(score => score != null);
        return { ...document, attemptCount: Number(counts.find(row => row.document_id === document.id)?.count || 0),
          completed: own.length > 0, lastCompletedAt: own[0]?.created_at || null, bestScore: best.length ? Math.max(...best) : null };
      });
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ exams, stats: { total: exams.length,
        completed: req.user ? new Set(ownAttempts.map(attempt => attempt.document_id)).size : null,
        average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null } });
    } catch (error) { next(error); }
  });

  app.get('/api/national-exams/:id/history', requireAuth, async (req, res, next) => {
    try {
      const documents = await catalog(req.user);
      if (!documents.some(document => document.id === req.params.id)) return res.status(404).json({ error: 'Không tìm thấy đề thi.' });
      // Answer keys remain behind the existing, authenticated result endpoint.
      const attempts = await db.prepare(`SELECT id,graded,score,scale,created_at FROM exam_attempts
        WHERE document_id=? AND user_id=? AND category='exam' ORDER BY id DESC`).all(req.params.id, req.user.id);
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ attempts: attempts.map(row => ({ id: Number(row.id), graded: Boolean(Number(row.graded)),
        score: row.score == null ? null : Number(row.score), scale: row.scale == null ? null : Number(row.scale), createdAt: row.created_at })) });
    } catch (error) { next(error); }
  });
}
