import test from 'node:test';
import assert from 'node:assert/strict';
import { mailConfig, deliverMail } from '../mail-delivery.js';
const message = { to: ['student@maihoc.test'], subject: 'Xác minh', text: 'Test', html: '<p>Test</p>' };
test('SMTP keeps env aliases, normalizes Gmail app password, and validates configuration', async () => {
  const env = { GMAIL_USER: 'mailer@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' };
  assert.equal(mailConfig(env).pass, 'abcdefghijklmnop');
  assert.equal(mailConfig({ ...env, SMTP_PORT: 'not-a-port' }).configured, false);
  assert.equal(mailConfig({ SMTP_USER: 'your-gmail-address@gmail.com', SMTP_PASS: 'your-16-character-app-password' }).configured, false);
  let options, closed = false;
  await deliverMail(message, { env, createTransport: value => { options = value; return { sendMail: async mail => { assert.deepEqual(mail.to, message.to); return { accepted: message.to, rejected: [] }; }, close: () => { closed = true; } }; } });
  assert.equal(options.requireTLS, true); assert.equal(options.auth.pass, 'abcdefghijklmnop'); assert.equal(closed, true);
});
test('HTTPS delivery uses Resend and validates acceptance without exposing provider response', async () => {
  const env = { RESEND_API_KEY: 'test-key', MAIL_FROM: 'MAIHOC <mail@maihoc.test>' };
  await deliverMail(message, { env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(options.body).to, message.to);
    return { ok: true, status: 200, json: async () => ({ id: 'mail-fixture' }) };
  } });
  await assert.rejects(deliverMail(message, { env, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: 'secret provider detail' }) }) }), error => error.code === 'MAIL_HTTP_403' && !error.message.includes('secret'));
  await assert.rejects(deliverMail(message, { env: {} }), { code: 'MAIL_NOT_CONFIGURED' });
});
