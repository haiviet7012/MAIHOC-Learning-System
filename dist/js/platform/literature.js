import { escapeHTML as e, pageHeading } from '../ui.js';
import { api } from './api.js';

const groups = [
  ['reading', 'Đề ôn tập đọc hiểu', 'Luyện nhận biết, phân tích và trả lời ngắn gọn.', '▤'],
  ['writing', 'Đề ôn tập làm văn', 'Rèn lập luận, dẫn chứng và cách diễn đạt.', '✎'],
  ['combined', 'Đề ôn tổng hợp', 'Ôn cả đọc hiểu và viết theo cấu trúc 4–6 điểm.', '▦'],
  ['tutor', 'Gia sư chấm Văn', 'Nhận xét bài gõ hoặc ảnh chụp vở theo từng tiêu chí.', '✧']
];
export function mountLiterature(container, { documents, user }) {
  const controller = new AbortController();
  container.innerHTML = `${pageHeading('Môn Ngữ văn', 'Chọn một khu vực học tập để tiếp tục.')}<div class="grid four">${groups.map(([key,title,desc,icon]) => `<article class="card clickable resource-card" role="button" tabindex="0" data-literature-tab="${key}" aria-expanded="false" aria-controls="literature-content"><div class="card-icon" aria-hidden="true">${icon}</div><h3>${title}</h3><p>${desc}</p><p style="margin-top:18px;color:var(--primary);font-weight:600">Mở mục →</p></article>`).join('')}</div><section id="literature-content" class="portal-panel" data-literature-content style="margin-top:24px" aria-live="polite" hidden></section>`;
  const content = container.querySelector('[data-literature-content]');
  let operation = 0;
  function tutor() {
    content.innerHTML = `<h2>Gia sư chấm Văn</h2><p>Đưa cả yêu cầu và ngữ liệu liên quan vào phần đề. Ảnh viết tay được chép thành chữ để bạn đối chiếu trước khi chấm.</p>${!user ? '<p>Đăng nhập để sử dụng gia sư.</p>' : ''}<form class="upgrade-form" data-literature-form><label>Loại bài<select name="kind"><option value="II-1">Đoạn nghị luận xã hội · 2 điểm</option><option value="II-2">Bài nghị luận văn học · 4 điểm</option></select></label><div class="grid two">${[['prompt','Đề bài và ngữ liệu'],['answer','Bài làm của bạn']].map(([key,title]) => `<section><h3>${title}</h3><label>${title}<textarea name="${key}" rows="12" maxlength="${key === 'prompt' ? 12000 : 30000}" placeholder="Nhập chữ hoặc dán ảnh vào đây…" required></textarea></label><label>Thêm ảnh (JPG, PNG, WebP · tối đa 6 MB/ảnh)<input type="file" data-literature-image="${key}" accept="image/jpeg,image/png,image/webp" ${!user ? 'disabled' : ''}></label><div data-preview="${key}"></div><p class="muted">Có thể thêm lần lượt nhiều trang theo đúng thứ tự. Nội dung đọc được sẽ nối vào cuối bản chép.</p></section>`).join('')}</div><label><input type="checkbox" name="confirmed" required> Tôi đã kiểm tra đề và bài làm, sửa các chỗ đọc sai hoặc [không đọc rõ].</label><button class="button primary" type="submit" ${!user ? 'disabled' : ''}>Chấm và nhận góp ý</button><p role="status" data-literature-status></p><div data-literature-result></div></form>`;
  }
  container.addEventListener('keydown', ev => {
    const tab = ev.target.closest('[data-literature-tab]');
    if (tab && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault(); ev.stopPropagation(); tab.click();
    }
  }, { signal: controller.signal });
  container.addEventListener('click', ev => {
    const tab = ev.target.closest('[data-literature-tab]');
    if (!tab) return;
    operation++;
    content.hidden = false;
    container.querySelectorAll('[data-literature-tab]').forEach(b => b.setAttribute('aria-expanded', String(b === tab)));
    const group = tab.dataset.literatureTab;
    if (group === 'tutor') return tutor();
    const patterns = { reading: /đọc hiểu/iu, writing: /làm văn|nghị luận|viết đoạn|viết bài/iu, combined: /tổng hợp|thpt|tốt nghiệp/iu };
    const rows = documents.filter(d => d.subject === 'Ngữ văn' && (d.literatureSection === group || patterns[group].test(d.title + ' ' + (d.description || ''))));
    content.innerHTML = `<h2>${groups.find(g => g[0] === group)[1]}</h2><p>Lọc tài liệu theo nhóm hoặc tên đề trong kho Ngữ văn.</p>${rows.length ? rows.map(d => `<article class="resource-row"><div class="resource-main"><h3>${e(d.title)}</h3><p>${e(d.description || '')}</p></div><button class="button secondary" data-action="read-doc" data-id="${e(d.id)}">Mở đề</button></article>`).join('') : '<p>Chưa có tài liệu thuộc nhóm này. Tài liệu mới có thể được đặt tên theo nhóm đọc hiểu, làm văn hoặc tổng hợp.</p>'}`;
  }, { signal: controller.signal });
  async function transcribe(file, key) {
    const form = content.querySelector('form');
    if (!form || !user) return;
    const current = ++operation;
    const status = form.querySelector('[data-literature-status]');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) { status.textContent = 'Chọn ảnh JPG, PNG hoặc WebP tối đa 6 MB.'; return; }
    form.elements.confirmed.checked = false;
    form.querySelector('[type=submit]').disabled = true;
    const preview = form.querySelector(`[data-preview="${key}"]`);
    const reader = new FileReader();
    status.textContent = 'Đang đọc ảnh và chữ viết tay…';
    try {
      const image = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      preview.innerHTML = '';
      const img = document.createElement('img'); img.src = image; img.alt = 'Ảnh gốc để đối chiếu bản chép'; img.style.cssText = 'max-width:100%;max-height:280px;object-fit:contain'; preview.append(img);
      const result = await api('/api/literature/transcribe', { method: 'POST', body: { image }, signal: controller.signal });
      if (current !== operation || !form.isConnected) return;
      const field = form.elements[key];
      if ((field.value + '\n' + result.text).length > 30000) throw new Error('Bản chép vượt 30000 ký tự; hãy chia nhỏ bài.');
      field.value = [field.value, result.text].filter(Boolean).join('\n\n');
      status.textContent = 'Đã đọc ảnh. Hãy đối chiếu và sửa bản chép. ' + (result.warnings || []).join(' ');
    } catch (err) { if (current === operation) status.textContent = err.message; }
    finally { if (current === operation && form.isConnected) form.querySelector('[type=submit]').disabled = false; }
  }
  container.addEventListener('change', ev => { if (ev.target.matches('[data-literature-image]') && ev.target.files[0]) transcribe(ev.target.files[0], ev.target.dataset.literatureImage); }, { signal: controller.signal });
  container.addEventListener('paste', ev => {
    if (!ev.target.matches('textarea[name=prompt],textarea[name=answer]')) return;
    const file = [...(ev.clipboardData?.items || [])].find(x => x.type.startsWith('image/'))?.getAsFile();
    if (file) { ev.preventDefault(); transcribe(file, ev.target.name); }
  }, { signal: controller.signal });
  container.addEventListener('input', ev => { const f = ev.target.form; if (f && ev.target.name !== 'confirmed') { f.elements.confirmed.checked = false; f.querySelector('[data-literature-result]').innerHTML = ''; } }, { signal: controller.signal });
  container.addEventListener('submit', async ev => {
    if (!ev.target.matches('[data-literature-form]')) return;
    ev.preventDefault(); const form = ev.target; const current = ++operation;
    const status = form.querySelector('[data-literature-status]'), output = form.querySelector('[data-literature-result]'), button = form.querySelector('[type=submit]');
    [...form.elements].forEach(el => el.disabled = true); status.textContent = 'Gia sư đang đọc và nhận xét bài viết…'; output.innerHTML = '';
    try {
      const data = await api('/api/literature/tutor', { method: 'POST', body: { prompt: form.elements.prompt.value, answer: form.elements.answer.value, kind: form.elements.kind.value, confirmed: form.elements.confirmed.checked }, signal: controller.signal });
      if (current !== operation || !form.isConnected) return;
      status.textContent = data.message;
      if (data.errorCode) {
        output.innerHTML = `<h3>Đã nhận đề và bài làm, nhưng chưa chấm được</h3><p>Nội dung bạn nhập vẫn được giữ trong biểu mẫu. Hãy xử lý lỗi được báo ở trên rồi chấm lại.</p><p class="muted">Mã lỗi: ${e(data.errorCode)}</p>`;
      } else {
        output.innerHTML = `<h3>${data.proposedScore == null ? 'Cần xem lại bài' : `Điểm luyện tập đề xuất: ${e(data.proposedScore)}/${e(data.maximumPoints)}`}</h3><p>Đây là góp ý AI để luyện tập; giáo viên cần kiểm tra trước khi dùng làm điểm chính thức.</p>${(data.result?.criteria || []).map(c => `<article class="card"><h4>${e(c.label)} · ${e(c.points)}/${e(c.maxPoints)}</h4><p>${e(c.feedback)}</p>${c.evidence.map(q => `<blockquote>${e(q)}</blockquote>`).join('')}</article>`).join('')}`;
      }
    } catch (err) { if (current === operation) status.textContent = err.message; }
    finally { if (current === operation && form.isConnected) [...form.elements].forEach(el => el.disabled = false); }
  }, { signal: controller.signal });
  return () => { operation++; controller.abort(); };
}
