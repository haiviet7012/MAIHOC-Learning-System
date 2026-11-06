import { escapeHTML as e } from '../ui.js';
import { loadNationalResult } from './national-exam-api.js';
const answerText = value => Array.isArray(value) ? value.join(' / ') : typeof value === 'object' && value ? Object.entries(value).map(([key, answer]) => `${key}: ${answer === true || answer === 'true' ? 'Đúng' : answer === false || answer === 'false' ? 'Sai' : 'Bỏ trống'}`).join(' · ') : String(value ?? 'Bỏ trống');

export function normalizeExamResult(result, document = {}, answers = {}) {
  if (result.nationalExam) return result;
  const questions = (result.questions || result.results || []).map((row, index) => ({ ...row, id: row.id || row.question || row.questionId || String(index + 1), text: row.text || row.label || `Câu ${index + 1}`,
    type: row.type || 'short_answer', correct: Boolean(row.correct), blank: row.blank ?? (row.type === 'true_false' ? (row.statements || []).every(s => !String(s.userAnswer || '').trim()) : !String(row.userAnswer ?? row.studentAnswer ?? answers[row.question] ?? '').trim()),
    correctAnswer: row.correctAnswer ?? row.expectedAnswer, points: row.maxPoints || row.points || row.totalPoints || 0, earnedPoints: row.earnedPoints || 0,
    explanation: row.explanation || 'Tài liệu này chưa có lời giải chi tiết trong ngân hàng đề.' }));
  const combined = { ...answers, ...(result.answers || {}) };
  for (const row of result.results || []) if (row.userAnswer != null) combined[row.question] = String(row.userAnswer);
  for (const q of questions) {
    if (q.type !== 'true_false' || q.correctAnswer || !q.statements?.length || q.statements.some(s => !s.expectedAnswer?.length)) continue;
    q.correctAnswer = Object.fromEntries(q.statements.map(s => [s.statement, ['true', 'đúng', 'dung', 'd', 't'].includes(String(s.expectedAnswer[0]).toLowerCase())]));
    q.statements = q.statements.map(s => {
      combined[`${q.id}${s.statement}`] = String(s.userAnswer || '');
      return { id: s.statement, text: `Ý ${s.statement} trong đề gốc` };
    });
  }
  return { ...result, scale: 10, score: result.score == null ? null : Math.round(Number(result.score) / (Number(result.scale) || 10) * 1000) / 100, title: result.title || document.title, subject: result.subject || document.subject, examId: result.examId || document.id,
    answers: combined, questions, blankCount: questions.filter(q => q.blank).length,
    incorrectCount: questions.filter(q => !q.correct && !q.blank).length, sections: result.sections || [], levels: result.levels || [] };
}
function breakdown(rows) {
  return rows.length ? rows.map(row => `<div class="exam-breakdown-row"><div><span>${e(row.label)}</span><strong>${row.correct}/${row.total}${row.total ? ` · ${Math.round(row.correct / row.total * 100)}%` : ''}</strong></div><progress max="${row.total || 1}" value="${row.correct}" aria-label="Tỷ lệ đúng ${e(row.label)}"></progress></div>`).join('') : '<p class="muted">Đề tài liệu chưa có metadata để phân tích mục này.</p>';
}
function review(q, answers) {
  const choice = answers[q.id], status = q.blank ? 'Bỏ trống' : q.correct ? 'Đúng' : 'Sai / chưa đúng toàn bộ';
  let body;
  if (q.type === 'multiple_choice' && q.options?.length) body = (q.options || []).map(option => `<div class="exam-review-option ${option.id === q.correctAnswer ? 'is-correct' : choice === option.id ? 'is-incorrect' : ''}"><strong>${e(option.id)}</strong> ${e(option.text)} ${option.id === q.correctAnswer ? '✓ Đáp án đúng' : choice === option.id ? '✗ Bạn đã chọn' : ''}</div>`).join('');
  else if (q.type === 'true_false' && q.correctAnswer && !Array.isArray(q.correctAnswer)) body = (q.statements || []).map(s => {
    const selected = answers[`${q.id}${s.id}`], correct = String(q.correctAnswer[s.id]);
    return `<div class="exam-review-option"><p>${e(s.id)}) ${e(s.text)}</p><span class="${selected === correct ? 'answer-correct' : selected ? 'answer-incorrect' : 'muted'}">Bạn chọn: ${selected === 'true' ? 'Đúng' : selected === 'false' ? 'Sai' : 'Bỏ trống'}</span> · <strong class="answer-correct">Đáp án: ${q.correctAnswer[s.id] ? 'Đúng' : 'Sai'}</strong></div>`;
  }).join('');
  else body = `<p class="${q.correct ? 'answer-correct' : q.blank ? 'muted' : 'answer-incorrect'}">Bài làm: ${e(answerText(choice))}</p><p class="answer-correct">Đáp án đúng: ${e(answerText(q.correctAnswer))}</p>`;
  return `<article class="exam-review-card"><div class="national-exam-list-heading"><h3>${e(q.id)} · ${e(q.level || '')}</h3><strong class="${q.correct ? 'answer-correct' : q.blank ? 'muted' : 'answer-incorrect'}">${status} · ${Number(q.earnedPoints || 0).toFixed(2)}/${Number(q.points || 0).toFixed(2)}</strong></div><p class="exam-review-stem">${e(q.text)}</p>${body}<details open><summary>Lời giải chi tiết</summary><p>${e(q.explanation)}</p></details><button type="button" class="button secondary" data-result-ai="${e(q.id)}">Hỏi Gia sư AI về câu này</button></article>`;
}
export function mountExamResult(container, { result: initial, attemptId, user, onAI, onBack }) {
  const controller = new AbortController(); let result;
  const mathScript = window.document.querySelector('script[src*="mathjax"]');
  function typeset() {
    const math = window.MathJax;
    if (math?.typesetPromise) Promise.resolve(math.startup?.promise).then(() => { if (!controller.signal.aborted) return math.typesetPromise([container]); }).catch(() => {});
  }
  async function load() {
    container.innerHTML = '<p role="status">Đang tải kết quả bài làm…</p>';
    try {
      const data = initial || (attemptId ? await loadNationalResult(attemptId, controller.signal) : null);
      if (controller.signal.aborted) return;
      if (!data) throw new Error('Kết quả khách chưa được lưu. Hãy quay lại kho đề để bắt đầu.');
      result = normalizeExamResult(data);
      const seconds = Number(result.timeSpentSeconds || 0);
      container.innerHTML = `<section class="exam-result-view"><header class="portal-heading"><div><p class="eyebrow">MAIHOC • KẾT QUẢ LUYỆN ĐỀ THPT</p><h1>Kết quả bài làm</h1><p class="muted">${e(result.title || 'Đề thi THPT')} ${result.mock ? '· Đề mẫu kiểm thử' : ''}</p></div><button type="button" class="button secondary" data-result-back>← Về Kho Đề Thi THPT Quốc Gia</button></header>
        <section class="exam-result-summary"><div><span>ĐIỂM TỔNG KẾT</span><strong class="exam-result-score">${result.graded === false ? 'Chờ chấm' : Number(result.score || 0).toFixed(2)}<small>/10</small></strong></div><div class="exam-result-counts"><span class="answer-correct">Đúng <strong>${result.correctCount || 0}</strong></span><span class="answer-incorrect">Sai <strong>${result.incorrectCount || 0}</strong></span><span>Bỏ trống <strong>${result.blankCount || 0}</strong></span><span>Thời gian <strong>${Math.floor(seconds / 60)} phút ${seconds % 60} giây</strong></span></div></section>
        <p class="muted">${result.saved || result.attemptId ? 'Bài làm đã lưu vào Tiến trình học tập và Hoạt động gần đây.' : 'Kết quả khách được giữ trong phiên trình duyệt. Đăng nhập trước khi làm bài để lưu lịch sử vào tài khoản.'}</p>
        <div class="exam-result-charts"><section class="exam-result-panel"><h2>Tỷ lệ đúng theo từng phần</h2>${breakdown(result.sections)}</section><section class="exam-result-panel"><h2>Mức độ nhận thức</h2>${breakdown(result.levels)}</section></div>
        <h2>Xem lại bài làm &amp; lời giải</h2><div>${result.questions.length ? result.questions.map(q => review(q, result.answers || {})).join('') : `<p class="muted">${e(result.message || 'Đề này chưa có dữ liệu đối chiếu câu hỏi.')}</p>`}</div></section>`;
      typeset();
    } catch (error) {
      if (!controller.signal.aborted) container.innerHTML = `<section class="exam-result-view"><h1>Chưa tải được kết quả</h1><p role="alert">${e(error.message)}</p><button type="button" data-result-back>← Về kho đề</button></section>`;
    }
  }
  function click(event) {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-result-back')) onBack();
    if (button.hasAttribute('data-result-ai')) {
      const q = result.questions.find(q => q.id === button.dataset.resultAi);
      if (q) onAI(`${result.subject} · ${result.title}\nCâu ${q.id}: ${q.text}\n${(q.options || q.statements || []).map(item => `${item.id}) ${item.text}`).join('\n')}\nBài làm của tôi: ${answerText(q.type === 'true_false' ? Object.fromEntries(q.statements.map(s => [s.id, result.answers[`${q.id}${s.id}`]])) : result.answers[q.id])}\nĐáp án chuẩn: ${answerText(q.correctAnswer)}\nHãy giải thích từng bước và giúp tôi hiểu lỗi sai.`);
    }
  }
  container.addEventListener('click', click); mathScript?.addEventListener('load', typeset); load();
  return () => { controller.abort(); container.removeEventListener('click', click); mathScript?.removeEventListener('load', typeset); window.MathJax?.typesetClear?.([container]); };
}
