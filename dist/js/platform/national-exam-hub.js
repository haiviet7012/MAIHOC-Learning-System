import { filterContentTimeline, CONTENT_DATE_OPTIONS, CONTENT_STATE_OPTIONS, contentTimestamp } from './content-filters.js';
import { escapeHTML as e } from '../ui.js';
import { loadNationalExams, loadNationalExamHistory } from './national-exam-api.js';
import { canManageNationalExams } from './national-exam-access.js';
import { mountNationalExamManagement } from './national-exam-management.js';

const subjects = ['Tất cả', 'Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Ngữ văn'];
const types = { illustrative: 'Đề minh họa Bộ GD&ĐT', official: 'Đề chính thức', trial: 'Đề thi thử các trường/Sở' };
const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
const score = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export function filterNationalExams(exams, { subject = 'Tất cả', year = '', type = '', query = '', dateOrder = 'newest', completion = 'unanswered-first' } = {}) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return filterContentTimeline(exams.filter(exam => (subject === 'Tất cả' || exam.subject === subject)
    && (!year || exam.year === year) && (!type || exam.examType === type)
    && words.every(word => normalize(`${exam.title} ${exam.id} ${exam.originalName || ''}`).includes(word))), { dateOrder, completion });
}

function card(exam) {
  return `<article class="national-exam-card">
    <div class="national-exam-badges"><span class="pill">${e(exam.subject)}</span><span class="pill">${e(exam.year || 'Chưa rõ năm')}</span></div>
    <p class="national-exam-type">${e(types[exam.examType] || '')}</p><h3>${e(exam.title)}</h3>
    <p class="national-exam-code">Mã đề: ${e(exam.examCode || exam.id)} · ${exam.mock ? 'Đề mẫu · ' : ''}${exam.access === 'school' ? 'Paid School' : 'Free Learn'}</p>
    <div class="national-exam-meta"><span>Ngày thêm: ${e(contentTimestamp(exam.createdAt) === null ? 'Chưa ghi nhận' : new Date(contentTimestamp(exam.createdAt)).toLocaleString('vi-VN'))}</span>${exam.lastCompletedAt ? `<span>Làm gần nhất: ${e(new Date(contentTimestamp(exam.lastCompletedAt)).toLocaleString('vi-VN'))}</span>` : ''}<span>◷ ${exam.durationMinutes} phút${exam.questionCount ? ` · ${exam.questionCount} câu` : ' · Số câu theo đề'}</span><span>↗ ${Number(exam.attemptCount).toLocaleString('vi-VN')} lượt làm bài</span></div>
    <p class="national-exam-status ${exam.completed ? 'is-completed' : ''}">${exam.completed ? `✓ Đã hoàn thành · ${exam.bestScore == null ? 'Chờ chấm điểm' : `Cao nhất: ${score(exam.bestScore)}/10`}` : '○ Chưa làm'}</p>
    <div class="national-exam-actions"><button type="button" class="button primary" data-national-start="${e(exam.id)}" ${exam.locked ? 'disabled' : ''}>${exam.locked ? 'Cần gói Paid School' : 'Vào phòng thi →'}</button><button type="button" class="button secondary" data-national-history="${e(exam.id)}">Xem lịch sử/Đáp án</button></div>
  </article>`;
}

