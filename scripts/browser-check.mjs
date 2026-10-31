import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const previewPassword = randomUUID();
const preview = spawn(
  process.execPath,
  [new URL("./dev-preview.mjs", import.meta.url).pathname],
  { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MAIHOC_PREVIEW_PASSWORD: previewPassword } },
);
await new Promise((resolve, reject) => {
  let output = "";
  preview.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.includes("isolated preview ready")) resolve();
  });
  preview.stderr.on("data", (chunk) => process.stderr.write(chunk));
  preview.once("exit", (code) => reject(new Error(`Preview exited ${code}`)));
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const directory = new URL("../test-results/", import.meta.url);
await mkdir(directory, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// Third-party typography/MathJax are optional; local app and API tests remain real.
await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, (route) =>
  route.abort(),
);
const origin = "http://127.0.0.1:4173";
async function clickSidebar(route) {
  const space = ['assignments','assignment-management','tests','organization','school','question-bank'].includes(route) ? 'school' : 'learning';
  if (!(await page.locator(`.education-switch [data-space="${space}"]`).getAttribute('aria-pressed') === 'true')) {
    await page.locator(`.education-switch [data-space="${space}"]`).click();
  }
  assert.equal(await page.locator(`[data-sidebar-space="${space}"]`).first().isVisible(), true);
  const other = space === 'school' ? 'learning' : 'school';
  assert.equal(await page.locator(`[data-sidebar-space="${other}"]`).first().isVisible(), false);
  await page.locator(`.education-sidebar nav [data-route="${route}"]`).click();
}

