import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
delete process.env.DATABASE_URL;
delete process.env.MAIHOC_TEST_DATABASE_URL;
process.env.MAIHOC_SKIP_AUTO_LISTEN = '1';
process.env.MAIHOC_AI_WORKER_ENABLED = '0';
process.env.NODE_ENV = 'test';
for (const key of ['R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']) process.env[key]='local-preview';
const { testDatabase } = await import('../server/platform/test-db.js');
const { setTestPool } = await import('../server/postgres.js');
const fixture = await testDatabase({ memoryOnly: true });
setTestPool(fixture.pool);
const { hashPassword } = await import('../server/auth.js');
const { server, initializeApplicationRuntime, stopPresenceCleanup } = await import('../server/server.js');
let browser;
try {
  await initializeApplicationRuntime();
  const password = randomUUID();
  await fixture.db.query("INSERT INTO users(id,name,email,password_hash,role,account_type) VALUES(700,'Kiểm thử','recent@maihoc.test',$1,'user','external')", [await hashPassword(password)]);
  const now = Date.now();
  const stamp = ms => new Date(ms).toISOString().slice(0,19).replace('T',' ');
  for (let i = 0; i < 9; i++) await fixture.db.query("INSERT INTO notifications(user_id,type,title,message,created_at) VALUES(700,'learning',$1,'Nội dung',$2)", ['Đã hoàn thành Chuyên đề xác suất có điều kiện, công thức xác suất toàn phần và công thức Bayes '+i, stamp(now-i*10000)]);
  await fixture.db.query("INSERT INTO notifications(user_id,type,title,message,created_at) VALUES(700,'learning','Hết hạn','Cũ',$1)", [stamp(now-86400000)]);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args:['--no-sandbox'] });
  const page = await browser.newPage({ viewport:{width:1440,height:1050} });
  assert.equal((await page.request.get(origin+'/api/learning/recent-activity')).status(),401);
  await page.goto(origin+'/learning');
  await page.locator('#login-open').click();
  await page.locator('#login-form [name=email]').fill('recent@maihoc.test');
  await page.locator('#login-form [name=password]').fill(password);
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('[data-portal-activity] article').first().waitFor();
  const data = await (await page.request.get(origin+'/api/learning/recent-activity')).json();
  assert.equal(data.items.length,9);
  assert.ok(!data.items.some(n=>n.title==='Hết hạn'));
  await mkdir('test-results/recent-activity', { recursive: true });
  for (const width of [360,390,768,820,1024,1440]) {
    await page.setViewportSize({width,height:width < 700 ? 844 : 1024});
    await page.waitForTimeout(100);
    const sizes = await page.locator('[data-portal-activity]').evaluate(el=>{
      const rows=[...el.querySelectorAll('article')];
      return {height:el.clientHeight, firstFive:rows[4].offsetTop+rows[4].offsetHeight-rows[0].offsetTop, scroll:el.scrollHeight};
    });
    assert.ok(Math.abs(sizes.height-sizes.firstFive)<=1,JSON.stringify(sizes));
    assert.ok(sizes.scroll>sizes.height);
    const overflow = await page.locator('.topbar, .portal-panel, .portal-welcome, .portal-stats').evaluateAll(nodes => nodes.filter(n => {
      const r = n.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
    }).map(n => n.className));
    assert.deepEqual(overflow, [], `Overflow at ${width}: ${overflow}`);
    for (const dark of [false,true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await page.waitForTimeout(250);
      await page.screenshot({path:`test-results/recent-activity/home-${width}-${dark ? 'dark' : 'light'}.png`,fullPage:true});
    }
    for(const mode of ['reader-open','exam-open','practice-open']) {
      const rect = await page.evaluate(mode=>{
        document.body.classList.add(mode);
        const r=document.querySelector('.app-shell > .topbar').getBoundingClientRect();
        document.body.classList.remove(mode);
        const overflow = [...document.querySelectorAll('.topbar button, .education-top-title, #user-greeting')].filter(n=> {
          if(!n.getClientRects().length) return false;
          const rect=n.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth+1;
        }).map(n=>n.id || n.className);
        return {left:r.left,width:r.width,viewport:innerWidth,overflow};
      },mode);
      assert.deepEqual(rect.overflow,[],`Topbar overflow ${mode} ${width}: ${rect.overflow}`);
      assert.equal(rect.left,0);
      assert.equal(rect.width,rect.viewport);
    }
  }
  // Verify expiry while the page remains open, without reloading.
  await page.route('**/api/learning/recent-activity',route=>route.fulfill({json:{serverTime:Date.now(),items:[{title:'Sắp hết hạn',expiresAt:Date.now()+1500}]}}));
  await page.reload();
  await page.getByText('Sắp hết hạn',{exact:true}).waitFor();
  await page.getByText('Chưa có hoạt động trong 24 giờ qua.',{exact:true}).waitFor();
  assert.equal((await fixture.db.query('SELECT count(*) AS n FROM notifications WHERE user_id=700')).rows[0].n,10);
  console.log('PASS: auth, 24h cutoff, all recent rows, five-row scroll 360/390/768/820/1024/1440px light/dark, full-width reader/exam topbar, live expiry, retained learning history');
} finally {
  await browser?.close();
  stopPresenceCleanup();
  if(server.listening) await new Promise(r=>server.close(r));
  await fixture.close();
}
