import { applyQuestionLayout, parseQuestionText } from '../question-parser.js';

export const answerKey = question => String(question.answerId || question.id);
export const secondsRemaining = (deadline, now = Date.now()) => Math.max(0, Math.ceil((deadline - now) / 1000));
export const numericAnswer = value => /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(String(value ?? '').trim());
export const draftKey = (userId, examId) => `maihoc:exam-room:${userId ?? 'guest'}:${examId}`;

export function roomQuestions(document, layout, source) {
  const parsed = source ?? document.questions ?? parseQuestionText(document.content || '');
  const normalized = document.source === 'bank' ? parsed : applyQuestionLayout(parsed, layout, { fillMissing: !parsed.length || parsed.length > 15 });
  return normalized.map(question => ({
    ...question,
    sectionId: question.sectionId || (question.layoutSectionOrder ? String(question.answerId || question.id).split('-')[0] : ''),
    isNumeric: question.type === 'short_answer' || (question.type === 'essay'
      && /trả lời ngắn/i.test(question.layoutSectionTitle || question.sectionTitle || '')),
  }));
}

export function questionAnswered(question, answers) {
  const id = answerKey(question);
  if (question.type === 'true_false') return (question.statements?.length ? question.statements : ['a', 'b', 'c', 'd'].map(id => ({ id })))
    .every(statement => ['true', 'false'].includes(answers[`${id}${statement.id}`]));
  if (question.type === 'multiple_choice') return (question.options?.length ? question.options : ['A', 'B', 'C', 'D'].map(id => ({ id })))
    .some(option => option.id === answers[id]);
  return question.isNumeric ? numericAnswer(answers[id]) : Boolean(String(answers[id] ?? '').trim());
}

export function questionGroups(questions) {
  const groups = new Map();
  for (const question of questions) {
    const key = String(question.layoutSectionOrder || question.sectionId || question.type);
    if (!groups.has(key)) groups.set(key, { key, title: question.layoutSectionTitle || question.sectionTitle
      || ({ multiple_choice: 'Phần I · Trắc nghiệm A/B/C/D', true_false: 'Phần II · Đúng/Sai', essay: 'Phần III · Trả lời ngắn', short_answer: 'Phần III · Trả lời ngắn' })[question.type], questions: [] });
    groups.get(key).questions.push(question);
  }
  return [...groups.values()];
}

export function readRoomDraft(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (!value || !Number.isFinite(value.deadline) || value.deadline <= 0 || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return null;
    return { deadline: value.deadline, ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}), answers: Object.fromEntries(Object.entries(value.answers)
      .filter(([, answer]) => typeof answer === 'string').map(([id, answer]) => [id, answer.slice(0, 10000)])),
      flags: Array.isArray(value.flags) ? value.flags.filter(id => typeof id === 'string') : [],
      mode: value.mode === 'single' ? 'single' : 'all', activeId: typeof value.activeId === 'string' ? value.activeId : null };
  } catch { return null; }
}
