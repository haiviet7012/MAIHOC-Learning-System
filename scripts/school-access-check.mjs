import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const password = randomUUID(), origin = 'http://127.0.0.1:4180';
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs'], {
  env: { ...process.env, PREVIEW_PORT: '4180', MAIHOC_PREVIEW_PASSWORD: password },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview startup timeout')), 60000);
    let output = '';
    preview.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('isolated preview ready')) { clearTimeout(timeout); resolve(); }
    });
    preview.stderr.on('data', chunk => process.stderr.write(chunk));
    preview.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}`)); });
  });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, route => route.abort());
  async function assertWorkspaceAction(expected) {
    await page.locator('#menu-toggle').click();
    assert.equal((await page.locator('#workspace-switch').textContent()).trim(), expected);
    await page.locator('#menu-toggle').click();
  }
  async function learningOnly(path) {
    await page.goto(origin + path);
    const pageHeading = page.locator('#view h1');
    await pageHeading.waitFor();
    assert.ok(['School Standard', 'Gói & thanh toán'].includes((await pageHeading.textContent()).trim()));
    await assertWorkspaceAction('Learning');
    assert.equal(await page.getByRole('heading', { name: 'School Standard', exact: true }).count(), 1);
    assert.equal(await page.getByText(/School Premium|Premium/, { exact: false }).count(), 0);
    assert.equal(await page.locator('[data-personal-timetable]').count(), 0);
  }
  await learningOnly('/school/timetable');
  const registered = await context.request.post(origin + '/api/auth/register', {
    headers: { Origin: origin }, data: { name: 'Outside learner', email: 'outside@maihoc.test', password, accountType: 'external' },
  });
  assert.equal(registered.status(), 201);
  for (const path of ['/school', '/school/tests/1', '/school/classes/12C1', '/learning/tests', '/learning/timetable', '/learning?route=assignments', '/school/admin']) await learningOnly(path);
  assert.equal((await context.request.get(origin + '/api/tests')).status(), 403);
  assert.equal((await context.request.get(origin + '/api/progress')).status(), 200);
  for (const email of ['student@maihoc.test', 'teacher@maihoc.test', 'admin@maihoc.test']) {
    const login = await context.request.post(origin + '/api/auth/login', { headers: { Origin: origin }, data: { email, password } });
    assert.equal(login.status(), 200);
    await page.goto(origin + '/school/timetable');
    await page.locator('[data-place="0-0"]').waitFor();
    await assertWorkspaceAction('Learning');
    assert.equal((await context.request.get(origin + '/api/tests')).status(), 200);
    await page.locator('#logout-button').click();
    await page.waitForURL(origin + '/learning');
    await assertWorkspaceAction('School');
  }
  assert.deepEqual(errors, []);
  console.log('School access: guest/external redirects, API denial, school student/teacher/admin access and logout passed.');
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
