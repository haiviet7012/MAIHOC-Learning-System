import { mountLearningAdvisor } from './learning-advisor.js';
import { escapeHTML as e } from '../ui.js';
import { api } from './api.js';

const subjects = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Tin học', 'Giáo dục kinh tế và pháp luật', 'Công nghệ', 'IELTS', 'Tự học'];
const days = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
const sessions = [{ name: 'Sáng', count: 5, start: 0 }, { name: 'Chiều', count: 4, start: 5 }];
const heading = (title, sub) => `<div class="portal-heading"><div><p class="eyebrow">MAIHOC · LEARNING</p><h1>${title}</h1><p>${sub}</p></div></div>`;
const colour = subject => subjects.indexOf(subject) % 5;
function grid(cells, editable = false) {
  return `<div class="timetable-scroll" tabindex="0" aria-label="Thời khóa biểu tuần"><table class="timetable-grid"><caption>Thời khóa biểu cá nhân từ thứ hai đến chủ nhật</caption><thead><tr><th scope="col">Buổi</th><th scope="col">Tiết</th>${days.map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead>${sessions.map(session => `<tbody aria-label="Buổi ${session.name}">${Array.from({length: session.count}, (_, period) => `<tr>${period === 0 ? `<th scope="rowgroup" rowspan="${session.count}" class="timetable-session">${session.name}</th>` : ''}<th scope="row" class="timetable-period">${period + 1}</th>${days.map((d, col) => {
    const key = `${session.start + period}-${col}`, subject = cells[key];
    return `<td data-timetable-cell="${key}">${editable ? `<button type="button" class="timetable-cell tone-${subject ? colour(subject) : 'empty'}" data-place="${key}" aria-label="${e(`${d}, ${session.name}, tiết ${period + 1}: ${subject || 'trống'}. Nhấn để đặt môn, chuột phải hoặc Delete để xóa.`)}">${subject ? e(subject) : '<span aria-hidden="true">+</span>'}</button>` : `<span class="timetable-cell tone-${subject ? colour(subject) : 'empty'}">${subject ? e(subject) : '—'}</span>`}</td>`;
  }).join('')}</tr>`).join('')}</tbody>`).join('')}</table></div>`;
}
function legacySchedule(cells) {
  if (!cells || !Object.keys(cells).length) return '';
  const labels = ['Sáng 7–9h', 'Sáng 9–11h', 'Chiều 14–16h', 'Tối 19–21h'];
  return `<details class="timetable-legacy"><summary>Xem bản lịch cũ đã giữ lại</summary><p>Lịch cũ dùng khung giờ dài. Hai khung sáng được đưa vào tiết sáng 1–2, khung chiều vào tiết chiều 1 để bạn sắp xếp lại. Các môn buổi tối được giữ trong bản cũ dưới đây.</p><ul>${Object.entries(cells).map(([key, subject]) => { const [slot,day] = key.split('-').map(Number); return `<li>${e(days[day] || '')} · ${e(labels[slot] || '')}: ${e(subject)}</li>`; }).join('')}</ul></details>`;
}
const login = '<p>Đăng nhập để lưu thời khóa biểu và theo dõi việc học cá nhân.</p><button class="button primary" data-portal-login>Đăng nhập</button>';

export function mountTimetablePreview(container, user) {
  const target = container.querySelector('[data-personal-timetable]');
  if (!target) return () => {};
  const controller = new AbortController();
  if (!user) { target.innerHTML = login; return () => controller.abort(); }
  api('/api/learning/timetable', { signal: controller.signal }).then(({ timetable }) => {
    if (controller.signal.aborted) return;
    target.innerHTML = timetable
      ? `${grid(timetable.cells)}${legacySchedule(timetable.legacyCells)}<div class="timetable-actions"><button class="button secondary" data-route="timetable">Sửa thời khóa biểu hiện tại</button><button class="button secondary" data-route="timetable" data-new-timetable>Tạo thời khóa biểu mới</button></div>`
      : '<div class="portal-empty"><p>Sắp xếp nhịp học của riêng bạn trong tuần.</p><button class="button primary" data-route="timetable">Thiết lập thời khóa biểu của bạn</button></div>';
  }).catch(error => { if (!controller.signal.aborted) target.innerHTML = `<p role="alert">${e(error.message)}</p><button class="button secondary" data-route="timetable">Thử lại</button>`; });
  return () => controller.abort();
}

