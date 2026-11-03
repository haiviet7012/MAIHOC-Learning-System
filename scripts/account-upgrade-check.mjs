import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { schoolPlansMarkup } from '../js/account-upgrade.js';
const schoolPlansHtml=schoolPlansMarkup();
assert.match(schoolPlansHtml,/School Standard/);
assert.doesNotMatch(schoolPlansHtml,/School Premium|Premium/);
assert.match(schoolPlansHtml,/Gia sư AI &amp; Cố vấn học tập/);
assert.match(schoolPlansHtml,/Thí nghiệm mô phỏng/);
await mkdir('test-results',{recursive:true});
const key=randomUUID(), password=randomUUID(), origin='http://127.0.0.1:4186';
const provider=new URL('../test-results/account-mail-provider.mjs',import.meta.url);
const mailbox=new URL(`../test-results/account-mail-${key}.json`,import.meta.url);
await writeFile(provider,`import {createRequire} from 'node:module';import fs from 'node:fs';const require=createRequire(new URL('../server/server.js',import.meta.url));const mail=require('nodemailer');mail.createTransport=()=>({sendMail:async message=>{fs.writeFileSync(${JSON.stringify(mailbox.pathname)},JSON.stringify(message));return{accepted:message.to,rejected:[]}},close(){}});`);
const preview=spawn(process.execPath,['--import',provider.pathname,'scripts/dev-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'4186',MAIHOC_PREVIEW_PASSWORD:password,SMTP_USER:'test@gmail.com',SMTP_PASS:'fixture',MAIL_PROVIDER:'smtp',APP_PUBLIC_URL:origin},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{let out='';const t=setTimeout(()=>reject(Error('timeout')),60000);preview.stdout.on('data',b=>{out+=b;if(out.includes('isolated preview ready')){clearTimeout(t);resolve()}});preview.stderr.on('data',b=>process.stderr.write(b));preview.on('exit',c=>reject(Error('preview exit '+c)));});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:1050}}),learningPage=await context.newPage();let page=learningPage;const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/,r=>r.abort());
 await page.goto(origin+'/learning');
 assert.equal(new URL(learningPage.url()).pathname,'/learning');
 const [schoolPage]=await Promise.all([
  context.waitForEvent('page'),
  learningPage.locator('[data-space=school]').click(),
 ]);
 await schoolPage.waitForLoadState('domcontentloaded');
 page=schoolPage;
 await page.getByRole('heading',{name:'Học sâu hơn. Chủ động hơn. Tiến bộ mỗi ngày.'}).waitFor();
 await learningPage.waitForFunction(()=>window.name==='maihoc-learning');
 await page.waitForFunction(()=>window.name==='maihoc-school');
 const learningUrlBeforeReturn=learningPage.url();
 const schoolUrlBeforeReturn=page.url();
 await page.locator('[data-space=learning]').click();
 assert.equal(learningPage.url(),learningUrlBeforeReturn,'Returning to Learning must retain its current URL');
 assert.equal(page.url(),schoolUrlBeforeReturn,'Returning to Learning must not navigate the School tab');
 assert.equal(context.pages().length,2,'Switching back must reuse the existing Learning tab');
 assert.equal(await page.getByRole('heading',{name:'Học sâu hơn. Chủ động hơn. Tiến bộ mỗi ngày.'}).isVisible(),true);
 assert.equal(await page.getByRole('heading',{name:'School Standard',exact:true}).count(),1);assert.equal(await page.getByText(/School Premium|Premium/,{exact:false}).count(),0);
 await page.locator('#register-open').click();assert.equal(await page.locator('#register-form [name=accountType]').count(),2);
 await page.locator('#register-form [value=teacher]').check();assert.equal(await page.locator('[data-registration-details]').isVisible(),false);
 await page.locator('#register-form [name=email]').fill('verified@school.edu.vn.evil.com');
 assert.equal(await page.locator('[data-teacher-send-link]').isDisabled(),true);
 await page.locator('#register-form [name=email]').fill('verified@school.edu.vn');
 assert.equal(await page.locator('[data-registration-details]').isVisible(),false);
 assert.equal(await page.locator('[data-teacher-code]').count(),0);
 const emailSent=page.waitForResponse(r=>r.url().endsWith('/teacher/request-link')&&r.status()===200);
 await page.locator('[data-teacher-send-link]').click();await emailSent;
 const message=JSON.parse(await readFile(mailbox,'utf8')),link=message.text.match(/http[^\s]+/)[0];
 await page.goto(link,{waitUntil:'networkidle'});
 assert.equal(await page.locator('[data-registration-details]').isVisible(),false,'Opening link alone does not activate signup');
 assert.equal(await page.evaluate(()=>location.hash),'','Secret fragment removed from URL');
 await page.locator('[data-teacher-confirm-link]').click();
 await page.locator('[data-registration-details]').waitFor({state:'visible'});
 assert.equal(await page.locator('#register-form [name=email]').isEditable(),false);
 await page.screenshot({path:'test-results/teacher-email-confirmed.png',fullPage:true});
 await page.locator('#register-form [name=name]').fill('Giáo viên xác minh');await page.locator('#register-form [name=password]').fill(password);await page.locator('#register-form [name=confirmPassword]').fill(password);
 await page.locator('#register-form [name=subjects][value="Toán"]').check();await page.locator('#register-form [name=teachingClasses][value="10A1"]').check();
 await page.locator('#register-form button[type=submit]').click();await page.waitForURL(origin+'/school/classes');await page.getByRole('heading',{name:'Lớp của bạn',exact:true}).waitFor();
 const user=(await (await context.request.get(origin+'/api/auth/me')).json()).user;assert.equal(user.isTeacher,true);assert.equal(user.email,'verified@school.edu.vn');
 await page.goto(origin+'/account');await page.getByRole('heading',{name:'Trung tâm tài khoản',exact:true}).waitFor();await page.locator('#view .role-chip').filter({hasText:'Giáo viên'}).waitFor();
 await page.locator('#account-progress-list').filter({hasNotText:'Đang tải'}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/account-teacher-mobile.png',fullPage:true,animations:'disabled'});

 await page.goto(origin+'/learning');await page.waitForFunction(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)return false;const d=await r.json();return d.user?.email==='verified@school.edu.vn'&&d.user?.isTeacher===true;});
 await page.locator('#chat-launcher').click();await page.locator('.chat-tab[data-tab=direct]').waitFor();
 await page.locator('.chat-tab[data-tab=direct]').click();await page.waitForURL(origin+'/school/plans');
 await page.goto(origin+'/school');await page.locator('body[data-school-ui]').waitFor();
 assert.match((await page.locator('[data-sidebar-space=school] [data-route=school-advisor]').textContent()).trim(),/Cố vấn AI/,'School advisor navigation is present');
 await page.locator('#chat-launcher').click();await page.locator('.chat-tab[data-tab=direct]').click();
 assert.equal(await page.locator('#chat-pane-direct').isVisible(),true);
 for(const width of [1440,820,390]) {
  await page.setViewportSize({width,height:950});const sizes=[];
  for(const path of ['/learning','/school']) {
   await page.goto(origin+path);await page.locator('.education-switch button[aria-pressed=true]').waitFor();
   sizes.push(await page.locator('.education-switch').evaluate(n=>[...n.children].map(b=>[b.offsetLeft,b.offsetWidth,b.offsetHeight,getComputedStyle(b).lineHeight])));
  }
  assert.deepEqual(sizes[0],sizes[1],`Stable switch layout at ${width}px`);
 }
 await page.goto(origin+'/learning/progress');assert.equal(await page.locator('.advisor-pull').count(),0);
 await page.goto(origin+'/school/advisor');await page.locator('.teaching-advisor h2').waitFor();assert.equal(await page.locator('.advisor-pull').count(),0);
 assert.deepEqual(errors,[]);console.log('Account UI passed: School plans, two account types, edu email confirmed by link before full teacher profile, registration, teacher account centre, mobile and School-only advisor. Mail mocked; unverified mailbox cannot register.');
}finally{await browser?.close();preview.kill('SIGTERM');}


