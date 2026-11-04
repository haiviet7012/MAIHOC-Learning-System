import { dismissDevelopmentNotice } from './browser-notices.mjs';
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
  await page.goto(origin+'/learning'); await dismissDevelopmentNotice(page);
  assert.equal(new URL(learningPage.url()).pathname,'/learning');
  assert.equal(await page.locator('.education-sidebar [data-route=study-rooms]').count(),1);
  assert.equal(await page.locator('.education-sidebar [data-route=ai-solver]').count(),1);
  await page.locator('#menu-toggle').click();
  assert.equal(await page.locator('#subject-menu [data-route=study-rooms]').count(),0);
  assert.equal(await page.locator('#subject-menu [data-route=ai-solver]').count(),0);
  await page.locator('#menu-toggle').click();
  const pagesBeforeSwitch=context.pages().length;
  await page.locator('#menu-toggle').click();
  const workspaceSwitch=page.locator('#workspace-switch');
  assert.equal((await workspaceSwitch.textContent()).trim(),'School');
  assert.equal(await workspaceSwitch.evaluate(button=>button.parentElement.lastElementChild===button),true);
  await workspaceSwitch.click();
  assert.equal(await page.locator('#view').evaluate(el=>el.classList.contains('workspace-transition-enter')),true,
    'Learning to School triggers the fade/morph entrance');
  await page.waitForURL(origin+'/school/plans');
  await page.getByRole('heading',{name:'School Standard',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.getElementById('view').classList.contains('workspace-transition-enter'));
  assert.equal(page,learningPage,'Workspace navigation stays in the original page');
  assert.equal(context.pages().length,pagesBeforeSwitch,'Switching to School does not open another tab');
  await page.locator('#menu-toggle').click();
  assert.equal((await page.locator('#workspace-switch').textContent()).trim(),'Learning');
  await page.locator('#workspace-switch').click();
  assert.equal(await page.locator('#view').evaluate(el=>el.classList.contains('workspace-transition-enter')),true,
    'School to Learning triggers the same entrance animation');
  await page.waitForURL(origin+'/learning');
  await page.waitForFunction(()=>!document.getElementById('view').classList.contains('workspace-transition-enter'));
  assert.equal(context.pages().length,pagesBeforeSwitch,'Switching back to Learning stays in the same tab');
  await page.locator('#menu-toggle').click();
  assert.equal((await page.locator('#workspace-switch').textContent()).trim(),'School');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#workspace-switch').click();
  assert.equal(await page.locator('#view').evaluate(el=>el.classList.contains('workspace-transition-enter')),false,
    'Reduced-motion preference disables the workspace entrance animation');
  await page.waitForURL(origin+'/school/plans');
  await page.getByRole('heading',{name:'School Standard',exact:true}).waitFor();
  await page.emulateMedia({reducedMotion:'no-preference'});
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
 await page.goto(link,{waitUntil:'networkidle'}); await dismissDevelopmentNotice(page);
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
 await page.goto(origin+'/account'); await dismissDevelopmentNotice(page);await page.getByRole('heading',{name:'Trung tâm tài khoản',exact:true}).waitFor();await page.locator('#view .role-chip').filter({hasText:'Giáo viên'}).waitFor();
 await page.locator('#account-progress-list').filter({hasNotText:'Đang tải'}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/account-teacher-mobile.png',fullPage:true,animations:'disabled'});

 await page.goto(origin+'/learning'); await dismissDevelopmentNotice(page);await page.waitForFunction(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)return false;const d=await r.json();return d.user?.email==='verified@school.edu.vn'&&d.user?.isTeacher===true;});
 await page.locator('#chat-launcher').click();await page.locator('.chat-tab[data-tab=direct]').waitFor();
 await page.locator('.chat-tab[data-tab=direct]').click();await page.waitForURL(origin+'/school/plans');
 await page.goto(origin+'/school'); await dismissDevelopmentNotice(page);await page.locator('body[data-school-ui]').waitFor();
 assert.match((await page.locator('[data-sidebar-space=school] [data-route=school-advisor]').textContent()).trim(),/Cố vấn AI/,'School advisor navigation is present');
 const advisorNav=page.locator('[data-sidebar-space=school] [data-route=school-advisor]');
 assert.equal((await advisorNav.locator('.nav-glyph').textContent()).trim(),'✦','Cố vấn AI uses the same star glyph as Gia sư AI');
 assert.equal(await advisorNav.locator('.nav-glyph').getAttribute('aria-hidden'),'true','Advisor star is decorative for assistive technology');
 await page.locator('#chat-launcher').click();await page.locator('.chat-tab[data-tab=direct]').click();
 assert.equal(await page.locator('#chat-pane-direct').isVisible(),true);
  for(const width of [1440,820,390]) {
   await page.setViewportSize({width,height:950});
   for(const [path,label] of [['/learning','School'],['/school/plans','Learning']]) {
    await page.goto(origin+path); await dismissDevelopmentNotice(page);
    await page.locator('#menu-toggle').click();
    const switchButton=page.locator('#workspace-switch');
    assert.equal((await switchButton.textContent()).trim(),label,`Correct opposite workspace action at ${width}px`);
    assert.equal(await switchButton.evaluate(button=>button.parentElement.lastElementChild===button),true,'Workspace action is the final menu item');
    assert.ok((await switchButton.boundingBox()).width>0,'Workspace action is visible when menu is open');
    const switchBox = await switchButton.boundingBox();
    const switchStyle = await switchButton.evaluate(button => {
      const style = getComputedStyle(button);
      return { height: style.height, minHeight: style.minHeight, lineHeight: style.lineHeight,
        display: style.display, alignItems: style.alignItems, justifyContent: style.justifyContent };
    });
    assert.equal(switchBox.height,42,'Workspace action keeps a fixed 42px height');
    assert.deepEqual(switchStyle,{height:'42px',minHeight:'42px',lineHeight:'20px',display:'flex',alignItems:'center',justifyContent:'center'},
      'Workspace switch labels use stable geometry');
    await page.locator('#menu-toggle').click();
   }
   assert.equal(context.pages().length,1,`Workspace switching uses one page at ${width}px`);
  }

  // Learning and School pages share maihoc.sid. A login/logout in either
  // workspace must update the other page's in-memory account and visible UI.
  await page.goto(origin+'/learning'); await dismissDevelopmentNotice(page);
  const syncPage=await context.newPage();
  await syncPage.goto(origin+'/school/plans'); await dismissDevelopmentNotice(syncPage);
  await syncPage.locator('#logout-button').click();
  await page.waitForFunction(()=>window.maihocCurrentUser===null);
  await syncPage.goto(origin+'/school/plans'); await dismissDevelopmentNotice(syncPage);
  await syncPage.locator('#login-open').click();
  await syncPage.locator('#login-form [name=email]').fill('student@maihoc.test');
  await syncPage.locator('#login-form [name=password]').fill(password);
  await syncPage.locator('#login-form button[type=submit]').click();
  await syncPage.waitForURL(origin+'/school');
  await page.waitForFunction(name => window.maihocCurrentUser?.name === name && document.querySelector('#education-user')?.textContent.includes(name), 'Nguyễn Minh Anh');

  await page.goto(origin+'/school/plans'); await dismissDevelopmentNotice(page);
  await syncPage.locator('#logout-button').click();
  await page.waitForFunction(()=>window.maihocCurrentUser===null);
  await syncPage.goto(origin+'/learning'); await dismissDevelopmentNotice(syncPage);
  await syncPage.locator('#login-open').click();
  await syncPage.locator('#login-form [name=email]').fill('teacher@maihoc.test');
  await syncPage.locator('#login-form [name=password]').fill(password);
  await syncPage.locator('#login-form button[type=submit]').click();
  await page.waitForFunction(name => window.maihocCurrentUser?.name === name && document.querySelector('#education-user')?.textContent.includes(name), 'Thầy Hải Việt');
  await syncPage.close();
await page.goto(origin+'/learning/progress'); await dismissDevelopmentNotice(page);assert.equal(await page.locator('.advisor-pull').count(),0);
 await page.goto(origin+'/school/advisor'); await dismissDevelopmentNotice(page);await page.locator('.teaching-advisor h2').waitFor();assert.equal(await page.locator('.advisor-pull').count(),0);
 assert.deepEqual(errors,[]);console.log('Account UI passed: School plans, two account types, edu email confirmed by link before full teacher profile, registration, teacher account centre, mobile and School-only advisor. Mail mocked; unverified mailbox cannot register.');
}finally{await browser?.close();preview.kill('SIGTERM');}

