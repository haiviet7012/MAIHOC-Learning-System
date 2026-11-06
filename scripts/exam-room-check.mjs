import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';
import { parseQuestionText } from '../js/question-parser.js';

const origin = 'http://127.0.0.1:4195';
const preview = spawn(process.execPath, [fileURLToPath(new URL('./dev-preview.mjs', import.meta.url))], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PREVIEW_PORT: '4195' },
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Preview startup timed out')), 45000);
    preview.stdout.on('data', chunk => { output += chunk; if (output.includes('isolated preview ready')) { clearTimeout(timeout); resolve(); } });
    preview.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}`)); });
    preview.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  browser = await chromium.launch({ headless: true, channel: process.env.MAIHOC_BROWSER_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const errors = [], submissions = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, route => route.abort());
  const content = String.raw`Phần I. Trắc nghiệm nhiều lựa chọn.
  Câu 1: Cho hàm số \(f(x)=x^2+1\). Giá trị của \(f(1)\) bằng A. 1 B. 2 C. 3 D. 4
  Câu 2: Tính \(2+2\). A. 1 B. 2 C. 4 D. 5
  Phần II. Trắc nghiệm đúng sai.
  Câu 1: Cho số x=2. a) x>0 b) x<0 c) x=2 d) x=3
  Phần III. Trắc nghiệm trả lời ngắn.
  Câu 1: Tính giá trị của \(-5/4\).`;
  const exam = { id: 'RM101', examCode: '101', title: 'Đề minh họa THPT Quốc Gia môn Toán 2026', subject: 'Toán', grade: '12',
    category: 'exam', content, durationMinutes: 90, questionCount: 4, attemptCount: 0, year: '2026', examType: 'illustrative',
    questions: parseQuestionText(content) };
  exam.questions[0].images = [{ src: '/exam-fixture-graph.svg', alt: 'Đồ thị hàm số y bằng x bình phương cộng một' }];
  await page.route('**/exam-fixture-graph.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="380" height="200" viewBox="0 0 380 200"><rect width="380" height="200" fill="white"/><path d="M30 170H350M190 185V15" stroke="#65748b"/><path d="M65 25Q190 290 315 25" fill="none" stroke="#285bb1" stroke-width="3"/><text x="200" y="30" font-size="14" fill="#17365c">y = x² + 1</text></svg>' }));
  let failSubmit = false;
  await page.route('**/api/national-exams', route => route.fulfill({ json: { exams: [exam], stats: { total: 1, completed: null, average: null } } }));
  await page.route('**/api/exams/RM101/submit', async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ status: failSubmit ? 503 : 200,
      json: failSubmit ? { error: 'Mất kết nối kiểm thử' } : { graded: true, score: 7.75, scale: 10, results: [], percent: 77.5, questionCount: 4 } });
  });
  await page.goto(`${origin}/learning/national-exams`, { waitUntil: 'networkidle' });
  await dismissDevelopmentNotice(page);
  await page.locator('[data-national-start="RM101"]').click();
  await page.locator('[data-room-question]').first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/learning/national-exams/RM101/room');
  assert.equal(await page.locator('[data-room-question]').count(), 4);
  await page.locator('.exam-room-figure img').waitFor();
  assert.equal(await page.locator('.exam-room-figure img').evaluate(image => image.complete && image.naturalWidth > 0), true);
  assert.equal(await page.locator('.education-sidebar').isVisible(), false);
  assert.equal(await page.locator('.topbar').isVisible(), false);
  assert.equal(await page.locator('.room-header').innerText().then(value => value.includes('Mã đề 101')), true);
  const ratio = await page.locator('.room-layout').evaluate(root => root.querySelector('.room-main').getBoundingClientRect().width / root.querySelector('.room-palette').getBoundingClientRect().width);
  assert.ok(ratio > 2.2 && ratio < 2.5, `70/30 layout: ${ratio}`);
  await page.locator('[data-room-sidebar]').click();
  await page.goBack();
  await page.locator('[data-room-dialog]').waitFor({ state: 'visible' });
  await page.locator('[data-room-cancel]').click();
  assert.equal(new URL(page.url()).pathname, '/learning/national-exams/RM101/room');
  assert.equal(await page.locator('.education-sidebar').isVisible(), true);
  await page.locator('[data-room-sidebar]').click();
  await page.locator('[data-room-answer="I-1"][value="B"]').check();
  await page.locator('[data-room-flag="I-1"]').click();
  await page.locator('[data-room-progress]').filter({ hasText: 'Đã làm: 1/4 câu' }).waitFor();
  assert.equal(await page.locator('[data-room-jump="I-1"]').evaluate(button => button.classList.contains('is-flagged') && button.classList.contains('is-answered')), true);
  await page.locator('[data-room-mode]').selectOption('single');
  assert.equal(await page.locator('[data-room-question]:visible').count(), 1);
  await page.locator('[data-room-jump="II-1"]').click();
  await page.locator('[data-room-answer="II-1a"][value="true"]').check();
  assert.equal(await page.locator('[data-room-progress]').innerText(), 'Đã làm: 1/4 câu');
  for (const [suffix, value] of [['b', 'false'], ['c', 'true'], ['d', 'false']]) await page.locator(`[data-room-answer="II-1${suffix}"][value="${value}"]`).check();
  assert.equal(await page.locator('[data-room-progress]').innerText(), 'Đã làm: 2/4 câu');
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-answer="III-1"]').fill('-1,25');
  assert.equal(await page.locator('[data-room-progress]').innerText(), 'Đã làm: 3/4 câu');
  await page.locator('[data-room-jump="I-2"]').click();
  await page.locator('[data-room-answer="I-2"][value="C"]').check();
  await page.locator('[data-room-clear="I-2"]').click();
  assert.equal(await page.locator('[data-room-progress]').innerText(), 'Đã làm: 3/4 câu');
  await page.locator('[data-room-answer="I-2"][value="C"]').check();
  await page.locator('[data-room-mode]').selectOption('all');
  const savedDeadline = await page.evaluate(() => JSON.parse(localStorage.getItem('maihoc:exam-room:guest:RM101')).deadline);
  await page.reload({ waitUntil: 'networkidle' });
  await dismissDevelopmentNotice(page);
  assert.equal(await page.locator('[data-room-progress]').innerText(), 'Đã làm: 4/4 câu');
  assert.equal(await page.locator('[data-room-answer="III-1"]').inputValue(), '-1,25');
  assert.equal(await page.locator('[data-room-flag="I-1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('maihoc:exam-room:guest:RM101')).deadline), savedDeadline);
  await page.locator('[data-room-exit]').click();
  await page.locator('[data-room-cancel]').click();
  assert.equal(await page.locator('[data-room-dialog]').isVisible(), false);
  await page.locator('[data-room-submit]').click();
  await page.locator('[data-room-cancel]').click();
  assert.equal(submissions.length, 0);

  const directory = new URL('../test-results/exam-room/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => {
      document.documentElement.classList.toggle('dark', value === 'dark');
      document.documentElement.classList.toggle('light', value === 'light');
      localStorage.setItem('maihoc-theme', value);
    }, theme);
    await page.waitForFunction(expected => getComputedStyle(document.querySelector('[data-room-submit]')).backgroundColor === expected,
      theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(20, 45, 85)');
    await page.screenshot({ path: fileURLToPath(new URL(`desktop-${theme}.png`, directory)), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-dark.png', directory)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('[data-room-exit]').click();
  await page.locator('[data-room-confirm]').click();
  await page.locator('[data-national-start="RM101"]').waitFor();
  assert.equal(await page.locator('.topbar').isVisible(), true);
  await page.locator('[data-national-start="RM101"]').click();
  await page.locator('[data-room-progress]').filter({ hasText: 'Đã làm: 4/4 câu' }).waitFor();
  await page.locator('[data-room-submit]').click();
  await page.locator('[data-room-confirm]').click();
  await page.getByRole('heading', { name: 'Kết quả bài làm', exact: true }).waitFor();
  assert.equal(submissions.length, 1);
  assert.deepEqual(submissions[0].answers, { 'I-1': 'B', 'I-2': 'C', 'II-1a': 'true', 'II-1b': 'false', 'II-1c': 'true', 'II-1d': 'false', 'III-1': '-1,25' });
  assert.equal(await page.evaluate(() => localStorage.getItem('maihoc:exam-room:guest:RM101')), null);
  await page.getByRole('button', { name: '← Về Kho Đề Thi THPT Quốc Gia' }).click();

  // Real room timer under a controlled browser clock: warning, modal dismissal,
  // expiry, preserved draft after failure and a single explicit successful retry.
  await page.clock.install();
  await page.evaluate(() => localStorage.setItem('maihoc:exam-room:guest:RM101', JSON.stringify({ deadline: Date.now() + 301000, answers: { 'I-1': 'A' }, flags: ['I-1'], mode: 'single', activeId: 'I-1' })));
  await page.locator('[data-national-start="RM101"]').click();
  await page.locator('[data-room-question]').first().waitFor();
  await page.clock.fastForward(2000);
  assert.equal(await page.locator('[data-room-clock]').evaluate(clock => clock.classList.contains('is-warning')), true);
  await page.locator('[data-room-exit]').click();
  failSubmit = true;
  await page.clock.fastForward(300000);
  await page.getByRole('button', { name: 'Thử nộp lại', exact: true }).waitFor();
  assert.equal(await page.locator('[data-room-dialog]').isVisible(), false);
  assert.equal(await page.locator('[data-room-answer="I-1"][value="A"]').isDisabled(), true);
  assert.equal(await page.locator('[data-room-timer]').innerText(), '00:00');
  assert.ok(await page.evaluate(() => localStorage.getItem('maihoc:exam-room:guest:RM101')));
  assert.equal(submissions.length, 2);
  await page.clock.fastForward(10000);
  assert.equal(submissions.length, 2);
  failSubmit = false;
  await page.getByRole('button', { name: 'Thử nộp lại', exact: true }).click();
  await page.getByRole('heading', { name: 'Kết quả bài làm', exact: true }).waitFor();
  assert.equal(submissions.length, 3);
  assert.deepEqual(submissions[2].answers, { 'I-1': 'A' });
  assert.deepEqual(errors, []);
  console.log('Exam room browser checks passed: 70/30 layout, all question types, palette, flags, navigation, draft reload, exit/submit confirmations, themes/mobile, warning, timeout, failed submission and retry.');
} finally {
  await browser?.close(); preview.kill();
}
