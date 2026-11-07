export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Schedule inputs without an offset are Vietnamese wall time. Database event
// timestamps without an offset are UTC. Explicit offsets always keep their instant.
function parseTimestamp(value, defaultOffset) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'number') return new Date(value);
  const raw = String(value ?? '').trim();
  if (!raw) return new Date(NaN);
  let iso = raw.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (iso.includes('T')) iso = iso.replace(/([+-]\d{2})$/, '$1:00');
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(iso);
  if (!parts) return new Date(NaN);
  const [, year, month, day, hour='0', minute='0', second='0'] = parts;
  const calendar = new Date(Date.UTC(Number(year), Number(month)-1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth()+1 !== Number(month) || calendar.getUTCDate() !== Number(day)
    || Number(hour)>23 || Number(minute)>59 || Number(second)>59) return new Date(NaN);
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += iso.includes('T') ? defaultOffset : `T00:00:00${defaultOffset}`;
  return new Date(iso);
}
export const parseVietnamSchedule = value => parseTimestamp(value, '+07:00');
export const parseUtcTimestamp = value => parseTimestamp(value, 'Z');
export function vietnamScheduleIso(value) {
  const date = parseVietnamSchedule(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function vietnamDateTimeInput(value = new Date()) {
  const date = value instanceof Date ? value : parseUtcTimestamp(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: VIETNAM_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function formatVietnamDateTime(value, { schedule = false } = {}) {
  const date = schedule ? parseVietnamSchedule(value) : parseUtcTimestamp(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TIME_ZONE, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(date);
}
