import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { subjects, parseTimetableWorkbook, createTimetableWorkbook } from '../js/platform/timetable-xlsx.js';
import { validateTimetable } from '../server/learning.js';
import { parseRoute, routeUrl } from '../js/platform/router.js';

test('styled XLSX round trip preserves all 63 periods and backend compatibility', async () => {
  const cells = Object.fromEntries(Array.from({ length: 63 }, (_, i) => [`${Math.floor(i / 7)}-${i % 7}`, subjects[i % subjects.length]]));
  const wb = createTimetableWorkbook(ExcelJS, cells, new Date('2026-11-01T18:05:06Z'));
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(await wb.xlsx.writeBuffer());
  const result = parseTimetableWorkbook(loaded);
  assert.deepEqual(result.cells, cells);
  assert.deepEqual(validateTimetable({ cells: result.cells, version: 1, layoutVersion: 2 }).cells, cells);
  const sheet = loaded.getWorksheet('Thời khóa biểu');
  assert.match(sheet.getCell('A2').value, /02\/11\/2026/);
  assert.match(sheet.getCell('A2').value, /01:05:06/);
  assert.equal(sheet.getCell('C6').fill.fgColor.argb, 'FFF8DCD6');
  assert.equal(sheet.getCell('I14').value, cells['8-6']);
  assert.equal(sheet.getCell('A11').value, 'Chiều');
  assert.equal(loaded.getWorksheet('Chi tiết').rowCount, 64);
  assert.equal(sheet.views[0].ySplit, 5);
});
test('empty grid is a reusable blank template', async () => {
  const wb = createTimetableWorkbook(ExcelJS, {});
  assert.deepEqual(parseTimetableWorkbook(wb).cells, {});
});
function list(rows) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Lịch');
  ws.addRow(['Thứ', 'Buổi', 'Tiết', 'Môn học']); rows.forEach(row => ws.addRow(row)); return wb;
}
test('list format normalizes aliases, unaccented labels, Excel dates and afternoon periods', () => {
  const wb = list([['Thu 2', 'sang', 5, 'toan'], ['CN', 'chieu', 'Tiet 4', 'Anh'], [new Date('2026-11-03T00:00:00Z'), 'Sáng', 1, 'Vật lý']]);
  assert.deepEqual(parseTimetableWorkbook(wb).cells, { '4-0': 'Toán', '8-6': 'Tiếng Anh', '0-1': 'Vật lý' });
});
test('invalid subjects, periods, days, duplicates, formulas and unsupported layouts fail atomically', () => {
  for (const rows of [
    [['Thứ 2', 'Sáng', 1, 'Toán'], ['Thứ 3', 'Sáng', 1, 'Môn lạ']],
    [['Thứ 2', 'Chiều', 5, 'Toán']], [['Thứ 8', 'Sáng', 1, 'Toán']],
    [['Thứ 2', 'Sáng', 1, 'Toán'], ['Thứ 2', 'Sáng', 1, 'Toán']],
    [['Thứ 2', 'Sáng', 1, { formula: '1+1', result: 2 }]],
  ]) assert.throws(() => parseTimetableWorkbook(list(rows)));
  const wb = new ExcelJS.Workbook(); wb.addWorksheet('Không phải lịch').addRow(['Tên', 'Điểm']);
  assert.throws(() => parseTimetableWorkbook(wb), /Không tìm thấy/);
});
test('grid supports merged sessions, numeric weekday headers and sparse periods', () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Lịch');
  ws.addRows([['Buổi', 'Tiết', 'Thứ 2', 'Thứ 3', 'CN'], ['Sáng', 1, 'Toán', '', 'Anh'], ['', 2, 'Văn'], ['Chiều', 4, '', 'Tin']]);
  ws.mergeCells('A2:A3');
  assert.deepEqual(parseTimetableWorkbook(wb).cells, { '0-0': 'Toán', '0-6': 'Tiếng Anh', '1-0': 'Ngữ văn', '8-1': 'Tin học' });
  ws.getCell('D1').value = 'Thứ 2';
  assert.throws(() => parseTimetableWorkbook(wb), /trùng/);
});
test('School timetable URL keeps compatibility with old Learning links', () => {
  assert.equal(routeUrl({ route: 'timetable' }), '/school/timetable');
  for (const path of ['/learning/timetable', '/school/timetable']) assert.equal(parseRoute(new URL(path, 'https://maihoc.test')).route, 'timetable');
});
