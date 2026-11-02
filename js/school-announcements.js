import { escapeHTML as e } from './ui.js';
export function mountSchoolAnnouncements(container, user, announcementId) {
  const controller = new AbortController();
  container.innerHTML = '<section class="portal-panel"><h1>Thông báo từ giáo viên</h1><p role="status">Đang tải…</p></section>';
  const url = '/api/school/announcements' + (announcementId ? '/' + encodeURIComponent(announcementId) : '');
  fetch(url, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' }).then(async response => {
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Không thể tải thông báo.');
    if (controller.signal.aborted) return;
    if (data.item) {
      const a = data.item;
      container.innerHTML = `<article class="portal-panel"><p class="eyebrow">THÔNG BÁO TỪ GIÁO VIÊN · ${e(a.teacher_name || 'MAIHOC')}</p><h1>${e(a.title)}</h1><p>${e(new Date(a.created_at).toLocaleString('vi-VN'))}</p><p style="white-space:pre-wrap">${e(a.message)}</p><a class="button secondary" href="/school/announcements">Danh sách thông báo</a></article>`;
    } else container.innerHTML = `<section class="portal-panel"><h1>Thông báo từ giáo viên</h1>${data.items.length ? data.items.map(a => `<article class="portal-record"><a href="/school/announcements/${encodeURIComponent(a.id)}">${e(a.title)}</a><small>${e(new Date(a.createdAt).toLocaleString('vi-VN'))}</small></article>`).join('') : '<p>Chưa có thông báo dành cho bạn.</p>'}</section>`;
  }).catch(error => { if (!controller.signal.aborted) container.innerHTML = `<section class="portal-panel"><h1>Thông báo từ giáo viên</h1><p role="alert">${e(error.message)}</p></section>`; });
  return () => controller.abort();
}
