import test from 'node:test';
import assert from 'node:assert/strict';
import { subjects, createTimetableWorkbook, parseTimetableWorkbook } from '../js/platform/timetable-xlsx.js';
import { TIMETABLE_SUBJECTS, validateTimetable } from '../server/learning.js';
import ExcelJS from 'exceljs';
test('GDQP-AN and GDDP remain valid through timetable Excel round trip',()=>{
 for(const subject of ['GDQP-AN','GDDP']){assert.ok(subjects.includes(subject));assert.ok(TIMETABLE_SUBJECTS.includes(subject));}
 const cells={'0-0':'GDQP-AN','1-1':'GDDP'};
 const parsed=parseTimetableWorkbook(createTimetableWorkbook(ExcelJS,cells));
 assert.deepEqual(parsed.cells,cells);
 assert.deepEqual(validateTimetable({layoutVersion:2,version:0,cells}).cells,cells);
});
