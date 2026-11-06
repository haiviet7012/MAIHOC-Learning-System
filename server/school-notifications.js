import { randomUUID } from 'node:crypto';
import { deliverMail, mailConfig } from './mail-delivery.js';
import { isTeacherUser, isSuperAdminUser } from './auth.js';

const CLASSES = Array.from({ length: 27 }, (_, i) => `${10 + Math.floor(i / 9)}${['A','B','C'][Math.floor(i / 9)]}${i % 9 + 1}`);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function publicAppOrigin(env = process.env) {
  try {
    const url = new URL(env.APP_PUBLIC_URL || env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
export const schoolMailDate = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) + ' (giờ Việt Nam)';
export async function ensureSchoolNotifications(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS school_announcements (
      id TEXT PRIMARY KEY, teacher_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL, message TEXT NOT NULL, class_codes JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS school_announcement_recipients (
      announcement_id TEXT NOT NULL REFERENCES school_announcements(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(announcement_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS school_mail_outbox (
      id TEXT PRIMARY KEY, event_key TEXT NOT NULL, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, message TEXT NOT NULL, link TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','cancelled')),
      attempts INTEGER NOT NULL DEFAULT 0, next_at BIGINT NOT NULL DEFAULT 0,
      claim_token TEXT, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ,
      UNIQUE(event_key,user_id)
    );
    CREATE INDEX IF NOT EXISTS school_mail_ready_idx ON school_mail_outbox(status,next_at);
  `);
}
export function targetClasses({ classCode, grade }) {
  const code = String(classCode || '').trim().toUpperCase();
  const level = String(grade || '').trim();
  if (code === 'ALL') {
    if (!['10','11','12'].includes(level)) fail('Vui lòng chọn khối 10, 11 hoặc 12.');
    return CLASSES.filter(c => c.startsWith(level));
  }
  if (!CLASSES.includes(code)) fail('Vui lòng chọn lớp nhận hợp lệ.');
  if (level && !code.startsWith(level)) fail('Lớp nhận không thuộc khối đã chọn.');
  return [code];
}
export async function schoolRecipients(db, classes) {
  return (await db.query(`SELECT DISTINCT u.id FROM users u JOIN school_class_members m ON m.user_id=u.id
    WHERE u.role='user' AND COALESCE(u.admin_level,0)=0 AND u.account_type='school'
    AND m.class_code=ANY($1::text[])`, [classes])).rows.map(u => u.id);
}
export async function enqueueSchoolNotice(db, { eventKey, userIds, title, message, link }) {
  if (!(eventKey.startsWith('management:') && link === '/school') && !/^\/school\/(?:tests|announcements|assignments)\/[\w%-]+(?:\?schoolId=\d+)?$/i.test(link)) fail('Liên kết thông báo không hợp lệ.');
  let count = 0;
  for (const userId of new Set(userIds.map(String))) {
    const added = await db.prepare(`INSERT INTO school_mail_outbox(id,event_key,user_id,title,message,link)
      VALUES(?,?,?,?,?,?) ON CONFLICT(event_key,user_id) DO NOTHING RETURNING id`).get(randomUUID(), eventKey, userId, title, message, link);
    if (!added) continue;
    await db.prepare('INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)')
      .run(userId, eventKey.startsWith('announcement:') ? 'school_announcement' : 'new_class_test', title, message, link);
    count++;
  }
  return count;
}
export function createSchoolMailWorker(db, { env = process.env, send = deliverMail, now = Date.now } = {}) {
  let timer, busy = false;
  async function drain({ limit = 20 } = {}) {
    if (busy || !mailConfig(env).configured || !publicAppOrigin(env)) return 0;
    busy = true;
    let processed = 0;
    try {
      for (let i = 0; i < limit; i++) {
        const token = randomUUID(), time = now();
        const job = (await db.query(`WITH candidate AS (
          SELECT id FROM school_mail_outbox WHERE (status='queued' OR status='sending') AND next_at<=$1
          ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
          UPDATE school_mail_outbox o SET status='sending',claim_token=$2,next_at=$3,attempts=o.attempts+1
          FROM candidate c WHERE o.id=c.id RETURNING o.*`, [time, token, time + 120000])).rows[0];
        if (!job) break;
        try {
          const management = job.event_key.startsWith('management:');
          const user = management ? await db.prepare("SELECT email FROM users WHERE id=?").get(job.user_id) : await db.prepare("SELECT email FROM users WHERE id=? AND role='user' AND account_type='school' AND COALESCE(admin_level,0)=0").get(job.user_id);
          // Deleted tests/announcements must never produce stale email.
          const [kind, id] = job.event_key.split(':');
          const exists = management ? await db.prepare('SELECT r.id FROM school_management_records r JOIN school_guardians g ON g.school_id=r.school_id AND g.student_id=r.student_id WHERE r.id=? AND g.guardian_id=?').get(id,job.user_id) : kind === 'test' ? await db.prepare('SELECT id FROM tests WHERE id=?').get(id)
            : kind === 'announcement' ? await db.prepare('SELECT id FROM school_announcements WHERE id=?').get(id)
            : await db.prepare('SELECT id FROM assessment_assignments WHERE id=?').get(id);
          if (!user?.email || !exists) {
            await db.prepare("UPDATE school_mail_outbox SET status='cancelled',claim_token=NULL WHERE id=? AND claim_token=?").run(job.id, token);
            continue;
          }
          const url = publicAppOrigin(env) + job.link;
          await send({ to: user.email, subject: `[MAIHOC] ${job.title.replace(/[\r\n]+/g, ' ')}`,
            text: `${job.title}\n\n${job.message}\n\nXem trên MAIHOC: ${url}\nNếu chưa đăng nhập, hãy đăng nhập bằng tài khoản nhận email để mở nội dung.`,
            html: `<h2>${esc(job.title)}</h2><p style="white-space:pre-line">${esc(job.message)}</p><p><a href="${esc(url)}">Xem trên MAIHOC</a></p><p>Đăng nhập bằng tài khoản nhận email để mở nội dung.</p>` }, { env });
          await db.prepare("UPDATE school_mail_outbox SET status='sent',sent_at=now(),claim_token=NULL,last_error=NULL WHERE id=? AND claim_token=?").run(job.id, token);
          processed++;
        } catch (error) {
          const category = /^[A-Z0-9_]{1,50}$/.test(error.code || '') ? error.code : 'MAIL_DELIVERY_FAILED';
          await db.prepare('UPDATE school_mail_outbox SET status=?,next_at=?,last_error=?,claim_token=NULL WHERE id=? AND claim_token=?')
            .run(job.attempts >= 8 ? 'failed' : 'queued', now() + Math.min(86400000, 60000 * 2 ** (job.attempts - 1)), category, job.id, token);
          console.warn('[School mail]', { id: job.id, category });
        }
      }
    } finally { busy = false; }
    return processed;
  }
  return { drain, start() { if (!timer) { timer = setInterval(() => { void drain().catch(() => console.warn('[School mail] Queue unavailable')); }, 15000); timer.unref?.(); } }, stop() { clearInterval(timer); timer = null; } };
}
export function installSchoolAnnouncementRoutes(app, { db, requireAuth, requireSameOrigin }) {
  const teacher = user => isTeacherUser(user) || isSuperAdminUser(user);
  app.post('/api/school/announcements', requireSameOrigin, requireAuth, async (req, res) => {
    try {
      if (!teacher(req.user)) fail('Chỉ giáo viên được gửi thông báo.', 403);
      const title = String(req.body.title || '').trim(), message = String(req.body.message || '').trim();
      if (!title || title.length > 120 || !message || message.length > 2000) fail('Nhập tiêu đề (tối đa 120 ký tự) và nội dung (tối đa 2.000 ký tự).');
      const classes = targetClasses(req.body);
      if (!isSuperAdminUser(req.user) && String(req.body.classCode || '').trim().toUpperCase() !== 'ALL') {
        const assigned = await db.prepare('SELECT id FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1').get(req.user.id, classes[0]);
        if (!assigned) fail('Bạn chỉ được gửi cho lớp được phân công hoặc chọn Cả khối.', 403);
      }
      const id = randomUUID();
      const recipients = await db.transaction(async () => {
        const users = await schoolRecipients(db, classes);
        await db.prepare('INSERT INTO school_announcements(id,teacher_id,title,message,class_codes) VALUES(?,?,?,?,?)').run(id, req.user.id, title, message, JSON.stringify(classes));
        for (const userId of users) await db.prepare('INSERT INTO school_announcement_recipients(announcement_id,user_id) VALUES(?,?)').run(id, userId);
        await enqueueSchoolNotice(db, { eventKey: `announcement:${id}`, userIds: users, title: `Thông báo: ${title}`, message: `${req.user.name}: ${message}`, link: `/school/announcements/${id}` });
        return users.length;
      })();
      res.status(201).json({ id, recipients, emailQueued: recipients });
    } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
  });
  app.get('/api/school/announcements', requireAuth, async (req, res) => {
    const items = (await db.query(`SELECT a.id,a.title,a.created_at AS "createdAt" FROM school_announcements a
      WHERE a.teacher_id=$1 OR EXISTS(SELECT 1 FROM school_announcement_recipients r WHERE r.announcement_id=a.id AND r.user_id=$1)
      ORDER BY a.created_at DESC LIMIT 100`, [req.user.id])).rows;
    res.json({ items });
  });
  app.get('/api/school/announcements/:id', requireAuth, async (req, res) => {
    const item = await db.prepare(`SELECT a.*,u.name AS teacher_name FROM school_announcements a LEFT JOIN users u ON u.id=a.teacher_id
      WHERE a.id=? AND (a.teacher_id=? OR EXISTS(SELECT 1 FROM school_announcement_recipients r WHERE r.announcement_id=a.id AND r.user_id=?))`).get(req.params.id, req.user.id, req.user.id);
    if (!item) return res.status(404).json({ error: 'Thông báo không tồn tại hoặc bạn không thuộc nhóm nhận.' });
    res.json({ item });
  });
}
