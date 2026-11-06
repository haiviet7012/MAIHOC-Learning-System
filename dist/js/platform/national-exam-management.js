import { escapeHTML as e } from '../ui.js';
import { nationalSubjects, cognitionLevels } from './national-exam-access.js';
import { loadExamBank, saveBankExam } from './national-exam-api.js';
const defaults = type => ({ type, text: '', level: 'Nhận biết', points: 2.5, explanation: '',
  options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: '' })), statements: ['a', 'b', 'c', 'd'].map(id => ({ id, text: '' })),
  correctAnswer: type === 'true_false' ? { a: true, b: true, c: true, d: true } : type === 'short_answer' ? '' : 'A' });
const options = (values, selected) => values.map(value => `<option value="${e(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${e(value)}</option>`).join('');

export function mountNationalExamManagement(container, { onSaved }) {
  const controller = new AbortController();
  container.insertAdjacentHTML('beforeend', '<dialog class="modal national-editor" data-exam-editor aria-labelledby="exam-editor-title"></dialog>');
  const dialog = container.querySelector('[data-exam-editor]');
  let draft, exams = [], busy = false;
  const open = () => { if (!dialog.open) dialog.showModal(); };
  function questionMarkup(q, index) {
    const field = (key, label, value, required = true) => `<label>${label}<textarea name="q-${index}-${key}" ${required ? 'required' : ''} maxlength="10000">${e(value || '')}</textarea></label>`;
    const text = field('text', 'Nội dung câu hỏi (hỗ trợ LaTeX)', q.text);
    let answers;
    if (q.type === 'multiple_choice') answers = q.options.map(option => field(`option-${option.id}`, `Phương án ${option.id}`, option.text)).join('')
      + `<label>Đáp án đúng<select name="q-${index}-correct">${options(['A', 'B', 'C', 'D'], q.correctAnswer)}</select></label>`;
    else if (q.type === 'true_false') answers = q.statements.map(s => `${field(`statement-${s.id}`, `Ý ${s.id}`, s.text)}<label>Đáp án ý ${s.id}<select name="q-${index}-correct-${s.id}"><option value="true" ${q.correctAnswer[s.id] ? 'selected' : ''}>Đúng</option><option value="false" ${!q.correctAnswer[s.id] ? 'selected' : ''}>Sai</option></select></label>`).join('');
    else answers = `<label>Đáp án số<input name="q-${index}-correct" required value="${e(q.correctAnswer)}" inputmode="decimal"></label>`;
    return `<fieldset class="national-editor-question"><legend>Câu ${index + 1}</legend><div class="national-editor-grid"><label>Dạng câu<select name="q-${index}-type" data-editor-type="${index}">${[['multiple_choice', 'ABCD'], ['true_false', 'Đúng/Sai'], ['short_answer', 'Trả lời ngắn']].map(([value, label]) => `<option value="${value}" ${q.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Mức độ<select name="q-${index}-level">${options(cognitionLevels, q.level)}</select></label><label>Điểm<input name="q-${index}-points" type="number" step="0.01" min="0.01" max="10" required value="${q.points}"></label></div>${text}<div class="national-editor-grid">${answers}</div>${field('explanation', 'Lời giải chi tiết', q.explanation)}<button type="button" data-editor-remove="${index}">Xóa câu này</button></fieldset>`;
  }
  function readQuestions() {
    const data = new FormData(dialog.querySelector('form'));
    return draft.questions.map((q, i) => {
      const value = key => String(data.get(`q-${i}-${key}`) || '');
      const type = value('type');
      return { ...q, type, text: value('text'), level: value('level'), points: Number(value('points')), explanation: value('explanation'),
        options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: value(`option-${id}`) })),
        statements: ['a', 'b', 'c', 'd'].map(id => ({ id, text: value(`statement-${id}`) })),
        correctAnswer: type === 'true_false' ? Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, value(`correct-${id}`) === 'true'])) : value('correct') };
    });
  }
  const drawQuestions = () => { dialog.querySelector('[data-editor-questions]').innerHTML = draft.questions.map(questionMarkup).join(''); };
  function edit(exam) {
    draft = exam ? structuredClone(exam) : { title: '', subject: 'Toán', year: '2026', durationMinutes: 90, access: 'learn', examCode: '', examType: 'trial', published: true, questions: [defaults('multiple_choice')] };
    dialog.innerHTML = `<div class="national-exam-list-heading"><h2 id="exam-editor-title">${draft.id ? 'Chỉnh sửa đề thi' : 'Tạo đề thi mới'}</h2><button type="button" data-editor-close>Đóng</button></div><p class="muted">Tổng điểm các câu phải bằng 10. Bốn ý Đúng/Sai được chấm theo tỷ lệ 0 / 0,1 / 0,25 / 0,5 / 1 điểm tối đa.</p><form data-editor-form>
      <label>Tên đề<input name="title" required maxlength="240" value="${e(draft.title)}"></label><div class="national-editor-grid"><label>Môn học<select name="subject">${options(nationalSubjects, draft.subject)}</select></label><label>Năm<input name="year" type="number" min="2000" max="2099" value="${draft.year}" required></label><label>Thời gian (phút)<input name="durationMinutes" type="number" min="1" max="300" value="${draft.durationMinutes}" required></label><label>Gói học<select name="access"><option value="learn" ${draft.access === 'learn' ? 'selected' : ''}>Free Learn</option><option value="school" ${draft.access === 'school' ? 'selected' : ''}>Paid School</option></select></label><label>Mã đề<input name="examCode" maxlength="40" value="${e(draft.examCode || '')}"></label><label>Loại đề<select name="examType">${[['illustrative', 'Đề minh họa Bộ GD&ĐT'], ['official', 'Đề chính thức'], ['trial', 'Đề thi thử các trường/Sở']].map(([value, label]) => `<option value="${value}" ${draft.examType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Trạng thái<select name="published"><option value="true" ${draft.published ? 'selected' : ''}>Xuất bản</option><option value="false" ${!draft.published ? 'selected' : ''}>Bản nháp</option></select></label></div>
      <div data-editor-questions></div><button type="button" data-editor-add>+ Thêm câu hỏi</button><p role="alert" data-editor-status></p><button class="button primary" type="submit">Lưu đề thi</button></form>`;
    drawQuestions(); open();
  }
  async function bank() {
    open(); dialog.innerHTML = '<h2 id="exam-editor-title">Quản lý ngân hàng đề</h2><p role="status">Đang tải…</p>';
    try {
      const data = await loadExamBank(controller.signal);
      if (controller.signal.aborted) return;
      exams = data.exams;
      dialog.innerHTML = `<div class="national-exam-list-heading"><h2 id="exam-editor-title">Quản lý ngân hàng đề</h2><button type="button" data-editor-close>Đóng</button></div><p class="muted">Teacher chỉnh sửa đề do mình tạo. Admin quản lý toàn bộ ngân hàng.</p><button type="button" data-editor-new>+ Tạo đề thi mới</button>${exams.length ? exams.map(exam => `<article class="national-exam-attempt"><div><strong>${e(exam.title)}</strong><p>${e(exam.subject)} · ${e(exam.access)} · ${exam.published ? 'Đã xuất bản' : 'Bản nháp'}</p></div><button type="button" data-editor-edit="${e(exam.id)}">Chỉnh sửa</button></article>`).join('') : '<p>Bạn chưa tạo đề thi nào.</p>'}`;
    } catch (error) { if (!controller.signal.aborted) dialog.innerHTML = `<h2 id="exam-editor-title">Chưa tải được ngân hàng</h2><p role="alert">${e(error.message)}</p><button type="button" data-editor-close>Đóng</button>`; }
  }
  async function submit(event) {
    if (!event.target.matches('[data-editor-form]')) return;
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.target), payload = { ...draft, questions: readQuestions() };
    for (const key of ['title', 'subject', 'year', 'access', 'examCode', 'examType']) payload[key] = String(data.get(key));
    payload.durationMinutes = Number(data.get('durationMinutes')); payload.published = data.get('published') === 'true';
    busy = true; const button = event.target.querySelector('[type=submit]'); button.disabled = true;
    try { await saveBankExam(payload, controller.signal); dialog.close(); onSaved(); }
    catch (error) { if (!controller.signal.aborted) dialog.querySelector('[data-editor-status]').textContent = error.message; }
    finally { busy = false; button.disabled = false; }
  }
  function click(event) {
    if (busy) return;
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-editor-close')) dialog.close();
    if (button.hasAttribute('data-editor-new')) edit();
    if (button.hasAttribute('data-editor-edit')) edit(exams.find(exam => exam.id === button.dataset.editorEdit));
    if (button.hasAttribute('data-editor-add')) { draft.questions = [...readQuestions(), defaults('multiple_choice')]; drawQuestions(); }
    if (button.hasAttribute('data-editor-remove')) { draft.questions = readQuestions(); draft.questions.splice(Number(button.dataset.editorRemove), 1); drawQuestions(); }
  }
  function change(event) {
    if (!event.target.hasAttribute('data-editor-type')) return;
    draft.questions = readQuestions(); const index = Number(event.target.dataset.editorType);
    draft.questions[index] = { ...draft.questions[index], ...defaults(event.target.value), text: draft.questions[index].text, explanation: draft.questions[index].explanation, points: draft.questions[index].points };
    drawQuestions();
  }
  dialog.addEventListener('click', click); dialog.addEventListener('change', change); dialog.addEventListener('submit', submit);
  return { newExam: () => edit(), openBank: bank, dispose() { controller.abort(); dialog.close(); dialog.remove(); } };
}
