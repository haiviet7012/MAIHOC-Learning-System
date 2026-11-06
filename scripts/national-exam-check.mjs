import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';

const password = randomUUID();
const origin = 'http://127.0.0.1:4194';
const preview = spawn(process.execPath, [fileURLToPath(new URL('./dev-preview.mjs', import.meta.url))], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PREVIEW_PORT: '4194', MAIHOC_PREVIEW_PASSWORD: password },
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Preview startup timed out')), 45000);
    preview.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('isolated preview ready')) { clearTimeout(timeout); resolve(); }
    });
    preview.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited: ${code}`)); });
    preview.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  browser = await chromium.launch({ headless: true, channel: process.env.MAIHOC_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, route => route.abort());
  const base = { category: 'exam', grade: '12', durationMinutes: 90, questionCount: 22, attemptCount: 127, completed: false, bestScore: null,
    content: 'Câu 1: Tính 1 + 1.\nA. 1\nB. 2\nC. 3\nD. 4' };
  const exams = [
    { ...base, id: 'M101', createdAt: '2026-11-06', lastCompletedAt: '2026-11-07T01:00:00Z', subject: 'Toán', year: '2026', title: 'Đề minh họa Bộ GD&ĐT môn Toán 2026', examType: 'illustrative', completed: true, bestScore: 8.5 },
    { ...base, id: 'L102', createdAt: '2026-11-01', subject: 'Vật lý', year: '2025', title: 'Đề chính thức tốt nghiệp THPT môn Vật lý 2025', examType: 'official' },
    { ...base, id: 'H103', createdAt: '2026-11-02', subject: 'Hóa học', year: '2024', title: 'Đề thi thử THPT chuyên môn Hóa học 2024', examType: 'trial' },
    { ...base, id: 'A104', createdAt: '2026-11-03', subject: 'Tiếng Anh', year: '2026', title: 'Đề thi thử Sở GD&ĐT môn Tiếng Anh 2026', examType: 'trial' },
  ];
  let failCatalog = false, emptyCatalog = false;
  await page.route('**/api/national-exams', route => route.fulfill({ status: failCatalog ? 503 : 200,
    json: failCatalog ? { error: 'Tạm thời không kết nối được kho đề.' } : { exams: emptyCatalog ? [] : exams,
      stats: { total: emptyCatalog ? 0 : 4, completed: 1, average: 8.5 } } }));
  await page.route('**/api/national-exams/*/history', route => route.fulfill({ json: { attempts: [{ id: 901, graded: true, score: 8.5, scale: 10, createdAt: '2026-11-06 08:00:00' }] } }));
  await page.route('**/api/national-exams/results/901', route => route.fulfill({ json: { attemptId: 901, examId: 'M101', title: exams[0].title,
    subject: 'Toán', answers: { 1: 'B' }, graded: true, score: 8.5, scale: 10, results: [], percent: 85, questionCount: 22 } }));
  await page.goto(`${origin}/learning`, { waitUntil: 'networkidle' });
  await dismissDevelopmentNotice(page);
  await page.locator('#menu-toggle').click();
  await page.locator('#subject-menu [data-subject="Đề thi THPT quốc gia"]').click();
  await page.locator('.national-exam-card').first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/learning/national-exams');
  assert.equal(await page.locator('#subject-menu').evaluate(menu => menu.classList.contains('open')), false);
  assert.ok(!(await page.locator('#toast-region').innerText()).includes('chưa được kích hoạt'));
  assert.equal(await page.locator('.education-top-title').innerText(), 'MAIHOC Learning');
  assert.equal(await page.locator('nav[data-sidebar-space="learning"]').isVisible(), true);
  await page.locator('[data-national-completion]').selectOption('completed');
  assert.equal(await page.locator('.national-exam-card').count(), 1);
  assert.equal(await page.locator('.national-exam-card [data-national-start]').first().getAttribute('data-national-start'), 'M101');
  await page.locator('[data-national-completion]').selectOption('unanswered');
  assert.equal(await page.locator('.national-exam-card').count(), 3);
  await page.locator('[data-national-completion]').selectOption('all');
  assert.equal(await page.locator('.national-exam-card [data-national-start]').first().getAttribute('data-national-start'), 'M101');
  await page.locator('[data-national-date]').selectOption('oldest');
  assert.equal(await page.locator('.national-exam-card [data-national-start]').first().getAttribute('data-national-start'), 'L102');
  await page.locator('[data-national-date]').selectOption('newest');
  await page.locator('[data-national-completion]').selectOption('unanswered-first');
  await page.locator('[data-national-history="M101"]').click();
  await page.getByText('Đăng nhập để lưu kết quả', { exact: false }).waitFor();
  await page.locator('[data-national-close]').click();
  await page.locator('[data-national-subject="Toán"]').click();
  assert.equal(await page.locator('.national-exam-card').count(), 1);
  await page.locator('[data-national-year]').selectOption('2025');
  await page.getByRole('heading', { name: 'Không tìm thấy đề thi phù hợp' }).waitFor();
  await page.locator('[data-national-reset]').click();
  await page.locator('[data-national-type]').selectOption('official');
  assert.equal(await page.locator('.national-exam-card').count(), 1);
  await page.locator('[data-national-type]').selectOption('');
  await page.locator('[data-national-search]').fill('de minh hoa toan');
  assert.equal(await page.locator('.national-exam-card').count(), 1);
  await page.locator('[data-national-search]').fill('L102');
  assert.equal(await page.locator('.national-exam-card').count(), 1);
  await page.locator('[data-national-search]').fill('');

  const directory = new URL('../test-results/national-exam/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const theme of ['light', 'dark']) {
    const dark = await page.locator('html').evaluate(html => html.classList.contains('dark'));
    if (dark !== (theme === 'dark')) await page.locator('#theme-toggle').click();
    await page.waitForFunction(expected => getComputedStyle(document.querySelector('[data-national-start]')).backgroundColor === expected,
      theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(20, 45, 85)');
    const colors = await page.locator('[data-national-start]').first().evaluate(button => {
      const css = getComputedStyle(button);
      return { background: css.backgroundColor, color: css.color };
    });
    assert.deepEqual(colors, theme === 'dark' ? { background: 'rgb(255, 255, 255)', color: 'rgb(23, 54, 92)' }
      : { background: 'rgb(20, 45, 85)', color: 'rgb(255, 255, 255)' });
    await page.screenshot({ path: fileURLToPath(new URL(`desktop-${theme}.png`, directory)), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.education-sidebar').getBoundingClientRect().right <= 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const columns = await page.locator('.national-exam-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  assert.equal(columns, 1);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-dark.png', directory)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 });

  const login = await page.request.post(`${origin}/api/auth/login`, { data: { email: 'student@maihoc.test', password }, headers: { Origin: origin } });
  assert.equal(login.status(), 200);
  await page.reload({ waitUntil: 'networkidle' });
  await dismissDevelopmentNotice(page);
  await page.locator('[data-national-history="M101"]').click();
  await page.locator('[data-national-result="901"]').click();
  await page.getByRole('heading', { name: 'Kết quả bài làm', exact: true }).waitFor();
  await page.getByRole('button', { name: '← Về Kho Đề Thi THPT Quốc Gia' }).click();
  await page.locator('.national-exam-card').first().waitFor();
  await page.locator('[data-national-start="M101"]').click();
  await page.locator('#exam-room-answer-form').waitFor();
  assert.equal(new URL(page.url()).pathname, '/learning/national-exams/M101/room');
  assert.ok((await page.locator('#view').innerText()).includes('90:00'));
  await page.locator('[data-room-exit]').click();
  await page.locator('[data-room-confirm]').click();
  await dismissDevelopmentNotice(page);
  await page.getByRole('heading', { name: 'Kho Đề Thi THPT Quốc Gia', exact: true }).waitFor();
  failCatalog = true;
  await page.reload({ waitUntil: 'networkidle' });
  await dismissDevelopmentNotice(page);
  await page.getByRole('heading', { name: 'Chưa tải được kho đề thi' }).waitFor();
  failCatalog = false;
  await page.locator('[data-national-retry]').click();
  await page.locator('.national-exam-card').first().waitFor();
  emptyCatalog = true;
  await page.reload({ waitUntil: 'networkidle' });
  await dismissDevelopmentNotice(page);
  await page.getByRole('heading', { name: 'Chưa có đề thi khả dụng' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('THPT browser checks passed: menu, route, combined filters, themes, mobile, history, exam entry, error/retry and empty state.');
} finally {
  await browser?.close();
  preview.kill();
}
