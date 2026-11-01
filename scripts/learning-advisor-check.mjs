// Full application + isolated PostgreSQL-compatible database. Only Google is stubbed.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const directory = new URL("../test-results/", import.meta.url);
await mkdir(directory, { recursive: true });
const provider = new URL("advisor-provider.mjs", directory);
await writeFile(
  provider,
  `const original=globalThis.fetch; globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://generativelanguage.googleapis.com/')) { const payload=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({inScope:!payload.message.includes('ngoài chủ đề'),reply:'Ôn tập Toán theo mục tiêu. Dữ liệu còn ít, hãy luyện thêm để đánh giá.',tasks:payload.mode==='plan'?[{day:1,title:'Luyện 5 câu Toán và sửa lỗi sai',subject:'Toán',minutes:30}]:[]})}]}}]}),{headers:{'Content-Type':'application/json'}}); }return original(url,options);};`,
);
const password = randomUUID(),
  origin = "http://127.0.0.1:4175";
const preview = spawn(
  process.execPath,
  ["--import", provider.pathname, "scripts/dev-preview.mjs"],
  {
    env: {
      ...process.env,
      PREVIEW_PORT: "4175",
      MAIHOC_PREVIEW_PASSWORD: password,
      MAIHOC_PREVIEW_ADVISOR_DATA: "1",
      MAIHOC_LEARNING_ADVISOR_ENABLED: "1",
      LEARNING_ADVISOR_API_KEY: "isolated-test-only",
      LEARNING_ADVISOR_MODEL: "gemini-3.6-flash",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("Preview timeout")), 60000);
    let output = "";
    preview.stdout.on("data", (c) => {
      output += c;
      if (output.includes("isolated preview ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    preview.stderr.on("data", (c) => process.stderr.write(c));
    preview.once("exit", (code) => {
      clearTimeout(timeout);
      reject(Error("Preview exit " + code));
    });
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, (r) =>
    r.abort(),
  );
  await page.goto(origin + "/learning", { waitUntil: "networkidle" });
  await page.locator("#login-open").click();
  await page.locator("#login-form [name=email]").fill("student@maihoc.test");
  await page.locator("#login-form [name=password]").fill(password);
  await page.locator("#login-form button[type=submit]").click();
  await page.locator("#login-dialog").waitFor({ state: "hidden" });
  await page.locator('.education-sidebar nav [data-route="analytics"]').click();
  await page.locator("[data-advisor-form]").waitFor();
  assert.equal(await page.locator(".advisor-chart svg").count(), 1);
  await page.locator("[name=goal]").fill("Đạt 8 điểm Toán trong 4 tuần");
  await page.locator("[data-advisor-form] button[type=submit]").click();
  await page.locator("[data-advisor-apply]").waitFor();
  await page.locator("[data-advisor-apply]").click();
  await page.getByRole("heading", { name: "Lộ trình đã áp dụng" }).waitFor();
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/roadmaps/") &&
        r.request().postData()?.includes("task") &&
        r.ok(),
    ),
    page.locator("[data-advisor-task]").check(),
  ]);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-advisor-task]:checked").waitFor();
  await page.locator("[data-advisor-mode=evaluate]").click();
  await page.locator("[data-advisor-form] button[type=submit]").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".advisor-message").length >= 4,
  );
  await page.locator("[data-advisor-mode=charts]").click();
  await page.screenshot({
    path: new URL("advisor-learning-desktop.png", directory).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  await page.screenshot({
    path: new URL("advisor-learning-mobile.png", directory).pathname,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "No mobile horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator(".education-switch [data-space=school]").click();
  await page
    .locator('.education-sidebar nav [data-route="school-analytics"]')
    .click();
  await page.locator("[data-advisor-form]").waitFor();
  assert.equal(
    await page.locator(".advisor-message").count(),
    0,
    "School conversation is isolated",
  );
  assert.equal(await page.locator(".advisor-chart svg").count(), 2);
  await page.locator("[data-advisor-day]").selectOption({ index: 2 });
  assert.equal(await page.locator("polygon[stroke-dasharray]").count(), 1);
  await page.waitForTimeout(450);
  await page.screenshot({
    path: new URL("advisor-school-desktop.png", directory).pathname,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Advisor full-app browser checks passed (Google stubbed; real auth, DB, persistence, scope and UI).",
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
