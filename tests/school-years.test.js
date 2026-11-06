import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolYearOptions, schoolYearPayload } from '../js/platform/school-years.js';
import { subjects, createTimetableWorkbook, parseTimetableWorkbook } from '../js/platform/timetable-xlsx.js';
import { TIMETABLE_SUBJECTS, validateTimetable } from '../server/learning.js';
import ExcelJS from 'exceljs';
test('Four rolling school years use Vietnam calendar year',()=>{
 assert.deepEqual(schoolYearOptions(new Date('2026-06-01')).map(y=>y.code),['2025 - 2026','2026 - 2027','2027 - 2028','2028 - 2029']);
 assert.deepEqual(schoolYearOptions(new Date('2026-12-31T17:00:00Z')).map(y=>y.start),[2026,2027,2028,2029]);
});
test('GDQP-AN and GDDP remain valid through timetable Excel round trip',()=>{
 for(const subject of ['GDQP-AN','GDDP']){assert.ok(subjects.includes(subject));assert.ok(TIMETABLE_SUBJECTS.includes(subject));}
 const cells={'0-0':'GDQP-AN','1-1':'GDDP'};
 const parsed=parseTimetableWorkbook(createTimetableWorkbook(ExcelJS,cells));
 assert.deepEqual(parsed.cells,cells);
 assert.deepEqual(validateTimetable({layoutVersion:2,version:0,cells}).cells,cells);
});

test('Selected school year explicitly includes valid default dates for older backends',()=>{
 const expected={code:'2026 - 2027',startDate:'2026-09-05',endDate:'2027-06-30'};
 assert.deepEqual(schoolYearPayload('2026 - 2027'),expected);
 assert.deepEqual(schoolYearPayload('2026-2027'),expected);
 for(const year of schoolYearOptions(new Date('2026-01-01'))){const p=schoolYearPayload(year.code);assert.ok(new Date(p.endDate)>new Date(p.startDate));}
 for(const value of ['2026 - 2028','2026','',null])assert.throws(()=>schoolYearPayload(value));
});
