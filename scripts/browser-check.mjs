import { vietnamDateTimeInput, vietnamScheduleIso } from '../js/platform/vietnam-time.js';
import { dismissDevelopmentNotice } from './browser-notices.mjs';
import { randomUUID } from "node:crypto";
import { fileURLToPath } from 'node:url';
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const previewPassword = randomUUID();
const preview = spawn(
  process.execPath,
  [fileURLToPath(new URL("./dev-preview.mjs", import.meta.url))],
  { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TZ: "UTC", MAIHOC_PREVIEW_PASSWORD: previewPassword } },
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
  channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
const directory = new URL("../test-results/", import.meta.url);
await mkdir(directory, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  timezoneId: "UTC",
});
let page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// Third-party typography/MathJax are optional; local app and API tests remain real.
await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, (route) =>
  route.abort(),
);
const origin = "http://127.0.0.1:4173";
async function clickSidebar(route) {
  const space = ['assignments','assignment-management','school-analytics','tests','organization','school','question-bank'].includes(route) ? 'school' : 'learning';
  const activeSpace = await page.locator('body').evaluate(body => body.hasAttribute('data-school-ui') ? 'school' : 'learning');
  if (activeSpace !== space) {
    const pageCount = context.pages().length;
    await page.locator('#menu-toggle').click();
    const switchButton = page.locator('#workspace-switch');
    await switchButton.waitFor();
    assert.equal((await switchButton.textContent()).trim(), space === 'school' ? 'School' : 'Learning');
    await switchButton.click();
    await page.waitForFunction(target => document.body.hasAttribute('data-school-ui') === (target === 'school'), space);
    assert.equal(context.pages().length, pageCount, 'Workspace switching must stay in the current tab');
  }
  await page.locator(`[data-sidebar-space="${space}"]`).first().waitFor({ state: 'visible' });
  assert.equal(await page.locator(`[data-sidebar-space="${space}"]`).first().isVisible(), true);
  const other = space === 'school' ? 'learning' : 'school';
  assert.equal(await page.locator(`[data-sidebar-space="${other}"]`).first().isVisible(), false);
  await page.locator(`.education-sidebar nav [data-route="${route}"]`).click();
}