// Workspace tab behavior: preserve named targets, popup-blocked behavior and
// same-origin/cross-origin safety without resetting existing routes.
import { registerSpaceTab, openSpaceTab } from '../js/platform/space-tabs.js';
const calls = [];
const makeHost = (target = {}) => ({
  name: '',
  location: { origin: 'https://maihoc.test' },
  open: (...args) => { calls.push(args); return target; },
});
const existing = {
  location: {
    href: 'https://maihoc.test/school/classes/10A1',
    replace() { throw new Error('existing workspace must not navigate'); },
  },
  focus() { this.focused = true; },
};
const host = makeHost(existing);
assert.equal(registerSpaceTab('school', host), true);
assert.equal(host.name, 'maihoc-school');
assert.equal(openSpaceTab('learning', host), true);
assert.deepEqual(calls.at(-1), ['','maihoc-learning']);
assert.equal(existing.location.href, 'https://maihoc.test/school/classes/10A1',
  'existing target URL is preserved');
assert.equal(existing.focused, true);

const blank = {
  location: { href: 'about:blank', replace(url) { this.replacedWith = url; } },
  focus() { this.focused = true; },
};
assert.equal(openSpaceTab('school', makeHost(blank)), true);
assert.deepEqual(blank.location.replacedWith, '/school',
  'new named target is sent to the School entry route');

assert.equal(openSpaceTab('unknown', host), false);
assert.equal(registerSpaceTab('unknown', host), false);
assert.equal(openSpaceTab('school', makeHost(null)), false, 'blocked popup is reported');

const crossOriginTarget = {
  get location() { throw new Error('cross-origin access'); },
  focus() { this.focused = true; },
};
assert.equal(openSpaceTab('school', makeHost(crossOriginTarget)), true,
  'an isolated existing target is reused without a location write');
assert.equal(crossOriginTarget.focused, true);
