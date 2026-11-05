import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Isolated database and in-memory object storage: no production data or uploads.
delete process.env.DATABASE_URL;
delete process.env.MAIHOC_TEST_DATABASE_URL;
for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) process.env[key] = 'regression-test';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
const { testDatabase } = await import('../server/platform/test-db.js');
const { setTestPool } = await import('../server/postgres.js');
const fixture = await testDatabase({ memoryOnly: true });
setTestPool(fixture.pool);
const { initChatDatabase, setupChat } = await import('../server/chat.js');
const { r2 } = await import('../server/r2-storage.js');
const objects = new Map();
r2.send = async command => {
  const { Key, Body } = command.input;
  if (command.constructor.name === 'PutObjectCommand') { objects.set(Key, Buffer.from(Body)); return {}; }
  if (command.constructor.name === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
  const bytes = objects.get(Key);
  if (!bytes) throw new Error('Missing test object');
  return { Body: { transformToByteArray: async () => bytes } };
};
await initChatDatabase();
await fixture.db.query("INSERT INTO users(id,name,email,password_hash,role,admin_level,account_type) VALUES(100,'Test Student','test@maihoc.test','unused','user',0,'school')");
// Reproduce an existing server database that predates attachment support.
await fixture.db.exec(`ALTER TABLE chat_messages DROP COLUMN attachment_key;
  ALTER TABLE chat_messages DROP COLUMN attachment_name;
  ALTER TABLE chat_messages DROP COLUMN attachment_type;
  ALTER TABLE chat_messages DROP COLUMN attachment_size;`);
const user = { id: 100, name: 'Test Student', accountType: 'school', role: 'user' };
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = user; next(); });
app.get('/api/auth/me', (_req, res) => res.json({ user }));
const server = createServer(app);
setupChat(server, app);
app.get('/api/classroom-access', (_req, res) => res.json({ staff: true, admin: false, mine: [], pending: [], rooms: [] }));
app.all('/api/classroom-access/rooms/:code', (_req, res) => res.json({ ok: true }));
app.all('/api/classroom-access/rooms/:code/:action', (_req, res) => res.json({ meetingId: 'test-meeting', url: 'test', token: 'test' }));
app.get('/js/vendor/livekit-client.js', (_req, res) => res.type('js').send(`
  export const Track={Kind:{Audio:'audio',Video:'video'},Source:{Camera:'camera',Microphone:'microphone',ScreenShare:'screen_share'}};
  export const RoomEvent=new Proxy({}, {get:(_target,key)=>key});
  const person=(identity,name)=>({identity,name,attributes:{},trackPublications:new Map(),isMicrophoneEnabled:false,isCameraEnabled:false,getTrackPublication:()=>null});
  export class Room {
    constructor(){this.localParticipant=person('self','Test Student');this.remoteParticipants=new Map([['other',person('other','Other Student')]]);this.events=new Map();window.testMeeting=this;}
    on(type,handler){const list=this.events.get(type)||[];list.push(handler);this.events.set(type,list);return this;}
    once(type,handler){return this.on(type,handler);}
    emit(type,...args){for(const handler of this.events.get(type)||[])handler(...args);}
    async connect(){this.state='connected';}
    async disconnect(){this.state='disconnected';}
    removeAllListeners(){this.events.clear();}
  }
`));
const styles = '<link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/chat.css"><link rel="stylesheet" href="/css/school-theme.css">';
app.get('/regression/chat', (_req, res) => res.send(`<!doctype html><html><head>${styles}</head><body data-school-ui><script type="module" src="/js/chat.js"></script></body></html>`));
app.get('/regression/rooms', (_req, res) => res.send(`<!doctype html><html><head>${styles}</head><body data-school-ui><main id="view"></main><script type="module">import {mountClassroomShell} from '/js/platform/classroom-shell.js';window.cleanup=mountClassroomShell(document.querySelector('main'),${JSON.stringify(user)});</script></body></html>`));
app.use(express.static(fileURLToPath(new URL('../', import.meta.url))));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(dialog.message()); return dialog.dismiss(); });
  await page.goto(origin + '/regression/chat');
  await page.locator('#chat-launcher').click();
  await page.locator('#chat-global-attach').waitFor({ state: 'visible' });
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 50;
    canvas.getContext('2d').fillRect(0, 0, 80, 50);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.locator('#chat-global-file').setInputFiles({ name: 'test-image.png', mimeType: 'image/png', buffer: image });
  await page.locator('#chat-global-attachment-preview img').waitFor();
  await page.locator('#chat-global-send').click();
  await page.locator('.chat-image-attachment').click();
  await page.locator('#chat-media-viewer').waitFor({ state: 'visible' });
  await page.locator('#chat-media-image').hover();
  const initialImageWidth=(await page.locator('#chat-media-image').boundingBox()).width;
  await page.mouse.wheel(0,-120);
  await page.waitForFunction(()=>document.querySelector('#chat-media-zoom-output').textContent==='110%');
  assert.ok((await page.locator('#chat-media-image').boundingBox()).width>initialImageWidth,'Wheel must enlarge the actual image, not just the percentage');
  await page.mouse.wheel(0,120);
  await page.waitForFunction(()=>document.querySelector('#chat-media-zoom-output').textContent==='100%');
  await page.locator('#chat-media-zoom').fill('200');
  assert.equal(await page.locator('#chat-media-zoom-output').textContent(), '200%');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#chat-media-copy').click();
  await page.waitForFunction(() => document.querySelector('#chat-media-copy').textContent === 'Đã sao chép');
  assert.ok((await page.evaluate(async () => (await navigator.clipboard.read()).flatMap(item => item.types))).includes('image/png'));
  const source = await page.locator('#chat-media-image').getAttribute('src');
  assert.deepEqual(Buffer.from(await (await page.request.get(origin + source)).body()), image);
  await page.locator('#chat-media-close').click();
  await page.locator('#chat-global-file').setInputFiles({ name: 'exercise.txt', mimeType: 'text/plain', buffer: Buffer.from('Exercise') });
  await page.locator('#chat-global-send').click();
  await page.locator('.chat-file-attachment').waitFor();
  assert.equal(await page.locator('.chat-file-details strong').textContent(), 'exercise.txt');
  // Reloading must preserve real server-side attachments, not only local previews.
  await page.reload();
  await page.locator('#chat-launcher').click();
  await page.locator('.chat-image-attachment').waitFor();
  await page.locator('.chat-file-attachment').waitFor();
  // Paste clipboard images and send without a Socket.IO connection.
  await page.locator('#chat-global-input').evaluate((input, bytes) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([new Uint8Array(bytes)], 'pasted.png', { type: 'image/png' }));
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, [...image]);
  await page.locator('#chat-global-attachment-preview img').waitFor();
  await page.locator('#chat-global-send').click();
  await page.waitForFunction(() => document.querySelectorAll('.chat-image-attachment').length === 2);
  console.log('PASS: image/file uploads, paste, history, zoom, copy image, and HTTP-only send');

  await page.goto(origin + '/regression/rooms');
  await page.locator('[data-cr-search]').waitFor();
  const title = await page.locator('.cr-lobby-panel > h2').boundingBox();
  const search = await page.locator('.cr-search-row').boundingBox();
  assert.ok(search.y >= title.y + title.height + 15, 'Search is on its own row below title');
  await page.locator('[data-cr-search]').fill('10A2');
  assert.equal(await page.locator('[data-cr-card]:visible').count(), 1);
  await page.locator('[data-cr-join="10A2"]').click();
  await page.locator('[data-live-connect]').filter({ hasText: 'Vào phòng học' }).click();
  await page.locator('[data-live-videos] .cr-video-tile').first().waitFor();
  const local = page.locator('.cr-video-tile[data-identity="self"]');
  await local.hover();
  const tileBounds = await local.boundingBox();
  const pinBounds = await local.locator('[data-pin-video]').boundingBox();
  assert.ok(pinBounds.x > tileBounds.x + tileBounds.width - 70 && pinBounds.y < tileBounds.y + 25, 'Pin is in the top-right corner');
  await local.locator('[data-pin-video]').click();
  assert.equal(await page.locator('.cr-video-tile:visible').count(), 1);
  assert.equal(await page.locator('.cr-video-tile.is-pinned').getAttribute('data-identity'), 'self');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.is-pinned [data-pin-video]')).opacity === '0');
  assert.equal(await page.locator('.cr-video-tile.is-pinned').count(), 1, 'Auto-hiding the control must retain pin');
  await page.locator('.is-pinned').hover();
  await page.locator('.is-pinned [data-pin-video]').click();
  assert.equal(await page.locator('.cr-video-tile:visible').count(), 2);
  const remote = page.locator('.cr-video-tile[data-identity="other"]');
  await remote.hover();
  await remote.locator('[data-pin-video]').click();
  assert.equal(await page.locator('.cr-video-tile.is-pinned').getAttribute('data-identity'), 'other');
  // Track changes must preserve focus; removing that participant must release it.
  await page.evaluate(() => window.testMeeting.emit('TrackMuted'));
  assert.equal(await page.locator('.cr-video-tile:visible').count(), 1);
  await page.evaluate(() => { window.testMeeting.remoteParticipants.clear(); window.testMeeting.emit('ParticipantDisconnected'); });
  assert.equal(await page.locator('.is-pinned').count(), 0);
  assert.equal(await page.locator('.cr-video-tile:visible').count(), 1);
  await page.evaluate(() => {
    window.testMeeting.localParticipant.trackPublications.set('screen', {
      kind: 'video', source: 'screen_share', trackSid: 'test-screen', isMuted: false,
      track: { attach: () => document.createElement('video'), detach() {}, stop() {} }
    });
    window.testMeeting.emit('LocalTrackPublished');
  });
  assert.equal(await page.locator('.cr-video-tile').count(), 2, 'Screen share keeps separate self tile');
  await page.locator('.cr-presentation-bar').waitFor({ state:'visible' });
  assert.ok((await page.locator('[data-presenter-name]').textContent()).includes('Bạn, đang trình bày'));
  const screenBounds=await page.locator('.cr-screen-tile').boundingBox();
  const cameraBounds=await page.locator('.cr-participant-rail .cr-video-tile').boundingBox();
  assert.ok(screenBounds.width>cameraBounds.width*2.5&&cameraBounds.x>=screenBounds.x+screenBounds.width,'Presentation dominates the stage with camera to its right');
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../test-results/presentation-desktop.png',import.meta.url))});
  assert.ok((await page.locator('.cr-video-tile').first().getAttribute('class')).includes('cr-screen-tile'));
  await page.locator('.cr-screen-tile').hover();
  await page.locator('.cr-screen-tile [data-pin-video]').click();
  assert.equal(await page.locator('.cr-video-tile:visible').count(), 1);
  await page.locator('.is-pinned [data-pin-video]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileScreen=await page.locator('.cr-screen-tile').boundingBox();
  const mobileCamera=await page.locator('.cr-participant-rail .cr-video-tile').boundingBox();
  assert.ok(mobileCamera.y>=mobileScreen.y+mobileScreen.height,'Mobile participant strip is below shared content');
  await page.screenshot({path:fileURLToPath(new URL('../test-results/presentation-mobile.png',import.meta.url))});
  await page.locator('.cr-video-tile[data-video-key="self:camera"]').hover();
  await page.locator('.cr-video-tile[data-video-key="self:camera"] [data-pin-video]').click();
  assert.equal(await page.locator('.cr-video-tile:visible').count(), 1);
  await page.evaluate(()=>{
    window.testMeeting.localParticipant.setScreenShareEnabled=async()=>{
      window.testMeeting.localParticipant.trackPublications.delete('screen');
      window.testMeeting.emit('LocalTrackUnpublished');
    };
  });
  await page.locator('[data-stop-presentation]').click();
  assert.equal(await page.locator('.cr-screen-tile').count(),0);
  assert.equal(await page.locator('.cr-presentation-bar').isVisible(),false);
  assert.equal(await page.locator('[data-live-videos]').evaluate(el=>el.classList.contains('has-presentation')),false);
  assert.deepEqual(errors, []);
  console.log('PASS: search, self/remote/screen pin, auto-hide, desktop/mobile presentation layout, stop presentation');
  await page.evaluate(() => window.cleanup());
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await fixture.close();
}