export function mountNationalExamHub(container, { user, onStart, onResult }) {
  const controller = new AbortController();
  const filters = { subject: 'Tất cả', year: '', type: '', query: '', dateOrder: 'newest', completion: 'unanswered-first' };
  let exams = [], historyRequest = 0;
  container.innerHTML = `<section class="national-exam-hub" aria-labelledby="national-exam-title">
    <header class="portal-heading"><div><p class="eyebrow">MAIHOC • LUYỆN ĐỀ THPT QUỐC GIA</p><h1 id="national-exam-title">Kho Đề Thi THPT Quốc Gia</h1><p class="muted">Luyện đề chuẩn cấu trúc Bộ GD&ĐT với bộ đếm giờ thực tế và phân tích chi tiết.</p></div>${canManageNationalExams(user) ? '<div class="national-management-actions"><button type="button" data-national-create>+ Tạo đề thi mới</button><button type="button" data-national-manage>Quản lý ngân hàng đề</button></div>' : ''}</header>
    <div class="portal-stats" data-national-stats aria-busy="true">${[['yellow', 'Tổng số đề thi', 'Đề thi khả dụng'], ['lavender', 'Đề đã hoàn thành', 'Số đề đã nộp'], ['blue', 'Điểm trung bình', 'Thang điểm 10 · Các lần đã chấm']].map(([color, label, hint]) => `<article class="portal-stat ${color}"><span>${label}</span><strong data-national-stat>—</strong><small>${hint}</small></article>`).join('')}</div>
    <section class="national-exam-tools" aria-label="Lọc và tìm kiếm đề thi">
      <div class="national-exam-subjects" role="group" aria-label="Môn thi">${subjects.map((subject, index) => `<button type="button" data-national-subject="${subject}" aria-pressed="${index === 0}">${subject}</button>`).join('')}</div>
      <div class="national-exam-filters"><label>Năm học<select data-national-year><option value="">Tất cả năm</option>${['2026', '2025', '2024'].map(year => `<option>${year}</option>`).join('')}</select></label>
      <label>Loại đề<select data-national-type><option value="">Tất cả loại đề</option>${Object.entries(types).map(([value, name]) => `<option value="${value}">${e(name)}</option>`).join('')}</select></label>
      <label>Ngày thêm<select data-national-date>${Object.entries(CONTENT_DATE_OPTIONS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
      <label>Trạng thái làm bài<select data-national-completion>${Object.entries(CONTENT_STATE_OPTIONS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
      <label class="national-exam-search">Tìm kiếm<input type="search" data-national-search placeholder="Tìm theo tên đề hoặc mã đề…" autocomplete="off"></label></div>
    </section>
    <div class="national-exam-list-heading"><h2>Danh sách đề thi</h2><p class="muted" data-national-count role="status" aria-live="polite"></p></div>
    <div data-national-list aria-busy="true"><p role="status">Đang tải kho đề thi…</p></div>
    <section class="national-exam-history" data-national-history-panel hidden aria-labelledby="national-history-title" tabindex="-1"></section>
  </section>`;
  const list = container.querySelector('[data-national-list]');
  const panel = container.querySelector('[data-national-history-panel]');
  const management = canManageNationalExams(user) ? mountNationalExamManagement(container, { onSaved: () => load() }) : null;
  function renderList() {
    const matches = filterNationalExams(exams, filters);
    container.querySelector('[data-national-count]').textContent = `${matches.length} / ${exams.length} đề thi`;
    list.innerHTML = matches.length ? `<div class="national-exam-grid">${matches.map(card).join('')}</div>`
      : `<div class="empty-state"><h3>${exams.length ? 'Không tìm thấy đề thi phù hợp' : 'Chưa có đề thi khả dụng'}</h3><p>${exams.length ? 'Thử đổi môn, năm học hoặc từ khóa tìm kiếm.' : 'Các đề thi lớp 12 sẽ xuất hiện tại đây khi được bổ sung vào kho học liệu.'}</p>${exams.length ? '<button class="button secondary" type="button" data-national-reset>Xóa bộ lọc</button>' : ''}</div>`;
  }
  async function load() {
    list.setAttribute('aria-busy', 'true');
    try {
      const data = await loadNationalExams(controller.signal);
      if (controller.signal.aborted) return;
      exams = data.exams;
      [data.stats.total, data.stats.completed, data.stats.average].forEach((value, index) => {
        container.querySelectorAll('[data-national-stat]')[index].textContent = score(value);
      });
      renderList();
    } catch (error) {
      if (controller.signal.aborted) return;
      list.innerHTML = `<div class="empty-state" role="alert"><h3>Chưa tải được kho đề thi</h3><p>${e(error.message)}</p><button class="button primary" type="button" data-national-retry>Thử lại</button></div>`;
    } finally {
      if (!controller.signal.aborted) {
        list.setAttribute('aria-busy', 'false');
        container.querySelector('[data-national-stats]').setAttribute('aria-busy', 'false');
      }
    }
  }
  async function showHistory(id) {
    const request = ++historyRequest;
    const exam = exams.find(item => item.id === id);
    if (!exam) return;
    panel.hidden = false;
    panel.innerHTML = `<div class="national-exam-list-heading"><h2 id="national-history-title">Lịch sử · ${e(exam.title)}</h2><button class="button secondary small" type="button" data-national-close>Đóng</button></div><div data-national-attempts role="status">Đang tải lịch sử…</div>`;
    panel.focus();
    const target = panel.querySelector('[data-national-attempts]');
    if (!user) {
      target.innerHTML = '<p>Đăng nhập để lưu kết quả, xem lịch sử và đối chiếu đáp án sau khi nộp bài.</p><button class="button primary" type="button" data-portal-login>Đăng nhập</button>';
      return;
    }
    try {
      const data = await loadNationalExamHistory(id, controller.signal);
      if (controller.signal.aborted || request !== historyRequest) return;
      target.innerHTML = data.attempts.length ? data.attempts.map(attempt => `<article class="national-exam-attempt"><div><strong>${attempt.graded ? `${score(attempt.score)}/${score(attempt.scale)}` : 'Đã nộp · Chờ chấm điểm'}</strong><p class="muted">${e(new Date(`${attempt.createdAt.replace(' ', 'T')}Z`).toLocaleString('vi-VN'))}</p></div><button class="button secondary small" type="button" data-national-result="${e(attempt.id)}">Xem bài làm/Đáp án →</button></article>`).join('')
        : '<p>Bạn chưa nộp bài cho đề này. Hoàn thành một lượt thi để xem kết quả và đáp án.</p>';
    } catch (error) {
      if (!controller.signal.aborted && request === historyRequest) target.textContent = error.message;
    }
  }
  function click(event) {
    const button = event.target.closest('button');
    if (!button || !container.contains(button)) return;
    if (button.hasAttribute('data-national-create')) management?.newExam();
    if (button.hasAttribute('data-national-manage')) management?.openBank();
    if (button.hasAttribute('data-national-start')) onStart(exams.find(exam => exam.id === button.dataset.nationalStart));
    if (button.hasAttribute('data-national-result')) onResult(button.dataset.nationalResult);
    if (button.hasAttribute('data-national-history')) showHistory(button.dataset.nationalHistory);
    if (button.hasAttribute('data-national-close')) { panel.hidden = true; historyRequest++; }
    if (button.hasAttribute('data-national-retry')) load();
    if (button.hasAttribute('data-national-subject')) {
      filters.subject = button.dataset.nationalSubject;
      container.querySelectorAll('[data-national-subject]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
      renderList();
    }
    if (button.hasAttribute('data-national-reset')) {
      Object.assign(filters, { subject: 'Tất cả', year: '', type: '', query: '', dateOrder: 'newest', completion: 'unanswered-first' });
      container.querySelectorAll('.national-exam-filters select,.national-exam-filters input').forEach(input => { input.value = ''; });
      container.querySelector('[data-national-date]').value = 'newest';
      container.querySelector('[data-national-completion]').value = 'unanswered-first';
      container.querySelectorAll('[data-national-subject]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.nationalSubject === 'Tất cả')));
      renderList();
    }
  }
  function filter(event) {
    const input = event.target;
    const key = input.matches('[data-national-year]') ? 'year' : input.matches('[data-national-type]') ? 'type' : input.matches('[data-national-search]') ? 'query' : input.matches('[data-national-date]') ? 'dateOrder' : input.matches('[data-national-completion]') ? 'completion' : null;
    if (key) { filters[key] = input.value; renderList(); }
  }
  container.addEventListener('click', click);
  container.addEventListener('input', filter);
  container.addEventListener('change', filter);
  load();
  return () => { controller.abort(); management?.dispose(); container.removeEventListener('click', click); container.removeEventListener('input', filter); container.removeEventListener('change', filter); };
}
