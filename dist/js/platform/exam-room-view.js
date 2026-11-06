import { escapeHTML as e } from '../ui.js';
import { parseQuestionText } from '../question-parser.js';
import { mountPdfReader } from '../pdf-reader.js';
import { loadExamRoom, loadExamText, submitRoomExam } from './exam-room-api.js';
import { answerKey, draftKey, questionAnswered, questionGroups, readRoomDraft, roomQuestions, secondsRemaining } from './exam-room-model.js';

const text = value => e(String(value ?? ''));
const timeLabel = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
function safeImage(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, location.origin);
    return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === location.protocol) ? url.href : '';
  } catch { return ''; }
}
function illustrations(question) {
  const images = [...(Array.isArray(question.images) ? question.images : []), ...(question.imageUrl ? [question.imageUrl] : [])];
  return images.filter(Boolean).map((image, index) => {
    const src = safeImage(typeof image === 'string' ? image : image.src);
    if (!src) return '';
    return `<figure class="exam-room-figure"><img src="${text(src)}" alt="${text(image.alt || `Hình minh họa ${index + 1}`)}" loading="lazy">${image.caption ? `<figcaption>${text(image.caption)}</figcaption>` : ''}</figure>`;
  }).join('');
}

export function mountExamRoom(container, { examId, user, document: cachedDocument, onDocument, onComplete, onExit }) {
  const controller = new AbortController();
  const mathScript = window.document.querySelector('script[src*="mathjax"]');
  let document, layout, questions = [], answers = {}, flags = new Set(), activeId = '', mode = 'all';
  let deadline = 0, interval, observer, headerObserver, storageKey, saveTimeout, disposed = false, phase = 'loading', exitAction;
  let sourceReader, expiryHandled = false, headerHeight = 150, sessionId;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isInProgress = () => !disposed && ['active', 'submitting', 'retry'].includes(phase);
  const find = selector => container.querySelector(selector);
  const countDone = () => questions.filter(question => questionAnswered(question, answers)).length;
  const message = value => { const el = find('[data-room-message]'); if (el) el.textContent = value; };
  function save() {
    clearTimeout(saveTimeout);
    if (!storageKey || ['submitted', 'leaving', 'loading'].includes(phase)) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ deadline, answers, flags: [...flags], activeId, mode, sessionId })); }
    catch { message('Trình duyệt không lưu được bản nháp. Hãy giữ trang mở đến khi nộp bài.'); }
  }
  const scheduleSave = () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(save, 200); };
  function closeDialog() { find('[data-room-dialog]')?.close(); }
  function modal(kind, action) {
    if (phase === 'submitting') return;
    const dialog = find('[data-room-dialog]');
    const remaining = questions.length - countDone();
    exitAction = action || onExit;
    find('[data-room-dialog-title]').textContent = kind === 'exit' ? 'Thoát phòng thi?' : 'Nộp bài sớm?';
    find('[data-room-dialog-copy]').textContent = kind === 'exit'
      ? 'Bản nháp sẽ được lưu trên trình duyệt này. Đồng hồ vẫn tiếp tục chạy khi bạn rời phòng thi.'
      : `Bạn đã làm ${countDone()}/${questions.length} câu. ${remaining ? `Còn ${remaining} câu chưa hoàn thành. ` : ''}${flags.size ? `Có ${flags.size} câu được đánh dấu xem lại. ` : ''}Sau khi nộp, bạn sẽ không thể sửa bài làm này.`;
    const confirm = find('[data-room-confirm]');
    confirm.dataset.roomConfirm = kind;
    confirm.textContent = kind === 'exit' ? 'Lưu và thoát' : 'Xác nhận nộp bài';
    if (!dialog.open) dialog.showModal();
    find('[data-room-cancel]').focus();
  }
  function confirmExit(action = onExit) {
    if (phase === 'submitting') { message('Đang gửi bài. Vui lòng chờ kết quả nộp bài.'); return; }
    if (!isInProgress()) { action(); return; }
    modal('exit', action);
  }
  function questionMarkup(question, index) {
    const id = answerKey(question), label = `Câu ${question.number || index + 1}`;
    const heading = `room-question-title-${index}`;
    const stem = question.text || question.body || '';
    let fields;
    if (question.type === 'multiple_choice') {
      fields = `<div class="room-options" role="radiogroup" aria-label="Đáp án ${text(label)}">${(question.options?.length ? question.options : ['A', 'B', 'C', 'D'].map(id => ({ id }))).map(option => `<label class="room-option"><input type="radio" name="room-${text(id)}" data-room-answer="${text(id)}" value="${text(option.id)}" ${answers[id] === option.id ? 'checked' : ''}><span class="room-option-letter">${text(option.id)}</span><span>${text(option.text || '')}</span></label>`).join('')}</div>`;
    } else if (question.type === 'true_false') {
      fields = `<div class="room-statements">${(question.statements?.length ? question.statements : ['a', 'b', 'c', 'd'].map(id => ({ id }))).map(statement => {
        const key = `${id}${statement.id}`;
        return `<fieldset class="room-statement"><legend>${text(statement.id)}) ${text(statement.text || 'Đối chiếu ý này trong đề gốc.')}</legend><div>${[['true', 'Đúng'], ['false', 'Sai']].map(([value, title]) => `<label class="room-option"><input type="radio" name="room-${text(key)}" data-room-answer="${text(key)}" value="${value}" ${answers[key] === value ? 'checked' : ''}><span>${title}</span></label>`).join('')}</div></fieldset>`;
      }).join('')}</div>`;
    } else {
      fields = question.isNumeric
        ? `<label class="room-short-answer">Đáp án số<input type="text" inputmode="decimal" autocomplete="off" maxlength="32" data-room-answer="${text(id)}" value="${text(answers[id] || '')}" placeholder="Ví dụ: -1,25 hoặc 0.5" aria-describedby="room-hint-${index}"><small id="room-hint-${index}">Nhập số; có thể dùng dấu phẩy hoặc dấu chấm thập phân.</small></label>`
        : `<label class="room-short-answer">Bài làm<textarea data-room-answer="${text(id)}" rows="6" maxlength="10000" placeholder="Nhập câu trả lời hoặc bài tự luận…">${text(answers[id] || '')}</textarea></label>`;
    }
    return `<article class="room-question" data-room-question="${text(id)}" data-room-index="${index}" aria-labelledby="${heading}" tabindex="-1">
      <div class="room-question-heading"><div><span class="room-section-label">${text(question.layoutSectionTitle || questionGroups([question])[0]?.title)}</span><h2 id="${heading}">${text(label)}</h2></div><button type="button" class="room-flag" data-room-flag="${text(id)}" aria-pressed="${flags.has(id)}" aria-label="Đánh dấu xem lại ${text(label)}">⚑ <span>Đánh dấu xem lại</span></button></div>
      <div class="room-question-content">${text(stem || 'Xem nội dung câu hỏi trong đề gốc.')}</div>${illustrations(question)}${fields}
      <div class="room-question-footer"><button type="button" data-room-clear="${text(id)}">Xóa lựa chọn</button><span data-room-question-status>${questionAnswered(question, answers) ? 'Đã trả lời' : 'Chưa hoàn thành'}</span></div>
    </article>`;
  }
  function renderQuestions() {
    observer?.disconnect();
    window.MathJax?.typesetClear?.([find('[data-room-questions]')]);
    find('[data-room-questions]').innerHTML = questions.length ? questions.map(questionMarkup).join('')
      : '<div class="empty-state">Chưa trích xuất được câu hỏi. Bạn có thể xem đề gốc; cấu trúc câu hỏi cần được bổ sung vào kho học liệu.</div>';
    find('[data-room-palette]').innerHTML = questionGroups(questions).map(group => `<section class="room-palette-section"><h3>${text(group.title)}</h3><div class="room-palette-grid">${group.questions.map(question => `<button type="button" data-room-jump="${text(answerKey(question))}" aria-label="${text(group.title)} · Câu ${text(question.number)}">${text(question.number)}</button>`).join('')}</div></section>`).join('');
    if (!questions.some(question => answerKey(question) === activeId)) activeId = questions.length ? answerKey(questions[0]) : '';
    if (mode === 'all' && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {
        if (mode !== 'all' || disposed) return;
        const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(visible[0].target.dataset.roomQuestion, false);
      }, { rootMargin: `-${headerHeight + 12}px 0px -45% 0px`, threshold: 0 });
      container.querySelectorAll('[data-room-question]').forEach(card => observer.observe(card));
    }
    updatePalette();
    typeset();
  }
  function typeset() {
    const math = window.MathJax;
    if (!math?.typesetPromise) return;
    Promise.resolve(math.startup?.promise).then(() => { if (!disposed) return math.typesetPromise([find('[data-room-questions]')]); }).catch(() => {});
  }
  function updatePalette() {
    if (disposed || !find('[data-room-progress]')) return;
    const done = countDone();
    find('[data-room-progress]').textContent = `Đã làm: ${done}/${questions.length} câu`;
    const progress = find('progress'); progress.max = questions.length || 1; progress.value = done;
    find('[data-room-flag-count]').textContent = `${flags.size} câu đánh dấu xem lại`;
    const index = questions.findIndex(question => answerKey(question) === activeId);
    find('[data-room-current]').textContent = questions.length ? `Câu ${index + 1} / ${questions.length}` : 'Chưa có câu hỏi';
    find('[data-room-prev]').disabled = index <= 0;
    find('[data-room-next]').disabled = index < 0 || index >= questions.length - 1;
    for (const question of questions) {
      const id = answerKey(question), answered = questionAnswered(question, answers), flagged = flags.has(id), active = id === activeId;
      const palette = [...container.querySelectorAll('[data-room-jump]')].find(button => button.dataset.roomJump === id);
      palette.classList.toggle('is-answered', answered); palette.classList.toggle('is-flagged', flagged); palette.classList.toggle('is-active', active);
      if (active) palette.setAttribute('aria-current', 'step'); else palette.removeAttribute('aria-current');
      palette.setAttribute('aria-label', `${question.layoutSectionTitle || questionGroups([question])[0]?.title} · Câu ${question.number} · ${answered ? 'Đã trả lời' : 'Chưa trả lời'}${flagged ? ' · Đánh dấu xem lại' : ''}`);
      const card = [...container.querySelectorAll('[data-room-question]')].find(card => card.dataset.roomQuestion === id);
      card.hidden = mode === 'single' && !active;
      card.querySelector('[data-room-question-status]').textContent = answered ? 'Đã trả lời' : 'Chưa hoàn thành';
      const flag = card.querySelector('[data-room-flag]'); flag.setAttribute('aria-pressed', String(flagged));
      flag.querySelector('span').textContent = flagged ? 'Đã đánh dấu xem lại' : 'Đánh dấu xem lại';
    }
  }
  function setActive(id, scroll = true) {
    activeId = id; updatePalette(); scheduleSave();
    if (scroll) {
      const card = [...container.querySelectorAll('[data-room-question]')].find(card => card.dataset.roomQuestion === id);
      card?.scrollIntoView({ behavior: mode === 'single' || reducedMotion() ? 'instant' : 'smooth', block: 'start' });
      card?.focus({ preventScroll: true });
    }
  }
  function lock(locked) {
    find('[data-room-questions]').querySelectorAll('input,textarea,button').forEach(input => { input.disabled = locked; });
    find('[data-room-submit]').disabled = phase === 'submitting';
  }
  async function submit(automatic = false) {
    if (disposed || ['loading', 'submitting', 'submitted', 'leaving'].includes(phase)) return;
    closeDialog();
    phase = 'submitting'; lock(true); save();
    message(automatic ? 'Đã hết giờ. Đang tự động thu bài…' : 'Đang nộp bài…');
    find('[data-room-submit]').textContent = 'Đang nộp bài…';
    try {
      const timeSpentSeconds = Math.max(0, (Number(document.durationMinutes) || 90) * 60 - secondsRemaining(deadline));
      const result = await submitRoomExam(examId, { ...answers }, controller.signal, { sessionId, timeSpentSeconds });
      if (disposed) return;
      phase = 'submitted'; clearInterval(interval); clearTimeout(saveTimeout);
      try { localStorage.removeItem(storageKey); } catch { /* Submission remains valid without local storage. */ }
      onComplete({ timeSpentSeconds, ...result }, { document, answers: { ...answers } });
    } catch (error) {
      if (disposed || controller.signal.aborted) return;
      phase = 'retry';
      const expired = secondsRemaining(deadline) === 0;
      lock(expired);
      find('[data-room-submit]').textContent = 'Thử nộp lại';
      message(`Chưa nộp được bài: ${error.message} Bản nháp được giữ. ${expired ? 'Đã hết giờ; hãy nhấn Thử nộp lại.' : 'Bạn có thể tiếp tục làm bài hoặc thử nộp lại.'}`);
      save();
    }
  }
  function tick() {
    if (disposed || !deadline) return;
    const seconds = secondsRemaining(deadline), warning = seconds <= 300;
    find('[data-room-timer]').textContent = timeLabel(seconds);
    find('[data-room-clock]').classList.toggle('is-warning', warning);
    find('[data-room-time-label]').textContent = seconds === 0 ? 'ĐÃ HẾT GIỜ' : warning ? 'CÒN DƯỚI 5 PHÚT' : 'THỜI GIAN CÒN LẠI';
    if (seconds === 0 && !expiryHandled) {
      expiryHandled = true;
      if (['active', 'retry'].includes(phase)) submit(true);
    }
  }
  function click(event) {
    const button = event.target.closest('button');
    if (!button || !container.contains(button)) return;
    if (button.hasAttribute('data-room-exit')) confirmExit();
    if (button.hasAttribute('data-room-cancel')) closeDialog();
    if (button.hasAttribute('data-room-confirm')) {
      if (button.dataset.roomConfirm === 'exit') {
        save(); phase = 'leaving'; closeDialog(); exitAction();
      } else submit();
    }
    if (button.hasAttribute('data-room-submit')) {
      if (phase === 'retry' || secondsRemaining(deadline) === 0) submit(secondsRemaining(deadline) === 0); else modal('submit');
    }
    if (button.hasAttribute('data-room-sidebar')) {
      const visible = documentBody.classList.toggle('exam-room-sidebar-visible');
      button.setAttribute('aria-expanded', String(visible)); button.textContent = visible ? 'Ẩn thanh bên' : 'Hiện thanh bên';
    }
    if (button.hasAttribute('data-room-jump')) setActive(button.dataset.roomJump);
    if (button.hasAttribute('data-room-prev') || button.hasAttribute('data-room-next')) {
      const index = questions.findIndex(question => answerKey(question) === activeId);
      const next = questions[index + (button.hasAttribute('data-room-next') ? 1 : -1)];
      if (next) setActive(answerKey(next));
    }
    if (button.hasAttribute('data-room-flag') && phase !== 'submitting') {
      const id = button.dataset.roomFlag; flags.has(id) ? flags.delete(id) : flags.add(id); updatePalette(); scheduleSave();
    }
    if (button.hasAttribute('data-room-clear') && (phase === 'active' || (phase === 'retry' && secondsRemaining(deadline) > 0))) {
      const question = questions.find(question => answerKey(question) === button.dataset.roomClear);
      const keys = question.type === 'true_false' ? question.statements.map(statement => `${answerKey(question)}${statement.id}`) : [answerKey(question)];
      keys.forEach(key => { delete answers[key]; });
      button.closest('[data-room-question]').querySelectorAll('input,textarea').forEach(input => {
        if (input.type === 'radio') input.checked = false; else input.value = '';
      });
      updatePalette(); scheduleSave();
    }
    if (button.hasAttribute('data-room-retry-load')) load();
  }
  function input(event) {
    const field = event.target;
    if (field.matches('[data-room-mode]')) {
      mode = field.value; renderQuestions(); setActive(activeId); save(); return;
    }
    if (!field.matches('[data-room-answer]') || !['active', 'retry'].includes(phase)) return;
    if (secondsRemaining(deadline) === 0) { tick(); return; }
    if (field.type === 'radio' && !field.checked) return;
    answers[field.dataset.roomAnswer] = field.value;
    updatePalette(); scheduleSave();
  }
  function beforeUnload(event) {
    if (!isInProgress()) return;
    save(); event.preventDefault(); event.returnValue = '';
  }
  const documentBody = window.document.body;
  function visibility() { if (!disposed && deadline) { save(); tick(); } }
  function draw() {
    container.innerHTML = `<section class="exam-room-view" aria-label="Phòng Thi Thực Chiến">
      <header class="room-header"><div class="room-header-info"><button type="button" data-room-exit>← Thoát phòng thi</button><div><p class="eyebrow">PHÒNG THI THỰC CHIẾN</p><h1>${text(document.title)}</h1><p class="muted">${text(document.subject)} · Mã đề ${text(document.examCode || document.id)}</p></div></div>
      <div class="room-clock" data-room-clock role="timer" aria-label="Thời gian còn lại" aria-live="off"><small data-room-time-label>THỜI GIAN CÒN LẠI</small><strong data-room-timer>${timeLabel(secondsRemaining(deadline))}</strong></div>
      <div class="room-header-actions"><button type="button" data-room-sidebar aria-controls="education-sidebar" aria-expanded="false">Hiện thanh bên</button><button class="button primary" type="button" data-room-submit>Nộp bài sớm</button></div></header>
      <p class="room-message" data-room-message role="status" aria-live="polite"></p>
      <div class="room-layout"><div class="room-main"><div class="room-view-controls"><label>Chế độ xem<select data-room-mode><option value="all" ${mode === 'all' ? 'selected' : ''}>Tất cả câu hỏi trên 1 trang</option><option value="single" ${mode === 'single' ? 'selected' : ''}>Từng câu một</option></select></label><small>Bản nháp tự lưu trên trình duyệt</small></div>
      <div data-room-source></div><form id="exam-room-answer-form" data-room-questions aria-label="Bài làm"></form>
      <nav class="room-navigation" aria-label="Điều hướng câu hỏi"><button type="button" data-room-prev>← Câu trước</button><span data-room-current></span><button type="button" data-room-next>Câu tiếp theo →</button></nav></div>
      <aside class="room-palette" aria-labelledby="room-palette-title"><div class="room-palette-heading"><span class="eyebrow">PHIẾU TRẢ LỜI</span><h2 id="room-palette-title">Tiến độ bài làm</h2><strong data-room-progress aria-live="polite"></strong><progress max="1" value="0" aria-label="Tiến độ hoàn thành"></progress><small data-room-flag-count></small></div>
      <div class="room-palette-legend"><span><i></i>Chưa trả lời</span><span><i class="answered"></i>Đã trả lời</span><span><i class="active"></i>Đang xem</span><span><i class="flagged"></i>Xem lại</span></div><div data-room-palette></div><p class="room-palette-note">Câu Đúng/Sai chỉ hoàn thành khi chọn đủ các ý. Nhấn số câu để chuyển nhanh.</p></aside></div>
      <dialog class="modal room-dialog" data-room-dialog aria-labelledby="room-dialog-title"><h2 id="room-dialog-title" data-room-dialog-title></h2><p data-room-dialog-copy></p><div class="modal-actions"><button type="button" data-room-cancel>Tiếp tục làm bài</button><button class="button primary" type="button" data-room-confirm></button></div></dialog></section>`;
    find('form').addEventListener('submit', event => event.preventDefault());
    renderQuestions();
    const header = find('.room-header');
    headerObserver = new ResizeObserver(() => {
      headerHeight = Math.ceil(header.getBoundingClientRect().height);
      container.style.setProperty('--room-header-height', `${headerHeight}px`);
    });
    headerObserver.observe(header);
  }
  async function loadSource() {
    const source = find('[data-room-source]');
    const url = document.fileUrl || document.url;
    const name = document.originalName || document.filename || '';
    if (/\.pdf$/i.test(name) && url) {
      source.innerHTML = `<details class="room-source" open><summary>Đề gốc · Công thức, hình ảnh và đồ thị</summary><div class="pdf-reader" data-question-source="true"></div></details>`;
      sourceReader = source.querySelector('.pdf-reader');
      const result = await mountPdfReader(sourceReader, url);
      if (disposed) { sourceReader?._pdfCleanup?.(); return; }
      if (result?.questions?.length) { questions = roomQuestions(document, layout, result.questions); renderQuestions(); }
      else message('Đề PDF chưa trích xuất được chữ. Hãy đối chiếu nội dung và hình minh họa trong đề gốc.');
    } else if (/\.(txt|docx)$/i.test(name) && url && !document.content) {
      source.innerHTML = '<p role="status">Đang đọc nội dung đề…</p>';
      try {
        const content = await loadExamText(document, controller.signal);
        if (disposed) return;
        questions = roomQuestions(document, layout, parseQuestionText(content)); renderQuestions();
        source.innerHTML = `<details class="room-source"><summary>Xem toàn bộ đề gốc</summary><pre>${text(content)}</pre></details>`;
      } catch (error) { if (!disposed) source.textContent = error.message; }
    }
    if (!disposed && ['retry', 'submitting'].includes(phase)) lock(phase === 'submitting' || secondsRemaining(deadline) === 0);
  }
  async function load() {
    if (disposed) return;
    container.innerHTML = '<section class="exam-room-loading"><h1>Phòng Thi Thực Chiến</h1><p role="status">Đang chuẩn bị đề thi…</p></section>';
    try {
      storageKey = draftKey(user?.id, examId);
      let saved;
      try { saved = readRoomDraft(localStorage, storageKey); } catch { saved = null; }
      const data = await loadExamRoom(examId, controller.signal, cachedDocument, saved?.sessionId);
      if (disposed) return;
      document = data.document; layout = data.layout; onDocument?.(document);
      questions = roomQuestions(document, layout);
      sessionId = data.session?.sessionId;
      if (data.session?.result) {
        phase = 'submitted';
        try { localStorage.removeItem(storageKey); } catch {}
        onComplete(data.session.result, { document, answers: data.session.result.answers || {} });
        return;
      }
      answers = saved?.answers || {}; flags = new Set(saved?.flags || []); mode = saved?.mode || 'all'; activeId = saved?.activeId || '';
      deadline = data.session ? Date.now() + Math.max(0, data.session.deadline - data.session.serverTime) : saved?.deadline || Date.now() + (Number(document.durationMinutes) || 90) * 60000;
      phase = 'active'; draw(); save(); tick();
      interval = setInterval(tick, 250);
      if (saved && secondsRemaining(deadline)) message('Đã khôi phục bản nháp và thời gian còn lại.');
      loadSource();
    } catch (error) {
      if (disposed || controller.signal.aborted) return;
      container.innerHTML = `<section class="exam-room-loading"><h1>Chưa mở được phòng thi</h1><p role="alert">${text(error.message)}</p><button type="button" data-room-retry-load>Thử lại</button><button type="button" data-room-exit>← Về kho đề</button></section>`;
    }
  }
  container.addEventListener('click', click);
  container.addEventListener('input', input);
  mathScript?.addEventListener('load', typeset);
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('pagehide', save);
  window.document.addEventListener('visibilitychange', visibility);
  load();
  return { isInProgress, confirmExit, dispose() {
    save(); disposed = true; controller.abort(); clearInterval(interval); clearTimeout(saveTimeout);
    observer?.disconnect(); headerObserver?.disconnect(); sourceReader?._pdfCleanup?.();
    closeDialog(); window.MathJax?.typesetClear?.([container]);
    container.removeEventListener('click', click); container.removeEventListener('input', input);
    mathScript?.removeEventListener('load', typeset);
    window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', save);
    window.document.removeEventListener('visibilitychange', visibility);
    container.style.removeProperty('--room-header-height'); documentBody.classList.remove('exam-room-sidebar-visible');
  } };
}
