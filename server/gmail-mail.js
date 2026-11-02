import nodemailer from 'nodemailer';
const failure = code => Object.assign(new Error('Không thể gửi email qua Gmail API. Kiểm tra quyền OAuth và cấu hình Gmail.'), { code });
export async function gmailAccessToken(config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.gmailClientId, client_secret: config.gmailClientSecret,
      refresh_token: config.gmailRefreshToken, grant_type: 'refresh_token' }).toString()
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) throw failure(data?.error === 'invalid_grant' ? 'GMAIL_REAUTHORIZE' : 'GMAIL_OAUTH_FAILED');
  return data.access_token;
}
export async function deliverGmail(message, config, fetchImpl = globalThis.fetch) {
  const accessToken = await gmailAccessToken(config, fetchImpl);
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows', keepBcc: true });
  let compiled;
  try {
    compiled = await transport.sendMail({ ...message, from: { name: 'MAIHOC', address: config.gmailUser },
      disableFileAccess: true, disableUrlAccess: true });
  } finally { transport.close?.(); }
  const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(compiled.message).toString('base64url') })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) throw failure(`GMAIL_HTTP_${response.status}`);
  return { provider: 'gmail' };
}