try {
  await page.goto(origin + "/learning", { waitUntil: "networkidle" }); await dismissDevelopmentNotice(page);
  await page
    .getByRole("heading", { name: "Mỗi ngày, tiến bộ một chút." })
    .waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("dashboard-guest.png", directory)),
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
    path: fileURLToPath(new URL("dashboard-desktop.png", directory)),
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
  await page.reload({ waitUntil: "networkidle" }); await dismissDevelopmentNotice(page);
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
  await page.goto(origin + "/learning", { waitUntil: "networkidle" }); await dismissDevelopmentNotice(page);
  await page.screenshot({
    path: fileURLToPath(new URL("dashboard-mobile.png", directory)),
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
    path: fileURLToPath(new URL("login-desktop.png", directory)),
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
  await page.getByRole("heading", { name: "Ngân hàng câu hỏi & Ma trận đề" }).waitFor();
  await page.locator('[data-qb-results] > .qb-card').first().waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("question-bank-desktop.png", directory)),
    fullPage: true,
  });
  // Local authoring is covered by question-bank-check. Seed the real assessment
  // through authenticated, permission-checked APIs; delivery/grading stay UI journeys.
  const platformContext = await page.request.get(origin + '/api/platform/context').then(response => response.json());
  const questionSchoolId = platformContext.schools[0].id;
  const bankApi = `${origin}/api/platform/schools/${questionSchoolId}`;
  const topicResponse = await page.request.post(bankApi + '/curriculum', {
    headers: { Origin: origin }, data: { subject: 'Toán', grade: '12', name: 'Hàm số pilot', version: 'Pilot v1' },
  });
  assert.ok(topicResponse.ok(), await topicResponse.text());
  const topic = await topicResponse.json();
  const questionResponse = await page.request.post(bankApi + '/questions', {
    headers: { Origin: origin }, data: { subject: 'Toán', grade: '12', type: 'short_answer', stem: 'Tính giá trị 1/2', choices: [], answer: '0.5', curriculumNodeId: topic.id, source: 'Giáo viên tự soạn trong kiểm thử' },
  });
  assert.ok(questionResponse.ok(), await questionResponse.text());
  const question = await questionResponse.json();
  const approval = await page.request.post(bankApi + `/questions/${question.id}/approve`, { headers: { Origin: origin }, data: {} });
  assert.ok(approval.ok(), await approval.text());
  await clickSidebar("assignment-management");
  const assignmentForm=page.locator('[data-platform-form="assignment"]');
  await assignmentForm.locator('[name="title"]').fill('Bài kiểm tra pilot');
  await assignmentForm.locator('[name="classId"]').selectOption({label:'Lớp 12A1'});
  // These controls are explicitly Vietnam wall time, even on UTC CI runners.
  const openInput = vietnamDateTimeInput(new Date(Date.now() - 60000));
  const closeInput = vietnamDateTimeInput(new Date(Date.now() + 3600000));
  await assignmentForm.locator('[name="openAt"]').fill(openInput);
  await assignmentForm.locator('[name="closeAt"]').fill(closeInput);
  await assignmentForm.locator('[name="durationMinutes"]').fill('30');
  await assignmentForm.locator('[name="questionIds"]').check();
  const assignmentCreated = page.waitForResponse(response => response.url() === bankApi + '/assignments' && response.request().method() === 'POST');
  await assignmentForm.locator('button[type="submit"]').click();
  const publishedResponse = await assignmentCreated;
  assert.equal(publishedResponse.status(), 201, await publishedResponse.text());
  const published = await publishedResponse.json();
  assert.equal(new Date(published.open_at).toISOString(), vietnamScheduleIso(openInput));
  assert.equal(new Date(published.close_at).toISOString(), vietnamScheduleIso(closeInput));
  assert.ok(new Date(published.open_at).getTime() <= Date.now(), 'The test assignment must already be open');
  assert.ok(new Date(published.close_at).getTime() > Date.now(), 'The test assignment must not be closed');

  await page.getByRole('heading',{name:'Bài kiểm tra pilot',exact:true}).waitFor();
  const linkedAssignment = await page.locator('[data-platform-results]').getAttribute('data-platform-results');
  const linkedSchool = await page.locator('[data-platform-school]').inputValue();
  await page.locator('#logout-button').click();
  await page.goto(`${origin}/school/assignments/${linkedAssignment}?schoolId=${linkedSchool}`); await dismissDevelopmentNotice(page);
  await page.getByRole('heading',{name:'Đăng nhập để xem nội dung'}).waitFor();
  await page.locator('#login-open').click();
  await page.locator('#login-form [name="email"]').fill('student@maihoc.test');await page.locator('#login-form [name="password"]').fill(previewPassword);await page.locator('#login-form button[type="submit"]').click();
  await page.locator('#education-user').filter({hasText:'Nguyễn Minh Anh'}).waitFor();
  await page.getByRole('heading',{name:'Bài kiểm tra pilot',exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname, `/school/assignments/${linkedAssignment}`);
  const attemptStarted = page.waitForResponse(response => response.url() === `${origin}/api/platform/assignments/${linkedAssignment}/start` && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Mở bài',exact:true}).click();
  const startResponse = await attemptStarted;
  assert.equal(startResponse.status(), 200, await startResponse.text());
  await page.locator('[data-attempt-form] textarea').fill('1/2');
  await page.reload({waitUntil:'networkidle'}); await dismissDevelopmentNotice(page);
  await page.getByRole('button',{name:'Mở bài',exact:true}).click();
  assert.equal(await page.locator('[data-attempt-form] textarea').inputValue(),'1/2','Unsynced local draft recovers after reload');
  await page.locator('[data-attempt-form] button[type="submit"]').click();
  await page.getByRole('heading',{name:'Kết quả 10 / 10'}).waitFor();
  await page.screenshot({path:fileURLToPath(new URL('native-assessment.png', directory)),fullPage:true});
  await page.getByRole('button',{name:'Xem kết quả theo chuyên đề',exact:true}).click();
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
