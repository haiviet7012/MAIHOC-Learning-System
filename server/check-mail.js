import { gmailAccessToken } from './gmail-mail.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { mailConfig } from './mail-delivery.js';

// Run in the deployed service environment; never print credentials or OTPs.
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const config = mailConfig();
const result = { provider: config.provider, configured: config.configured };
try {
  if (!config.configured) {
    result.status = 'MAIL_NOT_CONFIGURED';
    result.message = config.provider === 'gmail' ? 'Kiểm tra GMAIL_API_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.' : config.provider === 'resend'
      ? 'Kiểm tra RESEND_API_KEY và MAIL_FROM/RESEND_FROM.'
      : 'Kiểm tra MAIL_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS và MAIL_FROM. Gmail cần mật khẩu ứng dụng.';
    process.exitCode = 1;
  } else if (!process.argv.includes('--verify')) {
    result.status = 'CONFIG_PRESENT';
    result.message = 'Có cấu hình. Dùng --verify để kiểm tra kết nối và xác thực; không gửi email.';
  } else if (config.provider === 'gmail') {
    await gmailAccessToken(config);
    result.status = 'GMAIL_OAUTH_VERIFIED';
    result.message = 'Đổi refresh token thành access token thành công; chưa xác nhận quyền gửi hay giao nhận thư.';
  } else if (config.provider === 'resend') {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(10000)
    });
    // A sending-only key cannot list domains. Do not mistake that for send failure.
    result.status = response.ok ? 'API_CONNECTED' : `MAIL_HTTP_${response.status}`;
    result.message = response.ok
      ? 'API kết nối được. Vẫn cần tên miền gửi đã xác minh và kiểm tra giao nhận thực tế.'
      : 'Không xác nhận được quyền đọc domains; key chỉ có quyền gửi có thể không dùng được phép kiểm tra này.';
    if (!response.ok) process.exitCode = 1;
  } else {
    const transport = nodemailer.createTransport({ host: config.host, port: config.port,
      secure: config.port === 465, requireTLS: config.port === 587,
      auth: { user: config.user, pass: config.pass }, connectionTimeout: 8000,
      greetingTimeout: 8000, socketTimeout: 10000 });
    try { await transport.verify(); } finally { transport.close?.(); }
    result.status = 'SMTP_VERIFIED';
    result.message = 'Kết nối và xác thực SMTP thành công. Chưa kiểm tra giao nhận đến hộp thư.';
  }
} catch (error) {
  result.status = /^[A-Z0-9_]{1,50}$/.test(String(error.code || '')) ? error.code : 'MAIL_CHECK_FAILED';
  result.message = 'Không xác nhận được kết nối mail. Kiểm tra cấu hình, quyền gửi và kết nối mạng của dịch vụ.';
  process.exitCode = 1;
}
console.log(JSON.stringify(result, null, 2));
