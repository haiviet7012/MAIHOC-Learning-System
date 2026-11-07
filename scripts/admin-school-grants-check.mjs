import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';

const password = randomUUID(), origin = 'http://127.0.0.1:4193';
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs'], { env: { ...process.env, PREVIEW_PORT: '4193', MAIHOC_PREVIEW_PASSWORD: password, SEPAY_ENABLED: '0' }, stdio: ['ignore','pipe','pipe'] });
let browser;
try {
  await new Promise((resolve,reject) => {
    let output=''; const timer=setTimeout(() => reject(Error('Preview timeout')),60000);
    preview.stdout.on('data',chunk => { output+=chunk; if(output.includes('isolated preview ready')) { clearTimeout(timer); resolve(); } });
    preview.stderr.on('data',chunk => process.stderr.write(chunk));
    preview.once('exit',code => { clearTimeout(timer); reject(Error(`Preview exit ${code}`)); });
  });
  browser = await chromium.launch({headless:true});
  const learner = await browser.newContext(), admin = await browser.newContext({viewport:{width:1440,height:1000}});
  const registered = await learner.request.post(origin+'/api/auth/register',{headers:{Origin:origin},data:{name:'School grant learner',email:'grant-learner@maihoc.test',password,accountType:'external'}});
  assert.equal(registered.status(),201,await registered.text());
  const me = async () => (await (await learner.request.get(origin+'/api/auth/me')).json()).user;
  const before = await me(); assert.equal(before.schoolPlan,'none');
  const login=await admin.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:'admin@maihoc.test',password}});
  assert.ok(login.ok(),await login.text());
  const page=await admin.newPage(), errors=[]; page.on('pageerror',error => errors.push(error.message));
  await page.goto(origin+'/school/admin'); await dismissDevelopmentNotice(page);
  const button=page.locator(`[data-grant-school="${before.id}"]`); await button.waitFor();
  page.once('dialog',dialog => dialog.dismiss()); await button.click(); assert.equal(await button.count(),1);
  page.once('dialog',dialog => dialog.accept()); await button.click(); await button.waitFor({state:'detached'});
  assert.match(await page.locator('#admin-users-table').innerText(),/School · Không thời hạn/);
  assert.match(await page.locator('#toast-region').innerText(),/miễn phí/);
  const after=await me(); assert.equal(after.schoolPlan,'standard'); assert.equal(after.schoolExpiresAt,null); assert.equal(after.role,'user');
  await page.reload(); await dismissDevelopmentNotice(page); await page.locator('#admin-users-table table').waitFor(); assert.equal(await button.count(),0);
  await mkdir('test-results',{recursive:true}); await page.screenshot({path:'test-results/admin-school-grants-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844}); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'test-results/admin-school-grants-mobile.png',fullPage:true});
  const studentPage=await learner.newPage(); studentPage.on('pageerror',error => errors.push(error.message));
  await studentPage.goto(origin+'/school/timetable'); await dismissDevelopmentNotice(studentPage);
  await studentPage.locator('[data-save-timetable]').waitFor();
  await studentPage.goto(origin+'/school/plans?billing=1'); await dismissDevelopmentNotice(studentPage);
  await studentPage.getByText('Tài khoản đã được cấp School miễn phí, không thời hạn. Bạn không cần thanh toán hoặc gia hạn.',{exact:true}).waitFor();
  assert.equal((await learner.request.post(origin+`/api/admin/users/${before.id}/school`,{headers:{Origin:origin}})).status(),403);
  assert.deepEqual(errors,[]);
  console.log('Admin free School grant: cancel/confirm, persistence, current-session access, no payment setup, mobile and learner permission checks passed.');
} finally { await browser?.close(); preview.kill(); }
