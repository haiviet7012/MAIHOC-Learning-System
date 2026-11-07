import { publicUser } from './auth.js';
import { audit } from './platform/policy.js';

export function installAdminSchoolGrants(app, { db, requireSuperAdmin, requireSameOrigin }) {
  app.post('/api/admin/users/:id/school', requireSameOrigin, requireSuperAdmin, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID tài khoản không hợp lệ.' });
    try {
      const result = await db.transaction(async () => {
        const target = (await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!target) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
        if (target.role !== 'user') throw Object.assign(new Error('Admin và giáo viên đã có quyền School theo vai trò.'), { status: 409 });
        const permanent = ['legacy', 'premium'].includes(target.school_plan)
          || target.school_plan === 'standard' && target.school_expires_at == null;
        if (permanent) return { granted: false, user: publicUser(target), message: 'Tài khoản đã có School không thời hạn.' };
        const updated = (await db.query(
          "UPDATE users SET school_plan='standard',school_expires_at=NULL,account_type='school' WHERE id=$1 RETURNING *", [id],
        )).rows[0];
        await db.query("UPDATE billing_reminders SET status='cancelled',claim_token=NULL WHERE user_id=$1 AND status IN ('queued','sending','failed')", [id]);
        await audit(db, req.user, null, 'school_grant', 'user', id, {
          source: 'admin', plan: 'standard', expiresAt: null, paymentRequired: false,
          previousPlan: target.school_plan, previousExpiresAt: target.school_expires_at, previousAccountType: target.account_type,
        });
        await db.prepare('INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)')
          .run(id, 'school_granted', 'Bạn đã được cấp gói School', 'Admin đã cấp School Standard miễn phí, không thời hạn cho tài khoản của bạn.', '/school');
        return { granted: true, user: publicUser(updated), message: 'Đã thêm tài khoản vào School miễn phí, không thời hạn.' };
      })();
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ ok: true, ...result });
    } catch (error) {
      if (Number.isInteger(error.status) && error.status < 500) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  });
}
