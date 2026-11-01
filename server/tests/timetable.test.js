import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimetable, validateTimetable } from '../learning.js';
test('nine periods accept the full week and reject invalid coordinates or stale layouts', () => {
  const cells = Object.fromEntries(Array.from({ length: 63 }, (_, i) => [`${Math.floor(i / 7)}-${i % 7}`, 'Toán']));
  assert.equal(Object.keys(validateTimetable({ cells, version: 1, layoutVersion: 2 }).cells).length, 63);
  for (const key of ['9-0', '0-7', '-1-0']) assert.throws(() => validateTimetable({ cells: { [key]: 'Toán' }, version: 1, layoutVersion: 2 }));
  assert.throws(() => validateTimetable({ cells: {}, version: 1 }), /tải lại/);
});
test('legacy schedule keeps its original evening slots and does not mutate persisted data', () => {
  const original = { cells: { '0-0': 'Toán', '1-0': 'Ngữ văn', '2-0': 'Hóa học', '3-0': 'Tiếng Anh' }, version: 4, layout_version: 1 };
  const result = normalizeTimetable(original);
  assert.deepEqual(result.cells, { '0-0': 'Toán', '1-0': 'Ngữ văn', '5-0': 'Hóa học' });
  assert.equal(result.legacyCells['3-0'], 'Tiếng Anh');
  assert.equal(original.cells['2-0'], 'Hóa học');
  assert.equal(result.version, 4);
  assert.equal(normalizeTimetable(null), null);
  assert.equal(normalizeTimetable({ cells: { '8-6': 'Toán' }, layout_version: 2 }).cells['8-6'], 'Toán');
});
