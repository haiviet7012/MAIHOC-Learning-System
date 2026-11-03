import crypto from 'node:crypto';
import { publicAppOrigin } from './school-notifications.js';
import { deliverMail } from './mail-delivery.js';
import { registerUser, createSession, isSuperAdminUser, isEducationEmail } from './auth.js';
import { validateTeacherProfile, saveTeacherAssignments } from './school-system.js';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export { isEducationEmail } from './auth.js';
export async function ensureAccountUpgrade(db) {
  await db.transaction(async () => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('maihoc-account-upgrade-v1'))");
    await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS school_plan TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS school_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_manager BOOLEAN NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS teacher_signup_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at BIGINT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,verified_hash TEXT,consumed BOOLEAN NOT NULL DEFAULT false,created_at BIGINT NOT NULL,requester_key TEXT);
      CREATE INDEX IF NOT EXISTS teacher_signup_email_idx ON teacher_signup_challenges(email,created_at);`);
    const migrated = await db.prepare("SELECT name FROM app_migrations WHERE name='account-plans-v1'").get();
    if (!migrated) {
      await db.prepare("UPDATE users SET school_plan='legacy' WHERE account_type='school' OR EXISTS(SELECT 1 FROM school_class_members m WHERE m.user_id=users.id)").run();
      await db.prepare("INSERT INTO app_migrations(name) VALUES('account-plans-v1')").run();
    }
  })();
}
export function installAccountUpgrade(app, { db, requireAuth, requireSameOrigin, send = deliverMail }) {
  const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
  app.post(['/api/auth/teacher/request-code','/api/auth/teacher/request-link'], requireSameOrigin, wrap(async(req,res)=>{
    const linkMode=req.path.endsWith('/request-link'), origin=publicAppOrigin();
    if(linkMode&&!origin)return res.status(503).json({error:'Chưa cấu hình địa chỉ website để gửi link xác nhận. Vui lòng liên hệ quản trị viên.'});
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEducationEmail(email)) return res.status(400).json({error:'Giáo viên cần email của trường có đuôi .edu.vn.'});
    const existing = await db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email);
    if(existing) return res.status(409).json({error:'Email đã có tài khoản. Hãy đăng nhập; tài khoản hiện tại được giữ nguyên.'});
    const requesterKey=digest(String(req.ip));
    const now=Date.now(), id=crypto.randomUUID(), code=linkMode?crypto.randomBytes(32).toString('hex'):String(crypto.randomInt(100000,1000000));
    const reserved=await db.transaction(async()=>{
      // Serialize requests for the same address across processes.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[requesterKey]);
      const requests=await db.prepare('SELECT count(*) AS n FROM teacher_signup_challenges WHERE requester_key=? AND created_at>?').get(requesterKey,now-900000);
      if(Number(requests.n)>=5)return false;
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[email]);
      const recent=await db.prepare('SELECT id FROM teacher_signup_challenges WHERE email=? AND created_at>? LIMIT 1').get(email,now-60000);
      if(recent)return false;
      await db.prepare('INSERT INTO teacher_signup_challenges(id,email,code_hash,expires_at,created_at,requester_key) VALUES(?,?,?,?,?,?)').run(id,email,(linkMode?'link:':'')+digest(id+code),now+600000,now,requesterKey);
      return true;
    })();
    if(!reserved)return res.status(429).json({error:'Vui lòng chờ trước khi gửi mã mới (60 giây mỗi email, tối đa 5 yêu cầu trong 15 phút).'});
    const text=linkMode?`Xác nhận email đăng ký giáo viên MAIHOC: ${origin}/learning#teacher-email-confirm=${id}:${code}\nLink có hiệu lực 10 phút. Bấm link rồi chọn Xác nhận email để hoàn tất hồ sơ. Nếu không yêu cầu đăng ký, hãy bỏ qua thư này. Không chia sẻ link.`:`Mã xác minh: ${code}. Hiệu lực 10 phút. Không chia sẻ mã này.`;
    try{await send({to:email,subject:'MAIHOC — Xác minh email giáo viên',text});}
    catch(error){console.warn('Teacher verification email failed',{category:/^[A-Z0-9_]{1,50}$/.test(String(error.code||''))?error.code:'MAIL_DELIVERY_FAILED'});await db.prepare('UPDATE teacher_signup_challenges SET consumed=true WHERE id=?').run(id);return res.status(503).json({error:'Chưa gửi được email xác minh. Hãy kiểm tra cấu hình mail và thử lại.'});}
    res.json({challengeId:id,message:linkMode?'Link xác nhận đã được gửi về email. Vui lòng mở thư để tiếp tục đăng ký.':'Mã xác minh đã được gửi về email.'});
  }));
  app.post('/api/auth/teacher/verify-code', requireSameOrigin, wrap(async(req,res)=>{
    const result=await db.transaction(async()=>{
      const challenge=await db.prepare('SELECT * FROM teacher_signup_challenges WHERE id=? FOR UPDATE').get(String(req.body.challengeId||''));
      if(!challenge||challenge.consumed||challenge.expires_at<Date.now()||challenge.attempts>=5)return null;
      await db.prepare('UPDATE teacher_signup_challenges SET attempts=attempts+1 WHERE id=?').run(challenge.id);
      if(digest(challenge.id+String(req.body.code||''))!==challenge.code_hash)return null;
      const token=crypto.randomBytes(32).toString('hex');
      await db.prepare('UPDATE teacher_signup_challenges SET verified_hash=? WHERE id=?').run(digest(token),challenge.id);
      return {token,email:challenge.email};
    })();
    if(!result)return res.status(400).json({error:'Mã không đúng, hết hạn hoặc đã quá 5 lần thử.'});
    res.json(result);
  }));
  app.post('/api/auth/teacher/verify-link', requireSameOrigin, wrap(async(req,res)=>{
    res.set('Cache-Control','no-store');
    const result=await db.transaction(async()=>{
      const challenge=await db.prepare('SELECT * FROM teacher_signup_challenges WHERE id=? FOR UPDATE').get(String(req.body.challengeId||''));
      if(!challenge||challenge.consumed||challenge.expires_at<Date.now()||challenge.attempts>=5)return null;
      await db.prepare('UPDATE teacher_signup_challenges SET attempts=attempts+1 WHERE id=?').run(challenge.id);
      if(challenge.code_hash!=='link:'+digest(challenge.id+String(req.body.linkToken||'')))return null;
      const token=crypto.randomBytes(32).toString('hex');
      await db.prepare('UPDATE teacher_signup_challenges SET verified_hash=? WHERE id=?').run(digest(token),challenge.id);
      return {token,email:challenge.email};
    })();
    if(!result)return res.status(400).json({error:'Link không hợp lệ, đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu link mới.'});
    res.json(result);
  }));
  app.post('/api/auth/teacher/register', requireSameOrigin, wrap(async(req,res)=>{
    const user=await db.transaction(async()=>{
      const email=String(req.body.email||'').trim().toLowerCase();
      if(!isEducationEmail(email))throw Error('Giáo viên cần email của trường có đuôi .edu.vn.');
      const challenge=await db.prepare('SELECT * FROM teacher_signup_challenges WHERE id=? FOR UPDATE').get(String(req.body.challengeId||''));
      if(!challenge||challenge.consumed||challenge.expires_at<Date.now()||challenge.email!==email||!challenge.verified_hash||challenge.verified_hash!==digest(String(req.body.token||'')))throw Error('Vui lòng xác nhận quyền sử dụng email qua link trong hộp thư trước khi đăng ký.');
      const profile=await validateTeacherProfile(db,req.body);
      const user=await registerUser({...req.body,email,accountType:'teacher'},{teacherProfileValidated:true,teacherEmailVerified:true});
      await saveTeacherAssignments(db,user.id,profile);
      await db.prepare('UPDATE teacher_signup_challenges SET consumed=true WHERE id=?').run(challenge.id);
      return user;
    })();
    await createSession(user.id,res);res.status(201).json({user});
  }));
  app.get('/api/account/school-plan',requireAuth,(req,res)=>res.json({plan:req.user.schoolPlan,pricesPublished:false}));
  app.put('/api/admin/users/:id/school-plan',requireSameOrigin,requireAuth,wrap(async(req,res)=>{
    if(!isSuperAdminUser(req.user))return res.sendStatus(403);
    const student=await db.prepare("SELECT id FROM users WHERE id=? AND role='user'").get(req.params.id);
    if(!student)return res.sendStatus(404);
    if(!['none','standard'].includes(req.body.plan))return res.sendStatus(400);
    const changed=await db.prepare("UPDATE users SET school_plan=?,account_type=CASE WHEN ?='none' THEN account_type ELSE 'school' END WHERE id=? AND role='user' RETURNING id").get(req.body.plan,req.body.plan,req.params.id);
    if(!changed)return res.sendStatus(404);res.json({ok:true});
  }));
}
