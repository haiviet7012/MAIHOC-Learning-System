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
  for (const path of ['/school', '/school/assignment-management', '/learning?route=organization', '/learning?route=assignment-management']) {
    await page.goto(origin+path); await dismissDevelopmentNotice(page);
    await page.getByRole('heading',{name:'Lớp của bạn',exact:true}).waitFor();
    assert.equal(await page.locator('[data-route="organization"],[data-route="assignment-management"],[data-management-year],[data-platform-form="assignment"]').count(),0);
    assert.equal(await page.locator('.education-sidebar [data-route="tests"]').count(),1);
    assert.equal(await page.locator('.education-sidebar [data-route="question-bank"]').count(),1);
  }
  for (const [path,method] of [['/management','GET'],['/management/grade','POST'],['/assignments','POST']]) {
    const response=await context.request.fetch(origin+'/api/platform/schools/1'+path,{method,headers:{Origin:origin},...(method==='POST'?{data:{}}:{})});
    assert.equal(response.status(),404,path);
  }
  console.log('Retired School modules: no sidebar/forms, safe legacy URLs, APIs unavailable, class page intact.');
  await context.close();
} finally {await browser?.close();preview.kill('SIGTERM');}
