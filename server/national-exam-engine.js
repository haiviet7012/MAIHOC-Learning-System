import { nationalSubjects, cognitionLevels } from '../js/platform/national-exam-access.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const str = (value, max = 10000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function validateNationalExam(input) {
  if (!input || typeof input !== 'object') invalid('Thông tin đề thi không hợp lệ.');
  const title = str(input.title, 240), subject = str(input.subject, 40), year = String(input.year || '');
  if (!title || !nationalSubjects.includes(subject) || !/^20\d{2}$/.test(year)) invalid('Nhập tên đề, môn học và năm hợp lệ.');
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) invalid('Thời gian phải từ 1 đến 300 phút.');
  if (!['learn', 'school'].includes(input.access)) invalid('Chọn Free Learn hoặc Paid School.');
  if (!['illustrative', 'official', 'trial'].includes(input.examType)) invalid('Loại đề không hợp lệ.');
  if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 100) invalid('Đề cần từ 1 đến 100 câu hỏi.');
  const numbers = {};
  const questions = input.questions.map(q => {
    if (!['multiple_choice', 'true_false', 'short_answer'].includes(q.type)) invalid('Dạng câu hỏi không hợp lệ.');
    const sectionId = ({ multiple_choice: 'I', true_false: 'II', short_answer: 'III' })[q.type];
    const number = numbers[sectionId] = (numbers[sectionId] || 0) + 1;
    const base = { id: `${sectionId}-${number}`, answerId: `${sectionId}-${number}`, number: String(number), sectionId,
      sectionTitle: ({ I: 'Phần I · Trắc nghiệm A/B/C/D', II: 'Phần II · Đúng/Sai', III: 'Phần III · Trả lời ngắn' })[sectionId],
      type: q.type, text: str(q.text), level: q.level, points: Number(q.points), explanation: str(q.explanation) };
    if (!base.text || !base.explanation || !cognitionLevels.includes(base.level) || !Number.isFinite(base.points) || base.points <= 0 || base.points > 10) invalid('Mỗi câu cần nội dung, lời giải, mức độ nhận thức và điểm từ trên 0 đến 10.');
    if (q.type === 'multiple_choice') {
      base.options = ['A', 'B', 'C', 'D'].map(id => ({ id, text: str(q.options?.find(option => option.id === id)?.text, 3000) }));
      if (base.options.some(option => !option.text) || !['A', 'B', 'C', 'D'].includes(q.correctAnswer)) invalid('Nhập đủ bốn phương án và chọn đáp án đúng.');
      base.correctAnswer = q.correctAnswer;
    } else if (q.type === 'true_false') {
      base.statements = ['a', 'b', 'c', 'd'].map(id => ({ id, text: str(q.statements?.find(statement => statement.id === id)?.text, 3000) }));
      if (base.statements.some(statement => !statement.text) || base.statements.some(statement => typeof q.correctAnswer?.[statement.id] !== 'boolean')) invalid('Nhập đủ bốn ý Đúng/Sai và đáp án cho từng ý.');
      base.correctAnswer = Object.fromEntries(base.statements.map(statement => [statement.id, q.correctAnswer[statement.id]]));
    } else {
      base.correctAnswer = str(String(q.correctAnswer ?? ''), 32).replace(',', '.');
      if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(base.correctAnswer) || !Number.isFinite(Number(base.correctAnswer))) invalid('Đáp án trả lời ngắn phải là một số hữu hạn.');
    }
    return base;
  }).sort((a, b) => ['I', 'II', 'III'].indexOf(a.sectionId) - ['I', 'II', 'III'].indexOf(b.sectionId));
  if (Math.abs(questions.reduce((sum, q) => sum + q.points, 0) - 10) > .00001) invalid('Tổng điểm của các câu hỏi phải bằng 10.');
  return { title, subject, year, durationMinutes, access: input.access, examType: input.examType,
    examCode: str(input.examCode, 40), published: input.published !== false, questions };
}

export function publicNationalExam(exam) {
  return { id: exam.id, source: 'bank', category: 'exam', grade: '12', title: exam.title, subject: exam.subject,
    year: exam.year, durationMinutes: exam.durationMinutes, access: exam.access, examType: exam.examType,
    examCode: exam.examCode || exam.id, mock: Boolean(exam.mock), questionCount: exam.questions.length,
    questions: exam.questions.map(q => {
      const { correctAnswer, explanation, ...question } = q;
      return question;
    }) };
}

export function gradeNationalExam(exam, rawAnswers, timeSpentSeconds) {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) invalid('Bài làm không hợp lệ.');
  const answers = {}, sections = {}, levels = {};
  const results = exam.questions.map(q => {
    const keys = q.type === 'true_false' ? q.statements.map(s => `${q.id}${s.id}`) : [q.id];
    for (const key of keys) if (rawAnswers[key] != null) answers[key] = str(String(rawAnswers[key]), 100);
    let correct, blank, fraction;
    if (q.type === 'true_false') {
      const matched = q.statements.filter(s => answers[`${q.id}${s.id}`] === String(q.correctAnswer[s.id])).length;
      correct = matched === 4; blank = keys.every(key => !answers[key]);
      fraction = [0, .1, .25, .5, 1][matched];
    } else {
      const answer = answers[q.id] || '';
      blank = !answer;
      correct = !blank && (q.type === 'short_answer'
        ? /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(answer) && Math.abs(Number(answer.replace(',', '.')) - Number(q.correctAnswer)) < 1e-9
        : answer.toUpperCase() === q.correctAnswer);
      fraction = correct ? 1 : 0;
    }
    for (const [group, key] of [[sections, q.sectionTitle], [levels, q.level]]) {
      group[key] ||= { label: key, total: 0, correct: 0 };
      group[key].total++; if (correct) group[key].correct++;
    }
    return { ...q, correct, blank, earnedPoints: Math.round(q.points * fraction * 100) / 100 };
  });
  const score = Math.round(results.reduce((sum, q) => sum + q.earnedPoints, 0) * 100) / 100;
  const correctCount = results.filter(q => q.correct).length, blankCount = results.filter(q => q.blank).length;
  return { nationalExam: true, graded: true, title: exam.title, subject: exam.subject, examId: exam.id, mock: Boolean(exam.mock),
    score, scale: 10, correctCount, blankCount, incorrectCount: results.length - correctCount - blankCount,
    questionCount: results.length, percent: Math.round(score * 10), timeSpentSeconds, answers, questions: results,
    sections: Object.values(sections), levels: cognitionLevels.map(label => levels[label] || { label, total: 0, correct: 0 }) };
}