export function mountLearningProgress(container, user) {
  let disposeAdvisor = () => {};
  const controller = new AbortController();
  container.innerHTML = heading('Tiến trình học tập', 'Theo dõi việc tự học trên MAIHOC Learning, độc lập với School.') + '<div data-learning-progress role="status">Đang tải tiến trình…</div>';
  const target = container.querySelector('[data-learning-progress]');
  if (!user) target.innerHTML = login;
  else api('/api/progress', { signal: controller.signal }).then(data => {
    if (controller.signal.aborted) return;
    const rows = (data.progress || []).filter(p => ['lesson', 'document', 'exam', 'practice'].includes(p.itemType));
    const percent = p => Math.max(0, Math.min(100, Number(p.progressPercent) || 0));
    const done = rows.filter(p => p.status === 'completed' || percent(p) === 100).length;
    target.innerHTML = `<div class="portal-stats"><article class="portal-stat yellow"><span>Mục đang theo dõi</span><strong>${rows.length}</strong></article><article class="portal-stat lavender"><span>Đã hoàn thành</span><strong>${done}</strong></article><article class="portal-stat blue"><span>Tiến độ trung bình</span><strong>${rows.length ? Math.round(rows.reduce((sum, p) => sum + percent(p), 0) / rows.length) : 0}%</strong></article></div><section class="portal-panel learning-progress-list"><h2>Hành trình tự học của bạn</h2>${rows.length ? rows.map(p => `<article class="portal-record"><div><h3>${e(p.itemTitle || 'Nội dung học tập')}</h3><p>${e(p.subject || '')} · ${e(p.grade || '')} · ${p.status === 'completed' || percent(p) === 100 ? 'Hoàn thành' : 'Đang học'}</p><progress max="100" value="${percent(p)}" aria-label="Tiến độ ${e(p.itemTitle || '')}"></progress></div><strong>${percent(p)}%</strong></article>`).join('') : '<p>Bạn chưa có tiến trình Learning. Hãy mở học liệu hoặc luyện tập để bắt đầu ghi nhận.</p>'}</section>`;
    const advisor = document.createElement('div'); container.append(advisor);
    disposeAdvisor = mountLearningAdvisor(advisor);
  }).catch(error => { if (!controller.signal.aborted) target.innerHTML = `<p role="alert">${e(error.message)}</p>`; });
  return () => { controller.abort(); disposeAdvisor(); };
}

