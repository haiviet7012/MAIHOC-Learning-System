import { dismissDevelopmentNotice } from './browser-notices.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const password = randomUUID(), origin = 'http://127.0.0.1:4184';
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs'], { env: { ...process.env, PREVIEW_PORT: '4184', MAIHOC_PREVIEW_PASSWORD: password }, stdio: ['ignore','pipe','pipe'] });
let browser;
try {
  await new Promise((resolve,reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error('Preview startup timeout')),60000);
    preview.stdout.on('data', chunk => { output += chunk; if (output.includes('isolated preview ready')) { clearTimeout(timer); resolve(); } });
    preview.stderr.on('data', chunk => process.stderr.write(chunk));
    preview.once('exit', code => { clearTimeout(timer); reject(Error('Preview exit '+code)); });
  });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const teacher = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await teacher.newPage(), errors = [];
  const prepare = async page => { page.on('pageerror', e => errors.push(e.message)); await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, r => r.abort()); };
  await prepare(page);
  const login = async (page,email) => {
    await page.locator('#login-open').click();
    await page.locator('#login-form [name=email]').fill(email);
    await page.locator('#login-form [name=password]').fill(password);
    await page.locator('#login-form button[type=submit]').click();
  };
  await page.goto(origin+'/learning'); await dismissDevelopmentNotice(page); await login(page,'teacher@maihoc.test');
  await page.locator('#education-user').filter({hasText:'Thầy Hải Việt'}).waitFor();
  // Hold startup data until the teacher has filled the form. Releasing it
  // reproduces the late refresh that used to discard the announcement draft.
  let releaseStartup;
  const startupGate = new Promise(resolve => { releaseStartup = resolve; });
  await page.route('**/configs/exam-layouts.json', async route => { await startupGate; await route.continue(); });
  await page.goto(origin+'/school/classes'); await dismissDevelopmentNotice(page);
  await page.locator('#school-announcement-form').waitFor();
  await page.locator('#school-announcement-form [name=target]').selectOption('grade:12');
  await page.locator('#school-announcement-form [name=title]').fill('Lịch ôn tập khối 12');
  await page.locator('#school-announcement-form [name=message]').fill('Mang tài liệu đến lớp. Nội dung <b>vẫn là văn bản</b>.');
  const startupLoaded = Promise.all([
    page.waitForResponse(r => r.url() === origin+'/api/documents'),
    page.waitForResponse(r => r.url() === origin+'/api/tests'),
  ]);
  releaseStartup();
  await startupLoaded;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#school-announcement-form [name=title]').inputValue(), 'Lịch ôn tập khối 12', 'Late startup data must preserve the draft');
  assert.equal(await page.locator('#school-announcement-form [name=target]').inputValue(), 'grade:12');
  assert.equal(await page.locator('#school-announcement-form').evaluate(form => form.checkValidity()), true);
  const response = page.waitForResponse(r=>r.url()===origin+'/api/school/announcements'&&r.request().method()==='POST');
  await page.locator('#school-announcement-form button[type=submit]').click();
  const created = await response; assert.equal(created.status(),201); const notice = await created.json(); assert.equal(notice.recipients,1);
  await page.locator('[data-announcement-status]').filter({hasText:'1 học sinh'}).waitFor();
  const student = await browser.newContext({ viewport: { width: 390, height: 844 } }); const target = await student.newPage(); await prepare(target);
  await target.goto(`${origin}/school/announcements/${notice.id}`); await dismissDevelopmentNotice(target);
  await target.getByRole('heading',{name:'Đăng nhập để xem nội dung'}).waitFor();
  assert.equal(new URL(target.url()).pathname,`/school/announcements/${notice.id}`);
  await login(target,'student@maihoc.test');
  await target.getByRole('heading',{name:'Lịch ôn tập khối 12',exact:true}).waitFor();
  assert.equal(new URL(target.url()).pathname,`/school/announcements/${notice.id}`);
  assert.equal(await target.locator('#view b').count(),0,'Announcement HTML is rendered as text');
  assert.ok(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir('test-results',{recursive:true}); await target.screenshot({path:'test-results/school-email-notice-mobile.png',fullPage:true});
  await target.locator('#notifications-open').click();
  const link=target.locator('#notifications-list a').filter({hasText:'Xem nội dung'}); await link.waitFor(); assert.equal(await link.getAttribute('href'),`/school/announcements/${notice.id}`);
  await link.click(); await target.getByRole('heading',{name:'Lịch ôn tập khối 12',exact:true}).waitFor();
  const guest = await browser.newPage(); await prepare(guest); await guest.goto(origin+'/school/tests/test-email-fixture'); await dismissDevelopmentNotice(guest);
  await guest.getByRole('heading',{name:'Đăng nhập để xem nội dung'}).waitFor();
  await login(guest,'student@maihoc.test'); await guest.locator('#education-user').filter({hasText:'Nguyễn Minh Anh'}).waitFor();
  assert.equal(new URL(guest.url()).pathname,'/school/tests/test-email-fixture');
  assert.deepEqual(errors,[]);
  console.log('School mail browser checks passed: teacher grade selection, recipient count, signed-out deep links, login resume, readable notice, notification link and HTML escaping. No real email sent.');
} finally { await browser?.close(); preview.kill('SIGTERM'); }
