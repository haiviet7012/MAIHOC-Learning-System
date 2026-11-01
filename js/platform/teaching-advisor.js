import { api } from './api.js';
import { escapeHTML as e } from '../ui.js';

export function mountTeachingAdvisor(container) {
  const controller = new AbortController();
  let mode = 'lesson', classes = [], students = [], loading = false, sequence = 0;
  container.innerHTML = `<section class="portal-panel advisor teaching-advisor"><div class="advisor-heading"><div><p class="eyebrow">MAIHOC · GIÁO VIÊN</p><h2>Cố vấn giảng dạy</h2><p>Thiết kế dựa trên tiến trình và kết quả học tập đã lưu.</p></div></div><div class="advisor-options"><button type="button" class="button primary" data-teaching-mode="lesson" aria-pressed="true">Hỗ trợ thiết kế bài giảng</button><button type="button" class="button secondary" data-teaching-mode="plan" aria-pressed="false">Hỗ trợ thiết kế lộ trình cho học sinh</button></div><form data-teaching-form><label>Lớp<select name="classKey" required disabled><option value="">Đang tải lớp được phân công…</option></select></label><label>Học sinh (tùy chọn)<select name="studentId" disabled><option value="">Cả lớp</option></select></label><label>Môn học<input name="subject" maxlength="100" placeholder="Ví dụ: Toán" required></label><label>Khoảng dữ liệu<select name="days"><option value="30">30 ngày</option><option value="7">7 ngày</option><option value="90">90 ngày</option></select></label><label data-teaching-duration>Thời lượng bài giảng (phút)<input name="minutes" type="number" min="10" max="240" value="45" required></label><label>Nội dung, mục tiêu và yêu cầu<textarea name="message" rows="4" maxlength="4000" placeholder="Ví dụ: thiết kế bài học về hàm số bậc hai, có hoạt động nhóm và phân hóa." required></textarea></label><p class="muted tiny">Để trống tên học sinh để thiết kế cho cả lớp. Bản gợi ý cần được giáo viên rà soát trước khi sử dụng.</p><button type="submit" class="button primary" disabled>Tạo bản thiết kế</button></form><p data-teaching-status role="status" aria-live="polite">Đang tải danh sách lớp…</p><div data-teaching-result></div></section>`;
  const form = container.querySelector('form'), status = container.querySelector('[data-teaching-status]'), output = container.querySelector('[data-teaching-result]');
  const classSelect = form.elements.classKey, studentSelect = form.elements.studentId;
  function enable() {
    classSelect.disabled = loading || !classes.length;
    studentSelect.disabled = loading || !students.length;
    form.querySelector('button[type=submit]').disabled = loading || !classSelect.value || (mode === 'plan' && !students.length);
  }
  async function loadStudents() {
    const token = ++sequence; students = []; output.innerHTML = ''; studentSelect.innerHTML = '<option value="">Cả lớp</option>';
    loading = true; enable(); status.textContent = 'Đang tải học sinh…';
    try {
      const data = await api(`/api/teaching-advisor/students?classKey=${encodeURIComponent(classSelect.value)}`, { signal: controller.signal });
      if (controller.signal.aborted || token !== sequence) return;
      students = data.students;
      studentSelect.innerHTML += students.map(s => `<option value="${e(s.id)}">${e(s.name)}</option>`).join('');
      status.textContent = students.length ? 'Chọn học sinh hoặc giữ Cả lớp, rồi nhập yêu cầu.' : 'Lớp chưa có học sinh.';
    } catch (error) { if (!controller.signal.aborted) status.textContent = error.message; }
    finally { if (token === sequence && !controller.signal.aborted) { loading = false; enable(); } }
  }
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-teaching-mode]');
    if (!button || loading) return;
    mode = button.dataset.teachingMode; output.innerHTML = '';
    container.querySelectorAll('[data-teaching-mode]').forEach(node => { const active = node.dataset.teachingMode === mode; node.className = `button ${active ? 'primary' : 'secondary'}`; node.setAttribute('aria-pressed', String(active)); });
    container.querySelector('[data-teaching-duration]').firstChild.textContent = mode === 'lesson' ? 'Thời lượng bài giảng (phút)' : 'Thời gian học mỗi ngày (phút)';
    enable();
    form.elements.message.placeholder = mode === 'lesson' ? 'Chủ đề, mục tiêu, hoạt động và cách đánh giá mong muốn.' : 'Mục tiêu, thời hạn và yêu cầu của lộ trình học.';
  }, { signal: controller.signal });
  form.addEventListener('change', event => {
    if (event.target === classSelect) void loadStudents();
    else output.innerHTML = '';
  }, { signal: controller.signal });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (loading || !form.reportValidity()) return;
    const body = { ...Object.fromEntries(new FormData(form)), mode };
    loading = true; enable(); output.innerHTML = ''; status.textContent = 'Đang đọc dữ liệu và thiết kế…';
    form.querySelectorAll('input,textarea,select').forEach(n => { n.disabled = true; });
    try {
      const result = await api('/api/teaching-advisor/generate', { method: 'POST', body, signal: controller.signal });
      if (controller.signal.aborted) return;
      output.innerHTML = `<article class="advisor-plan"><h3>${body.mode === 'lesson' ? 'Bản thiết kế bài giảng' : 'Lộ trình đề xuất'}</h3><p class="teaching-reply">${e(result.reply)}</p>${result.tasks.length ? `<ol>${result.tasks.map(t => `<li><strong>Ngày ${t.day} · ${e(t.subject)}</strong><p>${e(t.title)} · ${t.minutes} phút</p></li>`).join('')}</ol>` : ''}</article>`;
      status.textContent = 'Đã tạo bản gợi ý. Bạn có thể điều chỉnh yêu cầu để tạo lại.';
    } catch (error) { if (!controller.signal.aborted) status.textContent = error.message; }
    finally { if (!controller.signal.aborted) { loading = false; form.querySelectorAll('input,textarea,select').forEach(n => { n.disabled = false; }); enable(); } }
  }, { signal: controller.signal });
  api('/api/teaching-advisor/classes', { signal: controller.signal }).then(data => {
    if (controller.signal.aborted) return;
    classes = data.classes; classSelect.innerHTML = '<option value="">Chọn lớp</option>' + classes.map(c => `<option value="${e(c.key)}">${e(c.name)}</option>`).join('');
    status.textContent = classes.length ? 'Chọn lớp được phân công để bắt đầu.' : 'Bạn chưa được phân công lớp. Hãy liên hệ quản trị viên.'; enable();
  }).catch(error => { if (!controller.signal.aborted) status.textContent = error.message; });
  return () => controller.abort();
}
