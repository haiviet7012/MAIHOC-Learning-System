import { createQuestionBankRepository } from './question-bank-storage.js';
import { CONTENT_DATE_OPTIONS, CONTENT_STATE_OPTIONS, isContentCompleted, contentTimestamp } from './content-filters.js';
import { escapeHTML as e } from '../ui.js';
import { renderQuestionMath } from './question-bank-math.js';
import { LEVELS, TYPES, SUBJECTS, GRADES, filterQuestions, needsReview, validateQuestion, extractMatrix, buildExam, generateVariants, uniqueQuestions, questionFingerprint } from './question-bank-model.js';

const icons = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  import: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
  crown: '<path d="m3 6 4 4 5-7 5 7 4-4-3 13H6zM6 22h12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  edit: '<path d="m4 16-1 5 5-1L21 7l-5-5zM13 5l6 6"/>',
  basket: '<path d="m8 3-5 8m13-8 5 8M2 11h20l-3 10H5zM9 14v4m6-4v4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const btn = (action, label, name = '', cls = '', extra = '') => `<button type="button" class="qb-btn ${cls}" data-qb-action="${action}" ${extra}>${name ? icon(name) : ''}${label}</button>`;
const options = (items, selected, all) => `${all !== undefined ? `<option value="">${all}</option>` : ''}${(Array.isArray(items) ? items.map(x => [x, x]) : Object.entries(items)).map(([value, label]) => `<option value="${e(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${e(label)}</option>`).join('')}`;
const gradeLabels = Object.fromEntries(GRADES.map(g => [g, /^\d+$/.test(g) ? `Lớp ${g}` : g === 'THPT' ? 'Ôn thi THPT Quốc gia' : 'IELTS']));
const fieldSelect = (name, label, values, selected, all) => `<label class="qb-field"><span>${label}</span><select name="${name}">${options(values, selected, all)}</select></label>`;
const levelBadge = level => `<span class="qb-badge qb-level-${e(level)}"><i></i>${e(LEVELS[level])}</span>`;
const answerText = q => q.type === 'multiple_choice' ? q.choices[q.answer] : q.type === 'true_false' ? q.answer.map(x => x ? 'Đúng' : 'Sai').join(' · ') : q.answer;
function answers(q) {
  if (q.type === 'true_false') return `<div class="qb-statements" role="table" aria-label="Mệnh đề và đáp án">${q.choices.map((text, i) => `<div role="row"><span class="qb-option-letter">${'abcd'[i]}</span><span role="cell">${e(text)}</span><span class="qb-truth ${q.answer[i] ? 'is-true' : ''}" role="cell">${q.answer[i] ? 'Đúng' : 'Sai'}</span></div>`).join('')}</div>`;
  if (q.type === 'multiple_choice') return `<div class="qb-answers">${q.choices.map((text, i) => `<div class="qb-answer ${q.answer === i ? 'is-correct' : ''}"><span class="qb-option-letter">${'ABCD'[i]}</span><span>${e(text)}</span>${q.answer === i ? icon('check') : ''}</div>`).join('')}</div>`;
  return `<div class="qb-short-answer"><span>${q.type === 'essay' ? 'HƯỚNG DẪN CHẤM' : 'ĐÁP SỐ CHUẨN'}</span><strong>${e(q.answer)}</strong></div>`;
}
export function downloadExam(exam) {
  const blob = new Blob([JSON.stringify(exam, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'maihoc-de-kiem-tra.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const examDraftKey = userId => `maihoc:question-bank:exam:${userId}`;
export function readExamDraft(userId) {
  try {
    const draft = JSON.parse(localStorage.getItem(examDraftKey(userId)) || 'null');
    if (draft?.version !== 1 || !Array.isArray(draft.variants) || !draft.variants.length || draft.variants.length > 20) return null;
    for (const variant of draft.variants) {
      if (!Array.isArray(variant.questions) || !variant.questions.length) return null;
      variant.questions.forEach(validateQuestion);
    }
    return draft;
  } catch { return null; }
}

export function mountQuestionBank(container, user, onNavigate, { repository = createQuestionBankRepository(user.id) } = {}) {
  const events = new AbortController(), timers = new Set();
  let questions = [], filters = { tab: 'school', search: '', subject: '', grade: '', type: '', level: '', dateOrder: 'newest', completion: 'unanswered-first' }, selected = new Set();
  let pro = true, activeModal = '', editing = null, exam = readExamDraft(user.id), disposed = false, trigger = null;
  const busy = new Set();
  let history = new Map(), historyFailed = false;
  const canReview = user.isSuperAdmin || user.isTeacher || ['teacher', 'admin', 'school_admin'].includes(user.role);
  const find = selector => container.querySelector(selector);
  const later = (fn, ms = 650) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); };
  const announce = message => { const el = find('[data-qb-status]'); if (el) el.textContent = message; };
  const persisted = ok => ok ? 'Đã lưu câu hỏi.' : 'Đã lưu trong phiên này; trình duyệt không cho phép lưu lâu dài.';
  function math(root) {
    if (!disposed) renderQuestionMath(root);
  }
  function paywall(inline = false) {
    return `<section class="qb-paywall ${inline ? 'is-inline' : ''}"><div class="qb-paywall-symbol">${icon('crown')}</div><span class="qb-overline">DÀNH CHO NHỮNG NGƯỜI TRUYỀN CẢM HỨNG</span><h2>Một kho tri thức.<br>Vô hạn khả năng giảng dạy.</h2><p>Nâng cấp <strong>MAIHOC School Pro</strong> để nhà trường và giáo viên có thêm thời gian đồng hành cùng học sinh.</p><div class="qb-benefits"><span>${icon('shield')} Kho chuẩn hóa dùng chung toàn trường</span><span>${icon('grid')} Tạo đề tự động theo ma trận GDPT 2018</span><span>${icon('spark')} Nhân bản AI & phân tích độ khó thực tế</span></div><div class="qb-actions">${btn('plans', 'Khám phá School Pro', 'arrow', 'qb-primary')}${inline ? btn('personal', 'Tiếp tục với kho cá nhân') : ''}</div><small>Đây là chế độ xem trước Free. Công tắc thử nghiệm không thay đổi gói tài khoản thật.</small></section>`;
  }
  function card(q) {
    const id = e(q.id), checked = selected.has(q.id);
    return `<article class="qb-card ${checked ? 'is-selected' : ''}" data-qb-card="${id}">
      <div class="qb-card-header"><div class="qb-card-tags">${q.status === 'approved' ? `<input type="checkbox" class="qb-checkbox" data-qb-select="${id}" aria-label="Chọn câu ${id}" ${checked ? 'checked' : ''}>` : ''}<span class="qb-code">#${id}</span><span class="qb-type-tag">${historyFailed ? 'Chưa tải được lịch sử' : isContentCompleted(q) ? 'Đã làm' : 'Chưa làm'}</span>${!historyFailed && contentTimestamp(q.lastCompletedAt) !== null ? `<span class="qb-type-tag">Làm gần nhất: ${e(new Date(contentTimestamp(q.lastCompletedAt)).toLocaleString('vi-VN'))}</span>` : ''}<span class="qb-type-tag">Ngày thêm: ${e(contentTimestamp(q.createdAt) === null ? 'Chưa ghi nhận' : new Date(contentTimestamp(q.createdAt)).toLocaleString('vi-VN'))}</span><span class="qb-subject-tag">${e(q.subject)} ${e(q.grade)} <span>· ${e(q.topic)}</span></span><span class="qb-type-tag">${q.type === 'true_false' ? 'Đúng/Sai 4 ý' : q.type === 'multiple_choice' ? '4 lựa chọn' : e(TYPES[q.type])}</span>${levelBadge(q.level)}</div><span class="qb-analytics">${q.attempts ? `<span class="qb-analytics-dot"></span>Tỷ lệ đúng: <strong>${q.rate}%</strong> <span>(${q.attempts} lượt làm)</span>` : 'Chưa có lượt làm'}</span></div>
      ${needsReview(q) ? `<div class="qb-warning">${icon('alert')} Cần rà soát độ khó <span>· Tỷ lệ làm đúng thấp hơn kỳ vọng ở mức Nhận biết</span></div>` : ''}
      <div class="qb-card-body"><p class="qb-stem">${e(q.stem)}</p>${answers(q)}<details class="qb-solution"><summary>Xem lời giải chi tiết & Hướng dẫn chấm <span>⌄</span></summary><div>${e(q.solution || 'Chưa có lời giải chi tiết. Giáo viên có thể bổ sung trong Chỉnh sửa.')}</div></details></div>
      <footer class="qb-card-footer"><div class="qb-author"><span class="qb-avatar">${e(q.author?.split(' ').slice(-2).map(x => x[0]).join('') || 'MH')}</span><span>${e(q.author)}<small>${q.status === 'approved' ? `${icon('check')} ${q.autoSaved ? 'Đã lưu tự động vào ngân hàng' : `Đã duyệt bởi ${e(q.reviewer)}`}` : 'Bản nháp · Chờ kiểm duyệt'}${q.uses ? ` <span>· Đã dùng trong ${q.uses} đề</span>` : ''}</small></span></div><div class="qb-actions">${`${q.status === 'approved' && canReview ? btn('clone', busy.has(q.id) ? 'Đang tạo biến thể…' : 'Nhân bản AI', 'spark', 'qb-ai', `data-id="${id}" ${busy.has(q.id) ? 'disabled' : ''}`) : canReview ? btn('approve', 'Duyệt câu hỏi', 'check', '', `data-id="${id}"`) : ''}${btn('edit', 'Chỉnh sửa', 'edit', '', `data-id="${id}"`)}${canReview && repository.remove ? btn('delete', 'Xóa câu hỏi', 'trash', '', `data-id="${id}"`) : ''}${q.status === 'approved' ? btn('select', checked ? 'Đã thêm vào đề' : 'Đưa vào bài kiểm tra', checked ? 'check' : 'basket', checked ? 'qb-added' : '', `data-id="${id}" aria-pressed="${checked}"`) : ''}`}</div></footer>
    </article>`;
  }
  function renderList() {
    const rows = filterQuestions(questions, filters, user.id), locked = !pro && ['school', 'pro', 'pending'].includes(filters.tab);
    find('[data-qb-results]').innerHTML = locked ? paywall(true) : rows.length ? rows.map(q => card(q)).join('') : `<div class="qb-empty">${icon('search')}<h3>Chưa tìm thấy câu hỏi phù hợp</h3><p>Thử thay đổi từ khóa, bộ lọc hoặc thêm một câu hỏi mới.</p>${btn('reset', 'Xóa bộ lọc')}${btn('add', 'Thêm câu hỏi', '', 'qb-primary')}</div>`;
    find('[data-qb-count]').textContent = locked ? 'Kho dùng chung · School Pro' : `${rows.length} câu hỏi · Đã lọc trùng`;
    const pendingTab = find('[data-qb-tab="pending"]'); if (pendingTab) pendingTab.innerHTML = `Chờ kiểm duyệt <b>${questions.filter(q => q.status === 'draft' && q.bank === 'school').length}</b>`;
    const schoolCount = uniqueQuestions(questions.filter(q => q.status === 'approved' && q.bank === 'school')).length;
    const approved = uniqueQuestions(questions.filter(q => q.status === 'approved'));
    find('[data-qb-kpi="total"]').textContent = approved.length;
    find('[data-qb-kpi="school"]').textContent = schoolCount;
    find('[data-qb-kpi="ai"]').textContent = uniqueQuestions(questions.filter(q => q.ai && q.status === 'approved')).length;
    find('[data-qb-kpi="warn"]').textContent = approved.filter(needsReview).length;
    find('[data-qb-solution-rate]').textContent = `${schoolCount ? Math.round(uniqueQuestions(questions.filter(q => q.status === 'approved' && q.bank === 'school' && q.solution)).length / schoolCount * 100) : 0}% đã có lời giải chi tiết`;
    renderBasket(); math(find('[data-qb-results]'));
  }
  function renderBasket() {
    const rows = uniqueQuestions(questions.filter(q => selected.has(q.id))), target = find('[data-qb-basket]');
    target.hidden = !rows.length;
    target.innerHTML = `<div class="qb-basket-count">${icon('basket')}<div><strong>Đã chọn: ${rows.length} câu hỏi</strong><small>${Object.keys(LEVELS).map(k => `${k.toUpperCase()}: ${rows.filter(q => q.level === k).length}`).join(' <span>│</span> ')}</small></div></div><div class="qb-actions">${btn('clear', 'Bỏ chọn tất cả', '', 'qb-text')}${btn('shuffle', 'Trộn mã đề tự động', 'grid')}${btn('export', 'Xuất sang Kiểm tra & Luyện thi', 'arrow', 'qb-primary')}</div>`;
    container.classList.toggle('qb-has-basket', !!rows.length);
  }
  function shell() {
    container.classList.add('qb-workspace');
    container.innerHTML = `<div class="qb-topline"><div class="qb-brand-label">MAIHOC <span>•</span> SCHOOL & LEARNING <span class="qb-pro-badge">${icon('spark')} PRO FEATURE</span></div></div>
      <header class="qb-workspace-header"><div><h1>Ngân hàng câu hỏi <span>& Ma trận đề</span></h1><p>Quản lý, chuẩn hóa câu hỏi theo chương trình GDPT 2018, nhân bản câu hỏi bằng AI và tự động rút trích đề kiểm tra.</p></div><div class="qb-actions">${btn('import', 'Nhập từ Số hóa đề AI', 'import')}${btn('matrix', 'Tạo đề theo Ma trận', 'grid')}${btn('add', 'Thêm câu hỏi mới', '', 'qb-primary qb-add')}</div></header>
      <section class="qb-kpis" aria-label="Thống kê ngân hàng câu hỏi">${[
        ['total', 'Tổng câu hỏi khả dụng', 'câu', '8 câu mẫu được biên soạn sẵn', 'book', 'purple'],
        ['school', 'Kho chuẩn hóa Nhà trường', 'câu', '<span data-qb-solution-rate></span>', 'shield', 'green'],
        ['ai', 'Biến thể tạo bởi AI', 'câu', 'Tạo thêm ý tưởng, bớt giờ biên soạn', 'spark', 'blue'],
        ['warn', 'Cảnh báo độ khó thực tế', 'câu lệch chuẩn', 'Dựa trên kết quả làm bài mẫu', 'alert', 'amber'],
      ].map(([key, title, unit, sub, symbol, color]) => `<article class="qb-kpi"><div><span>${title}</span><span class="qb-kpi-icon is-${color}">${icon(symbol)}</span></div><strong><span data-qb-kpi="${key}">0</span> <small>${unit}</small></strong><p>${sub}</p></article>`).join('')}</section>
      <section class="qb-library"><div class="qb-tabs" role="tablist" aria-label="Chọn kho câu hỏi">${[['school', 'Kho Nhà trường', '(Đã duyệt)'], ['personal', 'Kho Cá nhân của tôi', ''], ...(canReview ? [['pending', 'Chờ kiểm duyệt', '<b>8</b>']] : [])].map(([key, label, sub], i) => `<button type="button" role="tab" id="qb-tab-${key}" aria-controls="qb-tabpanel" aria-selected="${i === 0}" tabindex="${i === 0 ? '0' : '-1'}" data-qb-tab="${key}" class="${i === 0 ? 'is-active' : ''}">${label} <span>${sub}</span></button>`).join('')}</div>
      <form class="qb-filters" data-qb-filters role="search"><label class="qb-search">${icon('search')}<input name="search" type="search" aria-label="Tìm kiếm câu hỏi" placeholder="Tìm từ khóa, mã câu hỏi, công thức…" autocomplete="off"></label>${fieldSelect('subject', 'Môn học', SUBJECTS, '', 'Tất cả môn học')}${fieldSelect('grade', 'Khối lớp', gradeLabels, '', 'Tất cả khối lớp')}${fieldSelect('type', 'Loại câu hỏi', TYPES, '', 'Tất cả dạng câu')}${fieldSelect('level', 'Mức độ nhận thức', LEVELS, '', 'Tất cả mức độ')}${fieldSelect('dateOrder', 'Ngày thêm', CONTENT_DATE_OPTIONS, 'newest')}${fieldSelect('completion', 'Trạng thái làm bài', CONTENT_STATE_OPTIONS, 'unanswered-first')}</form></section>
      <div class="qb-list-heading"><div><h2>Câu hỏi trong kho <span data-qb-count></span></h2><p>${icon('shield')} Chuẩn chương trình GDPT 2018 <span>·</span> Nội dung mẫu để trải nghiệm</p></div>${btn('reset', 'Đặt lại bộ lọc', '', 'qb-text')}</div>
      <p class="qb-status" data-qb-status role="status" aria-live="polite">Dữ liệu mẫu · Chỉnh sửa được lưu riêng theo tài khoản trên trình duyệt này.</p><div class="qb-list" data-qb-results role="tabpanel" id="qb-tabpanel" aria-labelledby="qb-tab-school"></div>
      <footer class="qb-page-footer"><span>${icon('shield')} MAIHOC School · Tri thức được chuẩn hóa, giảng dạy được nâng tầm.</span>${exam ? btn('last-exam', 'Mở đề đã tạo gần nhất', 'book', 'qb-text') : ''}<span>GDPT 2018</span></footer>
      <aside class="qb-basket" data-qb-basket aria-label="Giỏ đề thi" hidden></aside><dialog class="qb-dialog" data-qb-dialog aria-labelledby="qb-modal-title"></dialog>`;
    renderList();
  }
  function close() { find('[data-qb-dialog]').close(); activeModal = ''; trigger?.focus?.(); }
  function modal(title, subtitle, content, wide = false) {
    trigger = document.activeElement;
    const dialog = find('[data-qb-dialog]');
    dialog.classList.toggle('qb-dialog-wide', wide);
    dialog.innerHTML = `<header class="qb-modal-header"><div><span class="qb-overline">MAIHOC SCHOOL · WORKSPACE</span><h2 id="qb-modal-title">${title}</h2><p>${subtitle}</p></div>${btn('close', '×', '', 'qb-close', 'aria-label="Đóng hộp thoại"')}</header>${content}`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus(); math(dialog);
  }
  function gate() { if (pro) return true; activeModal = 'paywall'; modal('Mở khóa School Pro', 'Nâng cấp không gian giảng dạy của bạn.', paywall()); return false; }
  function selectTab(tab) {
    filters.tab = tab;
    container.querySelectorAll('[data-qb-tab]').forEach(el => { const active = el.dataset.qbTab === tab; el.classList.toggle('is-active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    find('[data-qb-results]').setAttribute('aria-labelledby', `qb-tab-${tab}`); renderList();
  }
  function openEditor(q) {
    editing = q || { id: `Q-${Date.now().toString(36).toUpperCase()}`, subject: 'Toán', grade: '12', topic: '', level: 'nb', type: 'multiple_choice', stem: '', choices: ['', '', '', ''], answer: 0, solution: '', status: 'draft', bank: 'school', owner: user.id, author: user.name || 'Giáo viên', reviewer: '', attempts: 0, rate: null, uses: 0, ai: false, createdAt: new Date().toISOString() };
    editing = JSON.parse(JSON.stringify(editing));
    activeModal = 'editor';
    modal(q ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới', 'Soạn một lần, chia sẻ tri thức nhiều lần. Công thức hỗ trợ cú pháp $LaTeX$.', `<form data-qb-editor><div class="qb-editor-grid"><section class="qb-editor-fields"><div class="qb-form-row">${fieldSelect('subject', 'Môn học', SUBJECTS, editing.subject)}${fieldSelect('grade', 'Khối lớp', gradeLabels, editing.grade)}</div><label class="qb-field">Chuyên đề<input name="topic" value="${e(editing.topic)}" required maxlength="150" placeholder="VD: Hàm số"></label><div class="qb-form-row">${fieldSelect('type', 'Loại câu hỏi', TYPES, editing.type)}${fieldSelect('level', 'Mức độ nhận thức', LEVELS, editing.level)}</div><label class="qb-field">Nội dung câu hỏi<textarea name="stem" rows="4" required maxlength="12000" placeholder="Nhập đề bài, sử dụng $…$ cho công thức">${e(editing.stem)}</textarea></label><fieldset class="qb-answer-editor" data-qb-answer-editor></fieldset><div class="qb-field"><div class="qb-label-line"><label for="qb-solution">Lời giải & Hướng dẫn chấm</label>${btn('suggest', 'Gợi ý bằng AI', 'spark', 'qb-ai')}</div><textarea name="solution" id="qb-solution" rows="4" maxlength="12000">${e(editing.solution)}</textarea><small>Gợi ý AI trong bản trải nghiệm là mẫu hướng dẫn; giáo viên cần kiểm tra nội dung.</small></div></section><aside class="qb-live-preview"><div class="qb-preview-label"><span class="qb-live-dot"></span> XEM TRƯỚC TRỰC TIẾP</div><div data-qb-preview></div></aside></div><footer class="qb-modal-footer"><p data-qb-form-error role="alert"></p><span>${editing.autoSaved ? 'Câu nhân bản AI được cập nhật trực tiếp trong ngân hàng.' : 'Câu mới và câu sửa được lưu thành bản nháp chờ duyệt.'}</span>${btn('close', 'Hủy')}<button type="submit" class="qb-btn qb-primary">Lưu câu hỏi</button></footer></form>`, true);
    renderAnswerEditor(); renderPreview();
  }
  function renderAnswerEditor() {
    const q = editing;
    find('[data-qb-answer-editor]').innerHTML = `<legend>${q.type === 'true_false' ? '4 mệnh đề & Trạng thái đúng/sai' : q.type === 'multiple_choice' ? '4 phương án · Chọn đáp án đúng' : q.type === 'essay' ? 'Rubric / Đáp án tham khảo' : 'Đáp số chuẩn'}</legend>${['multiple_choice', 'true_false'].includes(q.type) ? Array.from({ length: 4 }, (_, i) => `<div class="qb-option-input"><span>${'ABCD'[i]}</span><input name="choice${i}" aria-label="${q.type === 'true_false' ? 'Mệnh đề' : 'Phương án'} ${'ABCD'[i]}" required maxlength="2000" value="${e(q.choices[i] || '')}">${q.type === 'multiple_choice' ? `<input type="radio" name="correct" value="${i}" aria-label="Chọn ${'ABCD'[i]} là đáp án đúng" ${q.answer === i ? 'checked' : ''}>` : `<select name="truth${i}" aria-label="Đáp án mệnh đề ${'ABCD'[i]}">${options({ true: 'Đúng', false: 'Sai' }, String(q.answer[i] ?? true))}</select>`}</div>`).join('') : `<textarea name="answer" required maxlength="12000" rows="${q.type === 'essay' ? 3 : 1}" placeholder="${q.type === 'essay' ? 'Các tiêu chí, điểm số, đáp án tham khảo…' : 'VD: 20'}">${e(q.answer)}</textarea>`}`;
  }
  function readEditor() {
    const f = find('[data-qb-editor]'), data = new FormData(f);
    for (const key of ['subject', 'grade', 'topic', 'level', 'stem', 'solution']) editing[key] = String(data.get(key) || '');
    editing.choices = ['multiple_choice', 'true_false'].includes(editing.type) ? [0, 1, 2, 3].map(i => String(data.get(`choice${i}`) || '')) : [];
    editing.answer = editing.type === 'multiple_choice' ? Number(data.get('correct')) : editing.type === 'true_false' ? [0, 1, 2, 3].map(i => data.get(`truth${i}`) === 'true') : String(data.get('answer') || '');
    return editing;
  }
  function renderPreview() {
    const q = editing;
    find('[data-qb-preview]').innerHTML = `<div class="qb-preview-tags">${levelBadge(q.level)}<span>${e(q.subject)} · ${e(gradeLabels[q.grade])}</span></div><p class="qb-stem">${e(q.stem || 'Nội dung câu hỏi sẽ xuất hiện tại đây…')}</p>${answers(q)}<div class="qb-preview-solution"><strong>Lời giải chi tiết</strong><p>${e(q.solution || 'Lời giải và hướng dẫn chấm sẽ xuất hiện tại đây.')}</p></div>`;
    math(find('[data-qb-preview]'));
  }
  function matrixTopics() {
    const form = find('[data-qb-matrix]');
    const rows = questions.filter(q => q.status === 'approved' && q.subject === form.elements.subject.value && q.grade === form.elements.grade.value && (pro || String(q.owner) === String(user.id)));
    const old = form.elements.topic.value;
    form.elements.topic.innerHTML = options([...new Set(rows.map(q => q.topic))], old, 'Tất cả chuyên đề');
    matrixSummary();
  }
  function matrixSummary() {
    const f = find('[data-qb-matrix]');
    const rows = uniqueQuestions(questions.filter(q => q.status === 'approved' && q.subject === f.elements.subject.value && q.grade === f.elements.grade.value && (!f.elements.topic.value || q.topic === f.elements.topic.value)));
    let total = 0;
    Object.keys(LEVELS).forEach(k => { total += Number(f.elements[k].value || 0); find(`[data-qb-available="${k}"]`).textContent = `${rows.filter(q => q.level === k).length} câu khả dụng`; });
    find('[data-qb-matrix-total]').innerHTML = `<div><span>Tổng số câu</span><strong>${total}</strong></div><div><span>Tổng điểm</span><strong>${total ? '10' : '0'}<small> / 10</small></strong></div><p>${total ? `Chia đều khoảng ${(10 / total).toFixed(2)} điểm/câu. Điểm được làm tròn để tổng đúng 10.` : 'Nhập số câu ở từng mức độ để bắt đầu.'}</p>`;
  }
  function openMatrix() {
    if (!gate()) return;
    activeModal = 'matrix';
    modal('Tạo đề theo Ma trận đặc tả', 'Từ chuẩn kiến thức đến một đề kiểm tra cân bằng. Chỉ rút trích câu đã duyệt.', `<form data-qb-matrix><div class="qb-modal-body"><div class="qb-form-row">${fieldSelect('subject', 'Môn học', SUBJECTS, filters.subject || 'Toán')}${fieldSelect('grade', 'Khối lớp', gradeLabels, filters.grade || '12')}</div>${fieldSelect('topic', 'Chuyên đề', [], '', 'Tất cả chuyên đề')}<div class="qb-matrix-table"><div class="qb-matrix-heading"><span>Mức độ nhận thức</span><span>Trong kho</span><span>Số câu cần lấy</span></div>${Object.keys(LEVELS).map(k => `<div>${levelBadge(k)}<small data-qb-available="${k}"></small><input type="number" name="${k}" min="0" max="100" step="1" value="${k === 'nb' || k === 'th' ? 1 : 0}" required aria-label="Số câu ${LEVELS[k]}"></div>`).join('')}</div><div class="qb-matrix-summary" data-qb-matrix-total></div><div class="qb-form-row"><label class="qb-field">Tên bài kiểm tra<input name="title" required maxlength="200" value="Kiểm tra theo ma trận · GDPT 2018"></label><label class="qb-field">Số lượng mã đề<input type="number" name="codes" min="1" max="20" step="1" value="2" required></label></div><p class="qb-note">Mỗi mã đề trộn thứ tự câu và phương án trắc nghiệm, đồng thời giữ đúng khóa đáp án. Câu tự luận được chấm theo rubric.</p><p data-qb-form-error role="alert"></p></div><footer class="qb-modal-footer">${btn('close', 'Hủy')}<button type="submit" class="qb-btn qb-primary">${icon('spark')} Rút trích câu hỏi & Tạo đề ngay</button></footer></form>`);
    matrixTopics();
  }
  function showExam() {
    if (!exam) return;
    activeModal = 'exam';
    modal('Đề kiểm tra đã sẵn sàng', `${exam.title} · ${exam.subject} ${exam.grade} · Thang điểm 10`, `<div class="qb-modal-body"><div class="qb-exam-summary">${icon('check')}<div><strong>${exam.variants[0].questions.length} câu hỏi · ${exam.variants.length} mã đề</strong><p>Đã trộn câu hỏi và phương án, cập nhật khóa đáp án tương ứng.</p></div></div><label class="qb-field">Xem mã đề<select data-qb-exam-code>${exam.variants.map(v => `<option value="${v.code}">Mã đề ${v.code}</option>`).join('')}</select></label><div data-qb-exam-preview></div><p data-qb-form-error role="alert"></p><p class="qb-note">Đề đang ở dạng bản nháp trên trình duyệt. Xuất JSON để tích hợp API hoặc chuyển sang khu vực Kiểm tra & Luyện thi để xem lại.</p></div><footer class="qb-modal-footer">${btn('download', 'Tải đề & đáp án JSON', 'import')}${btn('send', 'Xuất sang Kiểm tra & Luyện thi', 'arrow', 'qb-primary')}</footer>`);
    renderExamCode(exam.variants[0].code);
  }
  function renderExamCode(code) {
    const variant = exam.variants.find(v => v.code === code);
    find('[data-qb-exam-preview]').innerHTML = variant.questions.map((q, i) => `<details class="qb-exam-question"><summary><strong>Câu ${i + 1}</strong><span>${e(TYPES[q.type])}</span><b>${q.points} điểm</b></summary><p class="qb-stem">${e(q.stem)}</p>${answers(q)}<p><strong>Đáp án:</strong> ${e(answerText(q))}</p><p class="qb-note">${e(q.solution)}</p></details>`).join('');
    math(find('[data-qb-exam-preview]'));
  }
  function openImport() {
    activeModal = 'import';
    modal('Nhập từ Số hóa đề AI', 'Kết nối bản đề đã được đối chiếu với ngân hàng câu hỏi.', `<div class="qb-modal-body"><div class="qb-import-illustration">${icon('import')}</div><h3>Bắt đầu từ đề thi bạn đã có</h3><p>Chuyển PDF hoặc ảnh sang nội dung có cấu trúc tại Số hóa đề AI. Duyệt bản chép trước khi đưa vào kho.</p><p class="qb-note">Hoặc chọn bản mẫu bên dưới để trải nghiệm nhập một câu hỏi vào Kho cá nhân, ở trạng thái chờ duyệt.</p><p data-qb-form-error role="alert"></p></div><footer class="qb-modal-footer">${btn('import-sample', 'Nhập câu hỏi mẫu', 'book')}${btn('digitize', 'Mở Số hóa đề AI', 'arrow', 'qb-primary')}</footer>`);
  }
  function toggleSelection(id) {
    const q = questions.find(q => q.id === id); if (!q || q.status !== 'approved') return;
    if (!pro && String(q.owner) !== String(user.id)) { gate(); return; }
    selected.has(id) ? selected.delete(id) : selected.add(id);
    const el = container.querySelector(`[data-qb-card="${CSS.escape(id)}"]`); el?.classList.toggle('is-selected', selected.has(id));
    const checkbox = el?.querySelector('[data-qb-select]'); if (checkbox) checkbox.checked = selected.has(id);
    const button = el?.querySelector('[data-qb-action="select"]'); if (button) { button.innerHTML = `${icon(selected.has(id) ? 'check' : 'basket')}${selected.has(id) ? 'Đã thêm vào đề' : 'Đưa vào bài kiểm tra'}`; button.setAttribute('aria-pressed', String(selected.has(id))); button.classList.toggle('qb-added', selected.has(id)); }
    renderBasket();
  }
  async function updateQuestions() {
    questions = (await repository.list()).map(q => ({ ...q, ...(history.get(questionFingerprint(q)) || {}) }));
    if (!disposed) renderList();
  }
  async function loadHistory() {
    try {
      const response = await fetch('/api/question-bank/history', { credentials: 'same-origin', signal: events.signal });
      if (!response.ok) throw new Error('Không tải được lịch sử làm câu hỏi.');
      const data = await response.json();
      history = new Map(data.history.map(item => [item.fingerprint, { completed: true, lastCompletedAt: item.lastCompletedAt }]));
    } catch (error) {
      if (events.signal.aborted) return;
      historyFailed = true;
    }
    if (disposed) return;
    await updateQuestions();
    if (historyFailed) {
      const select = find('[name="completion"]'); select.disabled = true; select.value = 'all'; filters.completion = 'all'; renderList();
      announce('Chưa tải được lịch sử cá nhân. Bộ lọc trạng thái tạm ngưng; hãy tải lại trang để thử lại.');
    }
  }
  function createSelectedExam() {
    const rows = uniqueQuestions(questions.filter(q => selected.has(q.id)));
    exam = buildExam(rows); showExam();
  }
  function saveExam() {
    try { localStorage.setItem(examDraftKey(user.id), JSON.stringify(exam)); return true; }
    catch { find('[data-qb-form-error]').textContent = 'Không thể lưu đề trên trình duyệt. Hãy tải JSON để giữ lại đề.'; return false; }
  }
  async function action(name, id, button) {
    const q = questions.find(q => q.id === id);
    if (name === 'close') return close();
    if (name === 'add') return openEditor();
    if (name === 'edit' && q) { if (!pro && q.bank !== 'personal' && String(q.owner) !== String(user.id) && !gate()) return; return openEditor(q); }
    if (name === 'delete' && q && canReview && repository.remove) {
      activeModal = 'delete';
      modal('Xóa câu hỏi?', 'Câu hỏi sẽ được bỏ khỏi kho và giỏ đề. Đề đã xuất hoặc bài làm cũ được giữ nguyên.', `<div class="qb-modal-body"><p>${e(q.stem)}</p><p data-qb-form-error role="alert"></p></div><footer class="qb-modal-footer">${btn('close', 'Hủy')}${btn('confirm-delete', 'Xóa câu hỏi', 'trash', '', `data-id="${e(q.id)}"`)}</footer>`);
      return;
    }
    if (name === 'confirm-delete' && q && canReview && repository.remove && activeModal === 'delete') {
      button.disabled = true;
      try {
        const ok = await repository.remove(q.id);
        selected.delete(q.id);
        close(); await updateQuestions(); announce(`Đã xóa câu hỏi. ${persisted(ok)}`);
      } finally { button.disabled = false; }
      return;
    }
    if (name === 'matrix') return openMatrix();
    if (name === 'import') return openImport();
    if (name === 'select') return toggleSelection(id);
    if (name === 'reset') { find('[data-qb-filters]').reset(); filters = { tab: filters.tab, search: '', subject: '', grade: '', type: '', level: '', dateOrder: 'newest', completion: 'unanswered-first' }; if (historyFailed) { filters.completion = 'all'; find('[name="completion"]').value = 'all'; } renderList(); }
    if (name === 'personal') { close(); selectTab('personal'); }
    if (name === 'plans') { close(); onNavigate('school-plans'); }
    if (name === 'digitize') { close(); onNavigate('school-digitize'); }
    if (name === 'clear') { selected.clear(); renderList(); announce('Đã bỏ chọn tất cả câu hỏi.'); }
    if (name === 'clone' && q && gate()) {
      if (busy.has(id)) return;
      busy.add(id); button.disabled = true; button.innerHTML = `${icon('spark')} Đang tạo 2 biến thể…`;
      try {
        if (!canReview || !repository.clone) throw new Error('Chỉ giáo viên hoặc quản trị viên được nhân bản và lưu câu hỏi.');
        const result = await repository.clone(q, questions);
        await updateQuestions();
        announce(result.items.length ? `Đã lưu tự động ${result.items.length} câu hỏi mới vào database ngân hàng. Đã bỏ qua ${result.skipped} câu trùng.` : 'Các biến thể đã có trong kho. Không lưu câu hỏi trùng.');
      } finally { busy.delete(id); if (!disposed) renderList(); }
    }
    if (name === 'approve' && q && canReview && gate()) { const ok = await repository.approve(q.id); await updateQuestions(); announce(`Đã duyệt #${q.id}. ${persisted(ok)}`); }
    if (name === 'suggest' && gate()) {
      readEditor(); button.disabled = true;
      later(() => { if (activeModal !== 'editor') return; const f = find('[data-qb-editor]'); const guidance = editing.solution || `Gợi ý hướng dẫn chấm (mô phỏng):\n1. Xác định kiến thức ${editing.topic || 'của chuyên đề'} và yêu cầu đề bài.\n2. Trình bày lập luận, công thức hoặc dẫn chứng phù hợp.\n3. Đối chiếu đáp án dự kiến: ${answerText(editing) || 'cần giáo viên bổ sung'}.\nGiáo viên cần hoàn thiện lời giải và phân bổ điểm trước khi duyệt.`; editing.solution = guidance; f.elements.solution.value = guidance; button.disabled = false; renderPreview(); });
    }
    if (name === 'shuffle' || name === 'export') { if (name === 'shuffle' && !gate()) return; createSelectedExam(); }
    if (name === 'last-exam') showExam();
    if (name === 'download' && exam) downloadExam(exam);
    if (name === 'send' && exam && saveExam()) { close(); onNavigate('tests'); }
    if (name === 'import-sample') {
      const available = questions.filter(q => q.subject === 'Toán').flatMap(q => generateVariants(q, questions));
      if (!available.length) throw new Error('Câu hỏi mẫu đã có trong kho.');
      const sample = { ...available[0], id: `IMPORT-${Date.now().toString(36)}`, owner: user.id, author: user.name || 'Giáo viên', ai: false };
      const ok = await repository.save(sample); await updateQuestions(); selectTab('personal'); close(); announce(`Đã nhập 1 câu hỏi mẫu, đang chờ duyệt. ${persisted(ok)}`);
    }
  }
  container.addEventListener('click', event => {
    const tab = event.target.closest('[data-qb-tab]'); if (tab) { selectTab(tab.dataset.qbTab); return; }
    const button = event.target.closest('[data-qb-action]');
    if (button) action(button.dataset.qbAction, button.dataset.id, button).catch(error => { const target = find('[data-qb-form-error]'); if (target && find('[data-qb-dialog]').open) target.textContent = error.message; else announce(error.message); });
  }, { signal: events.signal });
  container.addEventListener('keydown', event => {
    if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const tabs = [...container.querySelectorAll('[role="tab"]')], i = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); selectTab(tabs[next].dataset.qbTab);
  }, { signal: events.signal });
  function onInput(event) {
    if (event.target.closest('[data-qb-filters]')) { const data = new FormData(find('[data-qb-filters]')); filters = { ...filters, ...Object.fromEntries(data) }; renderList(); }
    if (event.target.closest('[data-qb-editor]') && event.target.name !== 'type') { readEditor(); renderPreview(); }
    if (event.target.closest('[data-qb-matrix]')) { if (['subject', 'grade'].includes(event.target.name)) matrixTopics(); else matrixSummary(); }
  }
  container.addEventListener('input', onInput, { signal: events.signal });
  container.addEventListener('change', event => {
    if (event.target.matches('[data-qb-select]')) toggleSelection(event.target.dataset.qbSelect);
    if (event.target.name === 'type' && event.target.closest('[data-qb-editor]')) { readEditor(); editing.type = event.target.value; editing.choices = ['', '', '', '']; editing.answer = editing.type === 'multiple_choice' ? 0 : editing.type === 'true_false' ? [true, true, true, true] : ''; renderAnswerEditor(); renderPreview(); }
    if (event.target.matches('[data-qb-exam-code]')) renderExamCode(event.target.value);
  }, { signal: events.signal });
  container.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      if (event.target.matches('[data-qb-editor]')) {
        readEditor(); validateQuestion(editing); delete editing.completed; delete editing.lastCompletedAt; const ok = await repository.save({ ...editing, owner: user.id, author: user.name || 'Giáo viên', status: 'draft', reviewer: '', attempts: 0, rate: null, uses: 0 }); selected.delete(editing.id); await updateQuestions(); selectTab('personal'); close(); announce(editing.autoSaved ? 'Đã cập nhật câu hỏi trong database ngân hàng.' : `Đã lưu bản nháp, cần duyệt trước khi đưa vào đề. ${persisted(ok)}`);
      }
      if (event.target.matches('[data-qb-matrix]') && pro) {
        const data = Object.fromEntries(new FormData(event.target)), spec = { ...data, counts: Object.fromEntries(Object.keys(LEVELS).map(k => [k, Number(data[k])])) };
        exam = buildExam(extractMatrix(questions, spec), { title: data.title, codes: Number(data.codes) }); showExam(); saveExam();
      }
    } catch (error) { const target = find('[data-qb-form-error]'); if (target) target.textContent = error.message; else announce(error.message); }
  }, { signal: events.signal });
  shell();
  loadHistory().catch(error => announce(`Không thể tải câu hỏi: ${error.message}`));
  find('[data-qb-dialog]').addEventListener('cancel', () => { activeModal = ''; }, { signal: events.signal });
  find('[data-qb-dialog]').addEventListener('click', event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }, { signal: events.signal });
  return () => { disposed = true; events.abort(); timers.forEach(clearTimeout); find('[data-qb-dialog]')?.close(); container.classList.remove('qb-workspace', 'qb-has-basket'); };
}