try {
  await page.goto(origin + "/learning", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Mỗi ngày, tiến bộ một chút." })
    .waitFor();
  await page.screenshot({
    path: new URL("dashboard-guest.png", directory).pathname,
    fullPage: true,
  });
  await page.locator("#login-open").click();
  await page.locator("#login-form [name=email]").fill("student@maihoc.test");
  await page.locator("#login-form [name=password]").fill(previewPassword);
  assert.ok(
    (await page.locator("#login-form input[name=email]").boundingBox()).width >
      250,
    "Readable desktop login column",
  );
  await page.locator("#login-form button[type=submit]").click();
  await page
    .locator("#education-user")
    .filter({ hasText: "Nguyễn Minh Anh" })
    .waitFor();
  await page.getByRole("heading", { name: /Chào Anh/ }).waitFor();
  await page.screenshot({
    path: new URL("dashboard-desktop.png", directory).pathname,
    fullPage: true,
  });
  const links = [
    "study-rooms",
    "assignments",
    "organization",
    "analytics",
    "ai-solver",
    "school",
    "subject-picker",
  ];
  for (const route of links) {
    await clickSidebar(route);
    await page.waitForTimeout(300);
    assert.ok(
      !(await page.locator("#view").textContent()).includes(
        "Không thể xử lý yêu cầu.",
      ),
      route,
    );
    assert.ok(!(await page.locator("#view").textContent()).includes("canCloseRoom is not defined"), route);
  }
  await clickSidebar("assignments");
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Bài được giao", exact: true })
    .waitFor();
  const auth = await page.request.get(origin + "/api/auth/me");
  assert.equal((await auth.json()).user.email, "student@maihoc.test");
  const testList = await (await page.request.get(origin + "/api/tests")).json();
  const legacyTest = testList.tests[0];
  assert.ok(legacyTest?.id);
  const sessionResponse = await page.request.post(
    origin + `/api/tests/${legacyTest.id}/session`,
    { data: {}, headers: { Origin: origin } },
  );
  assert.equal(sessionResponse.status(), 200);
  const saved = await page.request.patch(
    origin + `/api/tests/${legacyTest.id}/session`,
    {
      data: { answers: { "I-1": "A" }, version: 0 },
      headers: { Origin: origin },
    },
  );
  assert.equal(saved.status(), 200);
  const submitted = await page.request.post(
    origin + `/api/tests/${legacyTest.id}/submit`,
    {
      data: { answers: { "I-1": "A" }, timeSpentSeconds: 999999 },
      headers: { Origin: origin },
    },
  );
  assert.equal(submitted.status(), 200);
  const submission = await submitted.json();
  assert.ok(submission.submissionId);
  const retry = await page.request.post(
    origin + `/api/tests/${legacyTest.id}/submit`,
    { data: { answers: { "I-1": "B" } }, headers: { Origin: origin } },
  );
  assert.equal((await retry.json()).submissionId, submission.submissionId);
  assert.equal(
    (
      await page.request.get(
        origin + `/api/test-submissions/${submission.submissionId}`,
      )
    ).status(),
    200,
  );
  const unauthorized = await page.request.get(
    origin + "/api/platform/schools/1/questions",
  );
  assert.equal(unauthorized.status(), 403);
  const deep = await page.request.get(origin + "/school/question-bank");
  assert.match(deep.headers()["content-type"], /text\/html/);
  for (const path of [
    "/server/server.js",
    "/node_modules/@electric-sql/pglite/package.json",
    "/.git/config",
  ])
    assert.equal((await page.request.get(origin + path)).status(), 404);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/learning", { waitUntil: "networkidle" });
  await page.screenshot({
    path: new URL("dashboard-mobile.png", directory).pathname,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile horizontal overflow",
  );
  await page.locator("#education-menu").click();
  assert.equal(
    await page.locator("#education-menu").getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#education-menu").getAttribute("aria-expanded"),
    "false",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator("#logout-button").click();
  await page.locator("#login-open").waitFor();
  await page.locator("#login-open").click();
  await page.screenshot({
    path: new URL("login-desktop.png", directory).pathname,
    fullPage: true,
  });
  await page.locator("#login-form [name=email]").fill("teacher@maihoc.test");
  await page.locator("#login-form [name=password]").fill(previewPassword);
  await page.locator("#login-form button[type=submit]").click();
  await page
    .locator("#education-user")
    .filter({ hasText: "Thầy Hải Việt" })
    .waitFor();
  await clickSidebar("question-bank");
  await page.getByRole("heading", { name: "Soạn câu hỏi" }).waitFor();
  await page.screenshot({
    path: new URL("question-bank-desktop.png", directory).pathname,
    fullPage: true,
  });
  // Teacher creates reviewed content and assigns it; student resumes and submits through the UI.
  const topicForm=page.locator('[data-platform-form="topic"]');
  await topicForm.locator('[name="subject"]').fill('Toán');
  await topicForm.locator('[name="grade"]').fill('12');
  await topicForm.locator('[name="name"]').fill('Hàm số pilot');
  await topicForm.locator('[name="version"]').fill('Pilot v1');
  await topicForm.locator('button[type="submit"]').click();
  await page.locator('[data-platform-status]').filter({hasText:'Đã lưu thành công.'}).waitFor();
  const questionForm=page.locator('[data-platform-form="question"]');
  await questionForm.locator('[name="subject"]').fill('Toán');
  await questionForm.locator('[name="grade"]').fill('12');
  await questionForm.locator('[name="type"]').selectOption('short_answer');
  await questionForm.locator('[name="stem"]').fill('Tính giá trị 1/2');
  await questionForm.locator('[name="answer"]').fill('0.5');
  await questionForm.locator('[name="curriculumNodeId"]').selectOption({label:'Hàm số pilot'});
  await questionForm.locator('[name="source"]').fill('Giáo viên tự soạn trong kiểm thử');
  await questionForm.locator('button[type="submit"]').click();
  await page.getByRole('button',{name:'Duyệt',exact:true}).click();
  await page.locator('[data-platform-content]').filter({hasText:'approved'}).waitFor();
  await clickSidebar("assignment-management");
  const assignmentForm=page.locator('[data-platform-form="assignment"]');
  await assignmentForm.locator('[name="title"]').fill('Bài kiểm tra pilot');
  await assignmentForm.locator('[name="classId"]').selectOption({label:'Lớp 12A1'});
  const localInput=date=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
  await assignmentForm.locator('[name="openAt"]').fill(localInput(Date.now()-60000));
  await assignmentForm.locator('[name="closeAt"]').fill(localInput(Date.now()+3600000));
  await assignmentForm.locator('[name="durationMinutes"]').fill('30');
  await assignmentForm.locator('[name="questionIds"]').check();
  await assignmentForm.locator('button[type="submit"]').click();
  await page.getByRole('heading',{name:'Bài kiểm tra pilot',exact:true}).waitFor();
  await page.locator('#logout-button').click();await page.locator('#login-open').click();
  await page.locator('#login-form [name="email"]').fill('student@maihoc.test');await page.locator('#login-form [name="password"]').fill(previewPassword);await page.locator('#login-form button[type="submit"]').click();
  await page.locator('#education-user').filter({hasText:'Nguyễn Minh Anh'}).waitFor();
  await clickSidebar("assignments");
  await page.getByRole('button',{name:'Mở bài',exact:true}).click();
  await page.locator('[data-attempt-form] textarea').fill('1/2');
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Mở bài',exact:true}).click();
  assert.equal(await page.locator('[data-attempt-form] textarea').inputValue(),'1/2','Unsynced local draft recovers after reload');
  await page.locator('[data-attempt-form] button[type="submit"]').click();
  await page.getByRole('heading',{name:'Kết quả 10 / 10'}).waitFor();
  await page.screenshot({path:new URL('native-assessment.png',directory).pathname,fullPage:true});
  await page.getByRole('button',{name:'Xem tiến trình',exact:true}).click();
  await page.getByRole('button',{name:'Luyện chuyên đề',exact:true}).click();
  await page.locator('[data-attempt-form] textarea').fill('0,5');
  await page.locator('[data-attempt-form] button[type="submit"]').click();
  await page.getByRole('heading',{name:'Kết quả 10 / 10'}).waitFor();
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(
    "Browser checks passed: real login/session, portal routes, deep links, teacher UI, access control, desktop/mobile, navigation and private-source protection.",
  );
  await writeFile(
    new URL("browser-report.json", directory),
    JSON.stringify(
      {
        passed: true,
        errors,
        screenshots: [
          "dashboard-desktop.png",
          "dashboard-mobile.png",
          "login-desktop.png",
          "question-bank-desktop.png",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  preview.kill("SIGTERM");
}
