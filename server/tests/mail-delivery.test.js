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
test('Gmail API refreshes OAuth and sends encoded UTF-8 MIME over HTTPS without SMTP', async () => {
  const env={MAIL_PROVIDER:'gmail',GMAIL_API_USER:'maihoc@gmail.com',GMAIL_CLIENT_ID:'client',GMAIL_CLIENT_SECRET:'secret',GMAIL_REFRESH_TOKEN:'refresh',MAIL_FROM:'wrong@old.test'};
  assert.equal(mailConfig(env).configured,true);
  assert.equal(mailConfig({...env,GMAIL_REFRESH_TOKEN:''}).configured,false);
  let calls=0;
  const result=await deliverMail({...message,subject:'Xác nhận email giáo viên',text:'Link xác nhận tiếng Việt',bcc:'hidden@maihoc.test'}, {env,createTransport:()=>{throw Error('SMTP must not be used');},fetchImpl:async(url,options)=>{
    calls++;
    if(calls===1){assert.equal(url,'https://oauth2.googleapis.com/token');const params=new URLSearchParams(options.body);assert.equal(params.get('refresh_token'),'refresh');return{ok:true,json:async()=>({access_token:'access'})};}
    assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal(options.headers.Authorization,'Bearer access');
    const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();
    assert.match(mime,/From: MAIHOC <maihoc@gmail.com>/);assert.ok(!mime.includes('wrong@old.test'));assert.match(mime,/Bcc: hidden@maihoc.test/);assert.match(mime,/Content-Type: multipart\/alternative/);
    return{ok:true,status:200,json:async()=>({id:'gmail-message'})};
  }});
  assert.equal(calls,2);assert.equal(result.provider,'gmail');
  await assert.rejects(deliverMail(message,{env,fetchImpl:async()=>({ok:false,json:async()=>({error:'invalid_grant',error_description:'private secret'})})}),e=>e.code==='GMAIL_REAUTHORIZE'&&!e.message.includes('private'));
  let stage=0;
  await assert.rejects(deliverMail(message,{env,fetchImpl:async()=>++stage===1?{ok:true,json:async()=>({access_token:'access'})}:{ok:false,status:403,json:async()=>({error:'private provider error'})}}),e=>e.code==='GMAIL_HTTP_403'&&!e.message.includes('private'));
});
