import { formatDateTimeVN } from '../server/tests-module/results-db.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseVietnamSchedule, parseUtcTimestamp, vietnamScheduleIso, vietnamDateTimeInput, formatVietnamDateTime } from '../js/platform/vietnam-time.js';
import { deadlineFor, scheduleDate } from '../server/platform/policy.js';
import { assertLegacyTestAccess } from '../server/platform/legacy.js';
import { schoolMailDate } from '../server/school-notifications.js';

test('08:00 Vietnam is 01:00 UTC; explicit offsets, midnight and invalid input remain unambiguous', () => {
  for (const value of ['2026-11-07T08:00','2026-11-07T08:00:00+07:00','2026-11-07T01:00:00Z','2026-11-07 01:00:00.000000+00']) assert.equal(vietnamScheduleIso(value),'2026-11-07T01:00:00.000Z');
  assert.equal(vietnamScheduleIso('2026-11-07'), '2026-11-06T17:00:00.000Z');
  assert.equal(parseUtcTimestamp('2026-11-07').toISOString(), '2026-11-07T00:00:00.000Z');
  assert.equal(vietnamScheduleIso('2026-11-07T00:30'),'2026-11-06T17:30:00.000Z');
  assert.equal(vietnamDateTimeInput('2026-11-06T17:30:00Z'),'2026-11-07T00:30');
  assert.equal(parseUtcTimestamp('2026-11-07 01:00:00').toISOString(),'2026-11-07T01:00:00.000Z');
  for (const input of ['',null,'not-a-date','2026-02-30T08:00','2026-11-07T24:00']) assert.equal(vietnamScheduleIso(input),null);
  assert.equal(parseVietnamSchedule('2028-02-29T08:00').toISOString(),'2028-02-29T01:00:00.000Z');
  assert.throws(() => scheduleDate('bad','Mở bài'),/Mở bài không hợp lệ/);
  assert.match(formatVietnamDateTime('2026-11-07T08:00',{schedule:true}),/08:00/);
  assert.equal(formatDateTimeVN('2026-11-07T23:30:00', true), '07/11/26');
  assert.equal(formatDateTimeVN('2026-11-07T23:30:00'), '08/11/26');
  assert.match(schoolMailDate('2026-11-07T08:00'),/08:00/);
  assert.equal(deadlineFor('2026-11-07T01:50Z','2026-11-07T09:00',45).toISOString(),'2026-11-07T02:00:00.000Z');
});

test('server and browser helpers produce identical schedule times in UTC, Vietnam and New York', () => {
  const code = `import {vietnamScheduleIso,vietnamDateTimeInput,formatVietnamDateTime} from './js/platform/vietnam-time.js'; console.log(JSON.stringify([vietnamScheduleIso('2026-11-07T08:00'),vietnamDateTimeInput('2026-11-07T01:00Z'),formatVietnamDateTime('2026-11-07T01:00Z')]));`;
  const outputs = ['UTC','Asia/Ho_Chi_Minh','America/New_York'].map(TZ => execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env:{...process.env,TZ},encoding:'utf8'}).trim());
  assert.ok(outputs.every(output => output===outputs[0]));
});

test('legacy schedules open and close at Vietnam time, including old rows without an offset', async t => {
  const user={id:2,role:'user'}, legacy={created_by:1,class_code:'',open_at:'2026-11-07T08:00',close_at:'2026-11-07T09:00'};
  const now=t.mock.method(Date,'now',()=>Date.parse('2026-11-07T00:59:59Z'));
  await assert.rejects(()=>assertLegacyTestAccess(null,user,legacy),/chưa mở/);
  now.mock.mockImplementation(()=>Date.parse('2026-11-07T01:00:00Z'));
  await assertLegacyTestAccess(null,user,legacy);
  now.mock.mockImplementation(()=>Date.parse('2026-11-07T02:00:01Z'));
  await assert.rejects(()=>assertLegacyTestAccess(null,user,legacy),/đã đóng/);
});
