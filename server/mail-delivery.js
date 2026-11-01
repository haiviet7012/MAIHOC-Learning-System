import nodemailer from 'nodemailer';

export function mailConfig(env = process.env) {
  const user = String(env.SMTP_USER || env.GMAIL_USER || env.EMAIL_USER || '').trim();
  const host = String(env.SMTP_HOST || (user ? 'smtp.gmail.com' : '')).trim();
  const rawPass = String(env.SMTP_PASS || env.GMAIL_APP_PASSWORD || env.GMAIL_PASS || env.EMAIL_PASS || '').trim();
  const pass = /(^|\.)gmail\.com$/i.test(host) ? rawPass.replace(/\s+/g, '') : rawPass;
  const port = Number(env.SMTP_PORT || 587);
  const provider = String(env.MAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : 'smtp')).trim().toLowerCase();
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const from = String(env.MAIL_FROM || env.RESEND_FROM || env.SMTP_FROM || user).trim();
  const configured = provider === 'resend' ? Boolean(apiKey && from) : provider === 'smtp' && Boolean(host && user && pass && from && Number.isInteger(port) && port > 0 && port <= 65535 && !/your-gmail-address|your-16-character-app-password|example\.com/i.test(user + ' ' + pass));
  return { provider, host, port, user, pass, from, apiKey, configured };
}

export async function deliverMail(message, { env = process.env, fetchImpl = globalThis.fetch, createTransport = nodemailer.createTransport } = {}) {
  const config = mailConfig(env);
  if (!config.configured) throw Object.assign(new Error('Dịch vụ gửi email chưa được cấu hình. Vui lòng liên hệ quản trị viên.'), { code: 'MAIL_NOT_CONFIGURED' });
  const to = Array.isArray(message.to) ? message.to : [message.to];
  if (config.provider === 'resend') {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, from: config.from, to })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id) throw Object.assign(new Error('Dịch vụ email từ chối yêu cầu.'), { code: `MAIL_HTTP_${response.status}` });
    return { provider: config.provider };
  }
  const transport = createTransport({ host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: config.port === 587, auth: { user: config.user, pass: config.pass },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000 });
  try {
    const result = await transport.sendMail({ ...message, from: config.from, to });
    if (!result.accepted?.length || result.rejected?.length) throw Object.assign(new Error('Máy chủ email từ chối địa chỉ nhận.'), { code: 'MAIL_RECIPIENT_REJECTED' });
    return { provider: config.provider };
  } finally { transport.close?.(); }
}
