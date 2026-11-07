import { ensureAccountUpgrade } from './account-upgrade.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { testDatabase } from './platform/test-db.js';
import { installAdminSchoolGrants } from './admin-school-grants.js';
import { publicUser, requireSuperAdmin } from './auth.js';
import { canAccessSchool } from '../js/platform/school-access.js';
import { installBillingRoutes } from './billing.js';

test('Admin grants permanent School without payments; permissions, audit, repeat requests and rollback are enforced', async t => {
  const fixture = await testDatabase({ memoryOnly: true }), { db } = fixture;
  t.after(() => fixture.close());
  await ensureAccountUpgrade(db);
  for (const [id, role, level, plan] of [[1,'admin',2,'none'],[2,'admin',2,'none'],[3,'admin',1,'none'],[4,'user',0,'none'],[5,'user',0,'standard'],[6,'user',0,'legacy'],[7,'user',0,'none'],[8,'user',0,'none']]) {
    await db.query("INSERT INTO users(id,name,email,password_hash,role,admin_level,account_type,school_plan,is_manager) VALUES($1,$2,$3,'same-password',$4,$5,'external',$6,$7)", [id, `User ${id}`, `grant${id}@test.local`, role, level, plan, id === 2]);
  }
  await db.query("UPDATE users SET school_expires_at=now()+interval '30 days' WHERE id=5");
  const app = express(); app.use(express.json());
  app.use(async (req, _res, next) => {
    try { req.user = publicUser((await db.query('SELECT * FROM users WHERE id=$1', [Number(req.get('x-user')) || 0])).rows[0]); next(); } catch(error) { next(error); }
  });
  const requireSameOrigin = (req,res,next) => req.get('origin') === 'http://grant.test' ? next() : res.status(403).json({ error: 'Origin rejected' });
  installAdminSchoolGrants(app, { db, requireSuperAdmin, requireSameOrigin });
  installBillingRoutes(app, { db, requireAuth: (req,res,next) => req.user ? next() : res.sendStatus(401), requireSameOrigin, env: { SEPAY_ENABLED: '1', SCHOOL_STANDARD_PRICE_VND: '50000', SCHOOL_STANDARD_DURATION_DAYS: '30', SEPAY_ACCOUNT_NUMBER: 'test', SEPAY_BANK_CODE: 'test', SEPAY_WEBHOOK_SECRET: 'test' } });
  app.use((error,_req,res,_next) => res.status(error.status || 500).json({ error: 'Failed' }));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (target, user=1, origin='http://grant.test', body={}) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/users/${target}/school`, { method:'POST', headers:{ 'x-user':String(user), Origin:origin, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  assert.equal((await request(4,99)).status,401);
  assert.equal((await request(4,3)).status,403);
  assert.equal((await request(4,4)).status,403);
  assert.equal((await request(4,1,'http://evil.test')).status,403);
  assert.equal((await request('bad')).status,400);
  assert.equal((await request(999)).status,404);
  assert.equal((await request(3)).status,409);
  const response = await request(4,1,'http://grant.test',{ schoolPlan:'premium', role:'admin', schoolExpiresAt:'2000-01-01' });
  assert.equal(response.status,200); assert.match(response.headers.get('cache-control'),/private, no-store/);
  const result = await response.json(); assert.equal(result.granted,true); assert.equal(result.user.schoolPlan,'standard');
  assert.equal(result.user.schoolExpiresAt,null); assert.ok(canAccessSchool(result.user)); assert.equal(result.user.role,'user');
  const stored = (await db.query('SELECT * FROM users WHERE id=4')).rows[0];
  assert.equal(stored.password_hash,'same-password'); assert.equal(stored.account_type,'school');
  const again = await (await request(4)).json(); assert.equal(again.granted,false);
  assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='school_grant' AND entity_id='4'")).rows.length,1);
  const audit = (await db.query("SELECT * FROM audit_logs WHERE action='school_grant' AND entity_id='4'")).rows[0];
  assert.equal(Number(audit.actor_id),1); assert.equal(audit.detail.paymentRequired,false);
  assert.equal((await db.query("SELECT * FROM notifications WHERE user_id=4 AND type='school_granted'")).rows.length,1);
  assert.equal((await db.query('SELECT * FROM billing_orders')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM billing_subscriptions')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM billing_transactions')).rows.length,0);
  assert.equal((await request(5,2)).status,200,'Delegated admin can grant');
  assert.equal((await db.query('SELECT school_expires_at FROM users WHERE id=5')).rows[0].school_expires_at,null);
  assert.equal((await (await request(6)).json()).granted,false);
  assert.equal((await db.query('SELECT school_plan FROM users WHERE id=6')).rows[0].school_plan,'legacy');
  const concurrent = await Promise.all([request(7),request(7,2)]); assert.ok(concurrent.every(r => r.status === 200));
  assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='school_grant' AND entity_id='7'")).rows.length,1);
  const options = await (await fetch(`http://127.0.0.1:${server.address().port}/api/billing/options`,{headers:{'x-user':'4'}})).json();
  assert.equal(options.canBuyForSelf,false);
  const buy = await fetch(`http://127.0.0.1:${server.address().port}/api/billing/orders`,{method:'POST',headers:{'x-user':'4',Origin:'http://grant.test','Content-Type':'application/json'},body:'{}'});
  assert.equal(buy.status,409);
  // A failed audit must roll back the entitlement and notification together.
  await db.query("ALTER TABLE audit_logs ADD CONSTRAINT reject_fixture_grant CHECK (entity_id <> '8')");
  assert.equal((await request(8)).status,500);
  assert.equal((await db.query('SELECT school_plan FROM users WHERE id=8')).rows[0].school_plan,'none');
  assert.equal((await db.query("SELECT * FROM notifications WHERE user_id=8 AND type='school_granted'")).rows.length,0);
});
