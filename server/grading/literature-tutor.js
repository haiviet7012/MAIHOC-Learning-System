import { createLiteratureGenerator } from './literature-ai.js';
import { literatureTargets, gradeLiteratureSubmission } from './literature-engine.js';
import { generateSchool } from '../school-upgrade/ai.js';

export function installLiteratureTutor(app, { requireAuth, requireSameOrigin, generate = createLiteratureGenerator(), readImage = generateSchool }) {
  const windows = new Map();
  function limit(req, res, next) {
    res.setHeader('Cache-Control', 'private, no-store');
    const now = Date.now();
    for (const [key, row] of windows) if (row.until <= now) windows.delete(key);
    const key = String(req.user.id);
    const row = windows.get(key) || { until: now + 60000, count: 0 };
    windows.set(key, row);
    if (++row.count > 6) return res.status(429).json({ error: 'Vui lòng chờ một phút trước khi thử lại.' });
    next();
  }
  app.post('/api/literature/transcribe', requireSameOrigin, requireAuth, limit, async (req, res) => {
    const { image } = req.body || {};
    const match = typeof image === 'string' && image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Chọn ảnh JPG, PNG hoặc WebP tối đa 6 MB.' });
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : match[1] === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!valid) return res.status(400).json({ error: 'Nội dung ảnh không hợp lệ.' });
    try {
      const result = await readImage({ kind: 'notebook', subject: 'Ngữ văn', file: { mimeType: match[1], bytes } });
      if (typeof result.transcript !== 'string' || !result.transcript.trim() || result.transcript.length > 30000) throw new Error();
      res.json({ text: result.transcript, warnings: Array.isArray(result.warnings) ? result.warnings.filter(x => typeof x === 'string').slice(0,20) : [] });
    } catch { res.status(503).json({ error: 'Chưa đọc được ảnh. Kiểm tra AI tài liệu trên backend hoặc nhập bản chép thủ công.' }); }
  });
  app.post('/api/literature/tutor', requireSameOrigin, requireAuth, limit, async (req, res) => {
    const { prompt, answer, kind, confirmed } = req.body || {};
    if (!['II-1','II-2'].includes(kind) || confirmed !== true || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000 || typeof answer !== 'string' || !answer.trim() || answer.length > 30000) return res.status(400).json({ error: 'Nhập đề và bài làm (đề tối đa 12000 ký tự, bài làm tối đa 30000 ký tự), chọn loại bài và xác nhận nội dung.' });
    // Server owns rubric. This personal practice prompt is not a teacher-approved examination.
    const targets = literatureTargets();
    const exam = { schemaVersion: 1, reviewStatus: 'draft', passage: prompt, source: 'Bài luyện cá nhân; chưa được giáo viên duyệt', questions: targets.map(t => ({ targetId: t.targetId, questionText: t.targetId === kind ? prompt : 'Không làm trong lượt luyện này.', guidance: t.criteria.map(c => `${c.label}: tối đa ${c.maxPoints} điểm`).join('; '), context: 'Chấm luyện tập theo yêu cầu đã cung cấp. Nếu thiếu ngữ liệu để đánh giá, báo thiếu căn cứ; không bịa tác phẩm hoặc dẫn chứng.' })) };
    const grade = await gradeLiteratureSubmission({ exam, answers: { [kind]: answer }, generate, requireReviewed: false });
    const result = grade.results?.find(r => r.question === kind);
    res.status(grade.gradingStatus === 'provisional' ? 200 : 202).json({ gradingStatus: grade.gradingStatus, message: grade.message, score: null, proposedScore: grade.gradingStatus === 'provisional' ? result?.earnedPoints : null, maximumPoints: targets.find(t => t.targetId === kind).maximumPoints, result });
  });
}
