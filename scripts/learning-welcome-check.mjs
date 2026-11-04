import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { dismissDevelopmentNotice } from './browser-notices.mjs';

const origin = 'http://127.0.0.1:4192';
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs'], {
  env: { ...process.env, PREVIEW_PORT: '4192' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Preview startup timeout')), 60000);
    preview.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('isolated preview ready')) { clearTimeout(timer); resolve(); }
    });
    preview.stderr.on('data', chunk => process.stderr.write(chunk));
    preview.once('exit', code => { clearTimeout(timer); reject(Error('Preview exit ' + code)); });
  });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  await mkdir('test-results', { recursive: true });
  for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, route => route.abort());
      for (const path of ['/', '/learning']) {
        await page.goto(origin + path);
        const notice = page.getByRole('dialog', { name: 'Website đang trong giai đoạn phát triển, chưa phải phiên bản chính thức!', exact: true });
        await notice.waitFor({ state: 'visible' });
        assert.equal(await notice.evaluate(el => getComputedStyle(el).borderRadius), '0px');
        assert.equal(await notice.evaluate(el => getComputedStyle(el).fontFamily), await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily));
        assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), theme === 'dark');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `test-results/learning-notice-${device}-${theme}-${path === '/' ? 'root' : 'learning'}.png` });
        await dismissDevelopmentNotice(page);
        // Wait through a real auth-driven rerender. Dismissal must persist within this document.
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('maihoc-user-updated', { detail: { user: null } })));
        assert.equal(await notice.isVisible(), false);
        const invitation = page.locator('.learning-school-invitation');
        await invitation.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/learning-invitation-${device}-${theme}.png`, fullPage: true });
        await invitation.getByRole('link', { name: 'Đăng ký', exact: true }).click();
        await page.waitForURL(origin + '/school/plans');
        await page.getByRole('heading', { name: 'School Standard', exact: true }).waitFor();
        assert.equal(await notice.isVisible(), false);
      }
      await page.goto(origin + '/learning');
      await page.locator('#development-notice-dialog[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#development-notice-dialog').waitFor({ state: 'hidden' });
      await page.reload();
      await page.locator('#development-notice-dialog[open]').waitFor();
      await dismissDevelopmentNotice(page);
      await page.goto(origin + '/learning?route=assignments');
      await page.getByRole('heading', { name: 'School Standard', exact: true }).waitFor();
      assert.equal(await page.locator('#development-notice-dialog').isVisible(), false);
      await page.goto(origin + '/learning#teacher-email-confirm=00000000-0000-4000-8000-000000000000:' + 'a'.repeat(64));
      await page.locator('#register-dialog[open]').waitFor();
      assert.equal(await page.locator('#development-notice-dialog').isVisible(), false);
      await page.locator('#register-dialog [data-close]').first().click();
      assert.equal(await page.locator('dialog[open]').count(), 0, 'Email confirmation must not leave a hidden blocking notice behind');
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  console.log('Learning entry popup, close/Escape/reload, CTA navigation, light/dark/mobile and legacy/auth deep-link compatibility passed.');
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