export function mountTimetable(container, user, { createNew = false } = {}) {
  const controller = new AbortController();
  let cells = {}, legacyCells = null, version = 0, selected = subjects[0], dirty = false, busy = false;
  const unload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  container.innerHTML = heading('Thời khóa biểu của bạn', 'Kéo môn học vào ô, hoặc chọn môn rồi nhấn vào ô để xếp lịch.') + '<p role="status">Đang tải lịch…</p>';
  const confirmNew = () => window.confirm('Bạn có muốn xóa thời khóa biểu hiện tại để tạo thời khóa biểu mới? Lịch mới chỉ thay thế lịch cũ khi bạn nhấn Lưu.');
  function draw() {
    container.innerHTML = heading('Thời khóa biểu của bạn', 'Kéo môn học vào ô, hoặc chọn môn rồi nhấn vào ô để xếp lịch.') + `<div class="timetable-actions"><button class="button primary" data-save-timetable>Lưu thời khóa biểu</button><button class="button secondary" data-reset-timetable>Tạo thời khóa biểu mới</button><button class="button secondary" data-exit-timetable>Quay lại tổng quan</button></div><p data-timetable-status role="status" aria-live="polite">${dirty ? 'Có thay đổi chưa lưu.' : version ? 'Đã tải lịch đã lưu.' : 'Lịch mới chưa được lưu.'}</p><div class="timetable-editor"><aside class="timetable-subjects" aria-label="Chọn môn học"><h2>Môn học</h2>${subjects.map(s => `<button type="button" draggable="true" data-subject-choice="${e(s)}" aria-pressed="${s === selected}" class="tone-${colour(s)}">${e(s)}</button>`).join('')}<button type="button" data-erase-cell aria-pressed="${selected === null}">Xóa ô</button></aside><div>${grid(cells, true)}${legacySchedule(legacyCells)}<p class="muted tiny">Chuột phải vào môn để xóa. Bạn cũng có thể nhấn Delete khi ô đang được chọn, hoặc chọn “Xóa ô” rồi nhấn ô.</p></div></div>`;
  }
  if (!user) container.innerHTML = heading('Thời khóa biểu của bạn', 'Lịch học cá nhân của MAIHOC Learning') + login;
  else api('/api/learning/timetable', { signal: controller.signal }).then(({ timetable }) => {
    if (controller.signal.aborted) return;
    cells = { ...(timetable?.cells || {}) }; legacyCells = timetable?.legacyCells; version = timetable?.version || 0;
    if (createNew && timetable && confirmNew()) { cells = {}; dirty = true; }
    draw();
  }).catch(error => { if (!controller.signal.aborted) container.innerHTML = heading('Thời khóa biểu của bạn', '') + `<p role="alert">${e(error.message)}</p><button class="button secondary" data-route="home">Về tổng quan</button>`; });
  function place(key, subject = selected) {
    if (busy || !/^[0-8]-[0-6]$/.test(key) || (subject !== null && !subjects.includes(subject))) return;
    const focused = container.querySelector('[data-place]:focus')?.dataset.place;
    if (subject === null) delete cells[key]; else cells[key] = subject;
    dirty = true; draw();
    if (focused) container.querySelector(`[data-place="${focused}"]`)?.focus();
  }
  container.addEventListener('click', async event => {
    if (busy) return;
    const choice = event.target.closest('[data-subject-choice]');
    if (choice || event.target.closest('[data-erase-cell]')) { selected = choice?.dataset.subjectChoice || null; draw(); container.querySelector(choice ? `[data-subject-choice="${selected}"]` : '[data-erase-cell]')?.focus(); return; }
    const cell = event.target.closest('[data-place]');
    if (cell) { place(cell.dataset.place); return; }
    if (event.target.closest('[data-reset-timetable]') && confirmNew()) { cells = {}; dirty = true; draw(); }
    if (event.target.closest('[data-exit-timetable]') && (!dirty || window.confirm('Bỏ các thay đổi chưa lưu?'))) { dirty = false; window.dispatchEvent(new CustomEvent('maihoc-timetable-home')); }
    if (!event.target.closest('[data-save-timetable]')) return;
    busy = true;
    container.querySelector('[data-save-timetable]').disabled = true;
    const status = container.querySelector('[data-timetable-status]'); status.textContent = 'Đang lưu…';
    try {
      const data = await api('/api/learning/timetable', { method: 'PUT', body: { cells, version, layoutVersion: 2 }, signal: controller.signal });
      if (controller.signal.aborted) return;
      version = data.timetable.version; dirty = false; status.textContent = 'Đã lưu thời khóa biểu vào tài khoản.';
    } catch (error) { if (!controller.signal.aborted) status.textContent = error.message; }
    finally { busy = false; const save = container.querySelector('[data-save-timetable]'); if (save) save.disabled = false; }
  }, { signal: controller.signal });
  container.addEventListener('contextmenu', event => {
    const cell = event.target.closest('[data-place]');
    if (!cell) return;
    event.preventDefault();
    if (!busy && cells[cell.dataset.place]) { const key = cell.dataset.place; place(key, null); container.querySelector(`[data-place="${key}"]`)?.focus(); }
  }, { signal: controller.signal });
  container.addEventListener('keydown', event => {
    const cell = event.target.closest('[data-place]');
    if (cell && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); if (!busy && cells[cell.dataset.place]) place(cell.dataset.place, null); }
  }, { signal: controller.signal });
  container.addEventListener('dragstart', event => {
    const choice = event.target.closest('[data-subject-choice]');
    if (choice && !busy) { event.dataTransfer.setData('text/plain', choice.dataset.subjectChoice); event.dataTransfer.effectAllowed = 'copy'; }
  }, { signal: controller.signal });
  container.addEventListener('dragover', event => { if (event.target.closest('[data-timetable-cell]') && !busy) event.preventDefault(); }, { signal: controller.signal });
  container.addEventListener('drop', event => {
    const cell = event.target.closest('[data-timetable-cell]');
    if (cell) { event.preventDefault(); place(cell.dataset.timetableCell, event.dataTransfer.getData('text/plain')); }
  }, { signal: controller.signal });
  return () => { controller.abort(); window.removeEventListener('beforeunload', unload); };
}
