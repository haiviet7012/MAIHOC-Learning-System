import { api } from './api.js';
import { loadNationalExams } from './national-exam-api.js';
import { extractDocxText } from '../question-parser.js';

export async function loadExamRoom(examId, signal, cachedDocument, sessionId) {
  const [catalog, config] = await Promise.all([
    cachedDocument ? Promise.resolve({ exams: [cachedDocument] }) : loadNationalExams(signal),
    api('/configs/exam-layouts.json', { signal }),
  ]);
  const document = catalog.exams.find(item => String(item.id) === String(examId));
  if (!document) throw new Error('Không tìm thấy đề thi trong Kho Đề Thi THPT Quốc Gia.');
  if (document.locked) throw new Error('Đề này yêu cầu gói Paid School.');
  if (document.source === 'bank') {
    const session = await api(`/api/national-exams/${encodeURIComponent(examId)}/sessions`, { method: 'POST', body: { sessionId }, signal });
    return { document: session.document, layout: null, session };
  }
  const profile = config.subjects?.[document.subject];
  return { document, layout: profile?.exam || profile?.assessment || null };
}

export async function loadExamText(document, signal) {
  const name = document.originalName || document.filename || '';
  if (!/\.(txt|docx)$/i.test(name) || !document.fileUrl) return null;
  const response = await fetch(document.fileUrl, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('Chưa đọc được nội dung đề. Hãy thử tải lại đề gốc.');
  return /\.docx$/i.test(name) ? extractDocxText(await response.arrayBuffer()) : response.text();
}

export const submitRoomExam = (id, answers, signal, details = {}) => api(details.sessionId ? `/api/national-exams/${encodeURIComponent(id)}/submit` : `/api/exams/${encodeURIComponent(id)}/submit`, {
  method: 'POST', body: { answers, ...details }, signal,
});
