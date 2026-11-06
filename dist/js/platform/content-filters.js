// Legacy SQL timestamps are UTC; never interpret them in the browser's local zone.
export function contentTimestamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const text = String(value).trim();
  const iso = /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(text) ? text.replace(' ', 'T') + (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? '' : 'Z') : text;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}
export const isContentCompleted = item => item.completed === true || contentTimestamp(item.lastCompletedAt) !== null;
export const CONTENT_DATE_OPTIONS = { newest: 'Mới nhất → Cũ nhất', oldest: 'Cũ nhất → Mới nhất' };
export const CONTENT_STATE_OPTIONS = { 'unanswered-first': 'Chưa làm → Đã làm', unanswered: 'Chỉ chưa làm', completed: 'Chỉ đã làm', all: 'Tất cả · Theo ngày thêm' };

export function filterContentTimeline(items, { dateOrder = 'newest', completion = 'unanswered-first' } = {}) {
  const direction = dateOrder === 'oldest' ? 1 : -1;
  const timeOrder = (a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : (a - b) * direction;
  return items.filter(item => completion !== 'completed' && completion !== 'unanswered'
    || isContentCompleted(item) === (completion === 'completed')).sort((a, b) => {
    const doneA = isContentCompleted(a), doneB = isContentCompleted(b);
    if (completion === 'unanswered-first' && doneA !== doneB) return Number(doneA) - Number(doneB);
    const byCompletion = completion !== 'all' && doneA && doneB;
    return timeOrder(contentTimestamp(byCompletion ? a.lastCompletedAt : a.createdAt), contentTimestamp(byCompletion ? b.lastCompletedAt : b.createdAt))
      || timeOrder(contentTimestamp(a.createdAt), contentTimestamp(b.createdAt))
      || String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  });
}
