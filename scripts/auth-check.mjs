import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const password = randomUUID(), origin = 'http://127.0.0.1:4177';
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs'], { env: { ...process.env, PREVIEW_PORT: '4177', MAIHOC_PREVIEW_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Preview startup timeout')), 60000); let out = '';
    preview.stdout.on('data', b => { out += b; if (out.includes('isolated preview ready')) { clearTimeout(timeout); resolve(); } });
    preview.stderr.on('data', b => process.stderr.write(b)); preview.on('exit', c => { clearTimeout(timeout); reject(Error(`Preview exited ${c}`)); });
  });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, r => r.abort());
  await page.goto(origin + '/learning'); await page.locator('#register-open').click();
  assert.equal(await page.locator('#register-form [value=teacher]').count(), 1);
  assert.ok((await page.locator('#register-dialog').evaluate(n => getComputedStyle(n).backgroundImage)).includes('/images/poster.jpg'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/signup-teacher-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#register-form [value=teacher]').isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'test-results/signup-teacher-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('#register-form [value=teacher]').check();
  await page.locator('#register-form [name=name]').fill('Giáo viên đăng ký');
  await page.locator('#register-form [name=email]').fill('signup-teacher@maihoc.test');
  await page.locator('#register-form [name=password]').fill(password);
  await page.locator('#register-form [name=confirmPassword]').fill(password);
  await page.locator('#register-form button[type=submit]').click();
  await page.waitForURL('**/school/assignment-management');
  const me = (await (await page.request.get(origin + '/api/auth/me')).json()).user;
  assert.equal(me.isTeacher, true); assert.equal(me.isSuperAdmin, false);
  await page.locator('#notifications-open').click();
  const close = page.locator('#notifications-dialog .close-button'); await close.waitFor();
  const box = await close.boundingBox(); assert.equal(box.width, 52); assert.equal(box.height, 40);
  assert.equal(await close.evaluate(n => getComputedStyle(n).borderRadius), '9px');
  await page.screenshot({ path: 'test-results/notification-close-rectangle.png', fullPage: true });
  await close.click(); assert.equal(await page.locator('#notifications-dialog').evaluate(n => n.open), false);
  await page.locator('#logout-button').click(); await page.locator('#login-open').click();
  await page.locator('#login-dialog [data-open-forgot-password]').click();
  await page.locator('#forgot-password-form [name=email]').fill('signup-teacher@maihoc.test');
  // Test both proper HTTP failure and old deployments returning sentByEmail:false with HTTP 200.
  for (const status of [503, 200]) {
    await page.route('**/api/auth/forgot-password', r => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 503 ? { error: 'Email chưa sẵn sàng.' } : { sentByEmail: false, message: 'Email chưa sẵn sàng.' }) }));
    await page.locator('#forgot-password-form button[type=submit]').click();
    await page.locator('#forgot-password-error').filter({ hasText: 'Email chưa sẵn sàng.' }).waitFor();
    assert.equal(await page.locator('#forgot-password-form').isVisible(), true);
    assert.equal(await page.locator('#reset-password-form').isVisible(), false);
    await page.unroute('**/api/auth/forgot-password');
  }
  console.log('Auth browser checks passed: teacher registration/role, responsive form, poster path, rectangular notification close, no reset step after email failure.');
} finally { await browser?.close(); preview.kill('SIGTERM'); }
