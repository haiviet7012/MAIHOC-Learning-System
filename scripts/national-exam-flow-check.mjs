import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';
import { validateNationalExam } from '../server/national-exam-engine.js';

const origin = 'http://127.0.0.1:4196', password = randomUUID();
const preview = spawn(process.execPath, [fileURLToPath(new URL('./dev-preview.mjs', import.meta.url))], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PREVIEW_PORT: '4196', MAIHOC_PREVIEW_PASSWORD: password },
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let output = ''; const timeout = setTimeout(() => reject(new Error('Preview startup timed out')), 45000);
    preview.stdout.on('data', chunk => { output += chunk; if (output.includes('isolated preview ready')) { clearTimeout(timeout); resolve(); } });
    preview.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}`)); });
    preview.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  browser = await chromium.launch({ headless: true, channel: process.env.MAIHOC_BROWSER_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, route => route.abort());
  const mocks = JSON.parse(await readFile(new URL('../server/national-exam-mock.json', import.meta.url), 'utf8')).exams;
  const login = async email => {
    const response = await page.request.post(`${origin}/api/auth/login`, { data: { email, password }, headers: { Origin: origin } });
    assert.equal(response.status(), 200);
    await page.goto(`${origin}/learning/national-exams`, { waitUntil: 'networkidle' }); await dismissDevelopmentNotice(page);
  };
  await login('student@maihoc.test');
  assert.equal(await page.locator('[data-national-create]').count(), 0);
  const directory = new URL('../test-results/national-exam-flow/', import.meta.url); await mkdir(directory, { recursive: true });
  let firstAttempt;
  for (const [index, mock] of mocks.entries()) {
    if (index) await page.getByRole('button', { name: '← Về Kho Đề Thi THPT Quốc Gia', exact: true }).click();
    const exam = validateNationalExam(mock);
    await page.locator(`[data-national-start="${mock.id}"]`).click();
    await page.locator('[data-room-question]').first().waitFor();
    assert.equal(await page.locator('[data-room-question]').count(), 4);
    for (const q of exam.questions) {
      if (index === 0 && q.type === 'short_answer') continue;
      if (q.type === 'multiple_choice') await page.locator(`[data-room-answer="${q.id}"][value="${index === 0 && q.id === 'I-2' ? 'A' : q.correctAnswer}"]`).check();
      else if (q.type === 'true_false') for (const s of q.statements) await page.locator(`[data-room-answer="${q.id}${s.id}"][value="${index === 0 ? 'true' : String(q.correctAnswer[s.id])}"]`).check();
      else await page.locator(`[data-room-answer="${q.id}"]`).fill(String(q.correctAnswer).replace('.', ','));
    }
    await page.locator('[data-room-submit]').click();
    await page.locator('[data-room-confirm]').click();
    await page.locator('.exam-result-score').waitFor();
    assert.equal(await page.locator('.exam-result-score').innerText(), `${index === 0 ? '3.00' : '10.00'}/10`);
    assert.equal(await page.locator('.exam-review-card').count(), 4);
    assert.equal(await page.locator('.exam-review-card details[open]').count(), 4);
    assert.ok((await page.locator('.exam-result-counts').innerText()).includes(index === 0 ? 'Đúng\n1' : 'Đúng\n4'));
    const resultId = new URL(page.url()).pathname.split('/').at(-1); assert.match(resultId, /^\d+$/);
    const apiResult = await (await page.request.get(`${origin}/api/national-exams/results/${resultId}`)).json();
    assert.equal(apiResult.saved, true); assert.equal(apiResult.questions.length, 4);
    assert.equal(apiResult.score, index === 0 ? 3 : 10);
    if (index === 0) {
      firstAttempt = resultId;
      assert.equal(apiResult.correctCount, 1); assert.equal(apiResult.incorrectCount, 2); assert.equal(apiResult.blankCount, 1);
      assert.equal(await page.locator('.exam-review-option.is-incorrect').count(), 1);
      await page.locator('#theme-toggle').click();
      await page.screenshot({ path: fileURLToPath(new URL('result-desktop.png', directory)), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: fileURLToPath(new URL('result-mobile.png', directory)), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1080 });
    }
  }
  await page.reload({ waitUntil: 'networkidle' }); await dismissDevelopmentNotice(page);
  await page.locator('.exam-result-score').waitFor();
  const progress = await (await page.request.get(`${origin}/api/progress`)).json();
  assert.equal(progress.progress.filter(item => String(item.itemId).startsWith('mock-thpt-')).length, 6);
  const activity = await (await page.request.get(`${origin}/api/learning/recent-activity`)).json();
  assert.equal(activity.items.filter(item => item.type === 'exam_completed').length, 6);
  await page.locator('.education-sidebar [data-route="analytics"]').click();
  await page.locator(`.learning-progress-list [data-action="view-exam-result"][data-id="${firstAttempt}"]`).click();
  await page.locator('.exam-result-score').filter({ hasText: '3.00/10' }).waitFor();
  await page.locator('.education-sidebar nav [data-route="home"]').click();
  await page.locator(`[data-portal-activity] [data-id="${firstAttempt}"]`).click();
  await page.locator('.exam-result-score').filter({ hasText: '3.00/10' }).waitFor();
  await page.getByRole('button', { name: '← Về Kho Đề Thi THPT Quốc Gia', exact: true }).click();
  await page.locator('[data-national-history="mock-thpt-toan-2026"]').click();
  await page.locator(`[data-national-result="${firstAttempt}"]`).click();
  await page.locator('.exam-result-score').filter({ hasText: '3.00/10' }).waitFor();
  await page.locator('[data-result-ai="I-1"]').click();
  await page.locator('.universal-ai-prompt').waitFor();
  const prompt = await page.locator('.universal-ai-prompt').inputValue();
  assert.ok(prompt.includes('2^3')); assert.ok(prompt.includes('Đáp án chuẩn: B'));

  await login('teacher@maihoc.test');
  await page.locator('[data-national-create]').click();
  const editor = page.locator('[data-exam-editor]');
  await editor.locator('[name=title]').fill('Đề Teacher kiểm thử đầy đủ ba dạng');
  await editor.locator('[name="q-0-text"]').fill('2 + 2 bằng bao nhiêu?');
  await editor.locator('[name="q-0-points"]').fill('3');
  for (const [i, id] of ['A', 'B', 'C', 'D'].entries()) await editor.locator(`[name="q-0-option-${id}"]`).fill(String(i + 3));
  await editor.locator('[name="q-0-correct"]').selectOption('B');
  await editor.locator('[name="q-0-explanation"]').fill('2 + 2 = 4, chọn B.');
  await editor.locator('[data-editor-add]').click();
  await editor.locator('[data-editor-type="1"]').selectOption('true_false');
  await editor.locator('[name="q-1-text"]').fill('Xét các phép tính.');
  await editor.locator('[name="q-1-points"]').fill('4');
  for (const s of ['a', 'b', 'c', 'd']) await editor.locator(`[name="q-1-statement-${s}"]`).fill('1 + 1 = 2');
  await editor.locator('[name="q-1-explanation"]').fill('Cả bốn ý đều đúng vì 1 + 1 = 2.');
  await editor.locator('[data-editor-add]').click();
  await editor.locator('[data-editor-type="2"]').selectOption('short_answer');
  await editor.locator('[name="q-2-text"]').fill('Tính 10 / 4.');
  await editor.locator('[name="q-2-points"]').fill('3');
  await editor.locator('[name="q-2-correct"]').fill('2.5');
  await editor.locator('[name="q-2-explanation"]').fill('10 chia 4 bằng 2,5.');
  await editor.getByRole('button', { name: 'Lưu đề thi', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  const teacherBank = await (await page.request.get(`${origin}/api/national-exams/manage`)).json();
  assert.equal(teacherBank.exams.length, 1); const own = teacherBank.exams[0];
  assert.deepEqual(own.questions.map(q => q.type), ['multiple_choice', 'true_false', 'short_answer']);
  await page.locator('[data-national-manage]').click();
  await editor.locator(`[data-editor-edit="${own.id}"]`).click();
  await editor.locator('[name=title]').fill('Đề Teacher Paid School');
  await editor.locator('[name=access]').selectOption('school');
  await editor.getByRole('button', { name: 'Lưu đề thi', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await page.locator('[data-national-manage]').click();
  await editor.locator(`[data-editor-edit="${own.id}"]`).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('teacher-bank.png', directory)), fullPage: true });
  await editor.locator('[data-editor-close]').click();
  await page.locator('#logout-button').click();
  await page.locator('#login-open').waitFor({ state: 'visible' });
  await page.goto(`${origin}/learning/national-exams`, { waitUntil: 'networkidle' }); await dismissDevelopmentNotice(page);
  const locked = page.locator(`[data-national-start="${own.id}"]`); await locked.waitFor(); assert.equal(await locked.isDisabled(), true);
  const blocked = await page.request.post(`${origin}/api/national-exams/${own.id}/sessions`, { data: {}, headers: { Origin: origin } }); assert.equal(blocked.status(), 403);
  await page.locator('[data-national-start="mock-thpt-toan-2026"]').click();
  await page.locator('[data-room-question]').first().waitFor();
  await page.locator('[data-room-submit]').click(); await page.locator('[data-room-confirm]').click();
  await page.locator('.exam-result-score').filter({ hasText: '0.00/10' }).waitFor();
  await page.reload({ waitUntil: 'networkidle' }); await dismissDevelopmentNotice(page);
  await page.locator('.exam-result-score').filter({ hasText: '0.00/10' }).waitFor();
  assert.ok((await page.locator('.exam-result-view').innerText()).includes('Kết quả khách'));
  await login('admin@maihoc.test');
  await page.locator('[data-national-manage]').click();
  await editor.locator(`[data-editor-edit="${own.id}"]`).waitFor();
  assert.equal(await editor.locator('[data-editor-edit]').count(), 7);
  await editor.locator(`[data-editor-edit="${own.id}"]`).click();
  await editor.locator('[name=title]').fill('Đề đã được Admin cập nhật');
  await editor.getByRole('button', { name: 'Lưu đề thi', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('Real THPT flow passed for all 6 subjects: scoring/review, persisted progress/activity/history, AI context, Teacher create/edit, Admin edit and Paid School gate.');
} finally { await browser?.close(); preview.kill(); }
