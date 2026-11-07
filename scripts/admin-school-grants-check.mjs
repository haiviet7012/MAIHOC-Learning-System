import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';

const password = randomUUID(), origin = 'http://127.0.0.1:' + (process.env.GRANT_PREVIEW_PORT || '4193');
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs'], { env: { ...process.env, PREVIEW_PORT: process.env.GRANT_PREVIEW_PORT || '4193', MAIHOC_PREVIEW_PASSWORD: password, MAIHOC_PREVIEW_PAID_STUDENT: '1', SEPAY_ENABLED: '0' }, stdio: ['ignore','pipe','pipe'] });
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
  // A student with a paid, unexpired Standard plan can open private chat on Learning.
  const paid = await browser.newContext();
  assert.equal((await paid.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:'student@maihoc.test',password}})).status(),200);
  const paidUser = (await (await paid.request.get(origin+'/api/auth/me')).json()).user;
  assert.equal(paidUser.role,'user'); assert.equal(paidUser.schoolPlan,'standard');
  assert.ok(new Date(paidUser.schoolExpiresAt).getTime()>Date.now());
  const paidPage=await paid.newPage();
  await paidPage.goto(origin+'/learning'); await dismissDevelopmentNotice(paidPage);
  await paidPage.locator('#chat-launcher').click();
  await paidPage.locator('.chat-tab[data-tab="direct"]').click();
  await paidPage.locator('#chat-pane-direct').waitFor({state:'visible'});
  assert.equal(new URL(paidPage.url()).pathname,'/learning');
  assert.equal((await paid.request.get(origin+'/api/chat/users')).status(),200);
  await paidPage.waitForFunction(()=>document.querySelector('#chat-status-text')?.textContent==='Đã kết nối', null, {timeout:30000});
  await paidPage.locator('#chat-user-search').fill('teacher@maihoc.test');
  await paidPage.locator('#chat-conversations-list .chat-conv-item').filter({hasText:'Thầy Hải Việt'}).click();
  await paidPage.locator('#chat-direct-input').fill('Học sinh School chat từ Learning');
  await paidPage.locator('#chat-direct-send').click();
  await paidPage.locator('#chat-direct-messages').getByText('Học sinh School chat từ Learning',{exact:true}).waitFor();
  await paid.close();
  const registered = await learner.request.post(origin+'/api/auth/register',{headers:{Origin:origin},data:{name:'School grant learner',email:'grant-learner@maihoc.test',password,accountType:'external'}});
  assert.equal(registered.status(),201,await registered.text());
  const me = async () => (await (await learner.request.get(origin+'/api/auth/me')).json()).user;
  const before = await me(); assert.equal(before.schoolPlan,'none');
  assert.equal((await learner.request.get(origin+'/api/chat/users')).status(),403);
  const learnerPage=await learner.newPage();
  await learnerPage.goto(origin+'/learning'); await dismissDevelopmentNotice(learnerPage);
  await learnerPage.locator('#chat-launcher').click();
  await learnerPage.locator('.chat-tab[data-tab="direct"]').click();
  await learnerPage.waitForURL(origin+'/school/plans');
  await learnerPage.goto(origin+'/learning'); await dismissDevelopmentNotice(learnerPage);
  await learnerPage.locator('#chat-launcher').waitFor();

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
  // Keep the learner's existing page and Socket.IO connection open across the grant.
  // Its chat module previously cached schoolPlan=none and redirected to checkout.
  learnerPage.on('pageerror',error=>errors.push(error.message));
  await learnerPage.locator('#chat-launcher').click();
  await learnerPage.locator('.chat-tab[data-tab="direct"]').click();
  await learnerPage.locator('#chat-pane-direct').waitFor({state:'visible'});
  assert.equal(new URL(learnerPage.url()).pathname,'/learning','Granted School works from Learning without a reload or upgrade redirect');
  await learnerPage.waitForFunction(()=>document.querySelector('#chat-status-text')?.textContent==='Đã kết nối', null, {timeout:30000});
  await learnerPage.locator('#chat-user-search').fill('teacher@maihoc.test');
  const recipient=learnerPage.locator('#chat-conversations-list .chat-conv-item').filter({hasText:'Thầy Hải Việt'});
  await recipient.click();
  await learnerPage.locator('#chat-direct-input').waitFor();
  await learnerPage.locator('#chat-direct-input').fill('Chat riêng sau khi admin cấp School');
  await learnerPage.locator('#chat-direct-send').click();
  await learnerPage.locator('#chat-direct-messages').getByText('Chat riêng sau khi admin cấp School',{exact:true}).waitFor();
  const conversations=await (await learner.request.get(origin+'/api/chat/conversations')).json();
  const direct=conversations.conversations.find(c=>c.type==='direct'); assert.ok(direct);
  const history=await learner.request.get(origin+`/api/chat/conversations/${direct.id}/messages`);
  assert.equal(history.status(),200); assert.ok((await history.json()).messages.some(m=>m.content==='Chat riêng sau khi admin cấp School'));
  // Account refresh failures should show a retry message, never a false paywall.
  await learnerPage.route('**/api/auth/me',route=>route.fulfill({status:503,json:{error:'Temporarily unavailable'}}));
  await learnerPage.locator('.chat-tab[data-tab="global"]').click();
  await learnerPage.locator('.chat-tab[data-tab="direct"]').click();
  await learnerPage.locator('#chat-status-text').filter({hasText:'Chưa kiểm tra được quyền School'}).waitFor();
  assert.equal(new URL(learnerPage.url()).pathname,'/learning');
  await learnerPage.unroute('**/api/auth/me');
  await learnerPage.locator('.chat-tab[data-tab="direct"]').click();
  await learnerPage.locator('#chat-pane-direct').waitFor({state:'visible'});
  await learnerPage.screenshot({path:'test-results/granted-school-private-chat.png',fullPage:true});

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
  console.log('Private chat after live School grant from Learning, real Socket.IO send/history, Free denial and auth retry passed.');
  console.log('Admin free School grant: cancel/confirm, persistence, current-session access, no payment setup, mobile and learner permission checks passed.');
} finally { await browser?.close(); preview.kill(); }
