import { dismissDevelopmentNotice } from './browser-notices.mjs';
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const password = randomUUID(),
  origin = "http://127.0.0.1:4190";
const preview = spawn(process.execPath, ["scripts/dev-preview.mjs"], {
  env: {
    ...process.env,
    PREVIEW_PORT: "4190",
    MAIHOC_PREVIEW_PASSWORD: password,
    MAIHOC_SCHOOL_UPGRADE_ENABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("Preview timeout")), 60000);
    preview.stdout.on("data", (c) => {
      out += c;
      if (out.includes("isolated preview ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    preview.stderr.on("data", (c) => process.stderr.write(c));
    preview.once("exit", (c) => {
      clearTimeout(timer);
      reject(new Error(`Preview exited ${c}`));
    });
  });
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/,r=>r.abort());
  await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:'admin@maihoc.test',password}});
  await page.goto(origin+'/school');await dismissDevelopmentNotice(page);
  await page.locator('[data-management-year]').waitFor();
  assert.equal(await page.locator('[data-management-year]').inputValue(),'2026 - 2027');
  const grade=page.locator('[data-management-modules] > section').filter({has:page.getByRole('heading',{name:'Sổ điểm điện tử',exact:true})});
  await grade.locator('[data-management-class] option').filter({hasText:'12A1'}).waitFor({state:'attached'});
  await grade.locator('[data-management-form="grade"]').waitFor();
  await page.locator('[data-management-year]').selectOption('2027 - 2028');
  await page.locator('[data-platform-form="year"] button').click();
  await page.locator('[data-management-create-class]').waitFor();
  await page.locator('[data-management-create-class] summary').click();
  const form=page.locator('[data-platform-form="class"]');
  await form.locator('[name="classCode"]').fill('10A2');
  await form.locator('[name="name"]').fill('Lớp 10A2');
  await form.locator('button').click();
  await grade.locator('[data-management-class] option').filter({hasText:'10A2'}).waitFor({state:'attached'});
  await grade.getByText('Lớp chưa có học sinh.',{exact:false}).waitFor();
  const event=page.locator('[data-management-modules] > section').filter({has:page.getByRole('heading',{name:'Thời khóa biểu & Lịch sự kiện',exact:true})});
  await event.locator('[data-management-class]').selectOption('');
  await event.locator('[data-management-form="event"]').waitFor();
  await event.locator('[name="title"]').fill('Họp đầu năm');
  await event.locator('[name="body"]').fill('Lịch họp toàn trường');
  await event.locator('[name="start"]').fill('2027-09-05T08:00');
  await event.locator('[name="end"]').fill('2027-09-05T09:00');
  await event.locator('[data-management-form="event"] button').click();
  await event.getByRole('heading',{name:'Họp đầu năm',exact:true}).waitFor();
  console.log('School class choices: historical year labels, empty year, create class and school-wide event passed.');
  await context.close();
} finally {await browser?.close();preview.kill('SIGTERM');}
