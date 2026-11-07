import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';

const password=randomUUID(), origin='http://127.0.0.1:4192';
await mkdir('test-results',{recursive:true});
const provider=new URL('../test-results/timezone-storage-provider.mjs',import.meta.url);
await writeFile(provider, `import {createRequire} from 'node:module'; const require=createRequire(new URL('../server/server.js',import.meta.url)); const {S3Client}=require('@aws-sdk/client-s3'); S3Client.prototype.send=async()=>({}); const mail=require('nodemailer'); mail.createTransport=()=>({sendMail:async()=>({accepted:[]}),close(){}});`);
const preview=spawn(process.execPath,['--import',provider.pathname,'scripts/dev-preview.mjs'],{env:{...process.env,TZ:'UTC',PREVIEW_PORT:'4192',MAIHOC_PREVIEW_PASSWORD:password},stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Preview timeout')),60000);preview.stdout.on('data',chunk=>{output+=chunk;if(output.includes('isolated preview ready')){clearTimeout(timer);resolve();}});preview.stderr.on('data',chunk=>process.stderr.write(chunk));preview.once('exit',code=>{clearTimeout(timer);reject(Error(`Preview exit ${code}`));});});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({timezoneId:'America/New_York',viewport:{width:1440,height:1050}});
  assert.ok((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:'admin@maihoc.test',password}})).ok());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/school/tests');await dismissDevelopmentNotice(page);
  await page.locator('[data-open-create-test]').first().click();
  const form=page.locator('#create-test-form');await form.waitFor();
  const expectedDefault=await page.evaluate(async()=>{const {vietnamDateTimeInput}=await import('/js/platform/vietnam-time.js');return vietnamDateTimeInput(new Date());});
  assert.equal(await form.locator('[name="openAt"]').inputValue(),expectedDefault);
  await form.locator('[name="title"]').fill('Kiểm thử 08 giờ Việt Nam');
  await form.locator('[name="grade"]').selectOption('12');
  await form.locator('[name="classCode"]').selectOption('ALL');
  await form.locator('[name="openAt"]').fill('2030-02-03T08:00');
  await form.locator('[name="closeAt"]').fill('2030-02-03T09:00');
  await form.locator('[name="answerMode"][value="deferred"]').check();
  await form.locator('[name="document"]').setInputFiles({name:'timezone.txt',mimeType:'text/plain',buffer:Buffer.from('Câu 1: Tính 1 + 1. A. 1 B. 2 C. 3 D. 4')});
  await page.evaluate(()=>{const original=window.fetch;window.fetch=(url,options)=>{if(url==='/api/admin/tests' && options?.body instanceof FormData) window.schedulePayload={openAt:options.body.get('openAt'),closeAt:options.body.get('closeAt')};return original(url,options);};});
  const creation=page.waitForResponse(response=>response.url()===origin+'/api/admin/tests'&&response.request().method()==='POST');
  await form.locator('button[type="submit"]').click();const response=await creation;assert.equal(response.status(),201,await response.text());
  assert.deepEqual(await page.evaluate(()=>window.schedulePayload),{openAt:'2030-02-03T01:00:00.000Z',closeAt:'2030-02-03T02:00:00.000Z'});
  const created=await response.json();await page.locator('#create-test-dialog').waitFor({state:'hidden'});
  const catalog=await (await context.request.get(origin+'/api/tests')).json();const test=catalog.tests.find(test=>test.id===created.testId);
  assert.equal(test.openAt,'2030-02-03T01:00:00.000Z');assert.equal(test.closeAt,'2030-02-03T02:00:00.000Z');
  const text=await page.locator('#view').innerText();assert.match(text,/08:00/);assert.match(text,/09:00/);
  // Older clients may still submit bare datetime-local values. The server must
  // apply Vietnam time even though its own process is UTC.
  const bare=await context.request.post(origin+'/api/admin/tests',{headers:{Origin:origin},multipart:{title:'Legacy local schedule',subject:'Toán',grade:'12',classCode:'ALL',openAt:'2030-02-04T00:30',closeAt:'2030-02-04T01:30',durationMinutes:'30',answerMode:'deferred',document:{name:'legacy-time.txt',mimeType:'text/plain',buffer:Buffer.from('Câu 1: Tính 1 + 1.')}}});
  assert.equal(bare.status(),201,await bare.text());const legacy=await bare.json();
  const latest=await (await context.request.get(origin+'/api/tests')).json();
  assert.equal(latest.tests.find(test=>test.id===legacy.testId).openAt,'2030-02-03T17:30:00.000Z');
  await page.screenshot({path:'test-results/assignment-vietnam-time.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Vietnam scheduling passed with UTC server/New York browser: defaults, multipart UTC offsets, legacy local input, midnight rollover and displayed 08:00/09:00 Vietnam. No real storage/mail requests.');
} finally {await browser?.close();preview.kill();}
