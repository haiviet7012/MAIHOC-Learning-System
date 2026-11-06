import test from 'node:test';
import assert from 'node:assert/strict';
import { seedQuestions, filterQuestions, createLocalRepository, validateQuestion, generateVariants, extractMatrix, buildExam, needsReview, questionFingerprint, uniqueQuestions } from '../js/platform/question-bank-model.js';

const rows = seedQuestions(17);
test('all seeded questions and all generated variants have valid type-specific answer keys', () => {
  assert.equal(new Set(rows.map(q => q.type)).size, 4);
  assert.equal(new Set(rows.map(q => q.id)).size, rows.length);
  for (const q of rows) {
    validateQuestion(q);
    const variants = generateVariants(q);
    assert.equal(variants.length, 2);
    assert.notEqual(variants[0].stem, variants[1].stem);
    for (const v of variants) { validateQuestion(v); assert.equal(v.type, q.type); assert.equal(v.status, 'draft'); assert.equal(v.rate, null); assert.notEqual(v.stem, q.stem); }
  }
});
test('search ignores Vietnamese diacritics and intersects subject, grade, level and tab', () => {
  assert.equal(filterQuestions(rows, { tab: 'school', search: 'nguyen ham', subject: 'Toán', grade: '12', level: 'nb', type: 'multiple_choice' }, 17)[0].id, 'MATH12-124');
  assert.equal(filterQuestions(rows, { tab: 'school', search: 'khong ton tai' }, 17).length, 0);
  assert.equal(filterQuestions(rows, { tab: 'personal' }, 17).length, 2);
  assert.equal(filterQuestions(rows, { tab: 'pending' }, 17).length, 8);
  assert.equal(filterQuestions(rows, { tab: 'pro' }, 17).length, 2);
  assert.equal(rows.filter(q => q.status === 'approved' && needsReview(q)).length, 1);
});
test('matrix rejects missing inventory, negative/fractional counts, zero and incompatible topics', () => {
  const spec = { subject: 'Toán', grade: '12', topic: '', counts: { nb: 1, th: 1, vd: 0, vdc: 1 } };
  const picked = extractMatrix(rows, spec);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked.map(q => q.id)).size, 3);
  assert.ok(picked.every(q => q.status === 'approved' && q.subject === 'Toán' && q.grade === '12'));
  assert.throws(() => extractMatrix(rows, { ...spec, counts: { ...spec.counts, nb: 2 } }), /hiện có 1/);
  for (const bad of [-1, .5, NaN, 101]) assert.throws(() => extractMatrix(rows, { ...spec, counts: { ...spec.counts, nb: bad } }), /số nguyên/);
  assert.throws(() => extractMatrix(rows, { ...spec, topic: 'Chuyên đề không có' }), /hiện có 0/);
  assert.throws(() => extractMatrix(rows, { ...spec, counts: { nb: 0, th: 0, vd: 0, vdc: 0 } }), /ít nhất/);
});
test('each shuffled exam keeps answer content, source integrity and exactly ten total points', () => {
  const originals = rows.filter(q => q.status === 'approved' && q.subject === 'Toán' && q.grade === '12');
  const snapshot = JSON.stringify(originals);
  const exam = buildExam(originals, { codes: 20 });
  assert.equal(exam.variants.length, 20);
  for (const variant of exam.variants) {
    assert.equal(new Set(variant.questions.map(q => q.id)).size, originals.length);
    assert.equal(variant.questions.reduce((s, q) => s + Math.round(q.points * 100), 0), 1000);
    for (const q of variant.questions) {
      const original = originals.find(x => x.id === q.id);
      if (q.type === 'multiple_choice') assert.equal(q.choices[q.answer], original.choices[original.answer]);
      else assert.deepEqual(q.answer, original.answer);
    }
  }
  assert.equal(JSON.stringify(originals), snapshot);
  assert.throws(() => buildExam([]), /trống/);
  assert.throws(() => buildExam([rows[0], rows[2]]), /cùng môn/);
  assert.throws(() => buildExam([rows.at(-1)]), /đã được duyệt/);
  assert.throws(() => buildExam(originals, { codes: 21 }), /1 đến 20/);
});
test('repository persists per account, returns detached copies and survives blocked/corrupt storage', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const repo = createLocalRepository(17, storage), q = { ...rows[0], id: 'NEW', stem: 'Câu hỏi mới để kiểm tra lưu trữ', status: 'draft' };
  assert.equal(repo.save(q), true);
  assert.equal(repo.approve('NEW'), true);
  assert.equal(createLocalRepository(17, storage).list().find(q => q.id === 'NEW').status, 'approved');
  assert.ok(!createLocalRepository(18, storage).list().some(q => q.id === 'NEW'));
  const copy = repo.list(); copy[0].stem = 'MUTATED'; assert.notEqual(repo.list()[0].stem, 'MUTATED');
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const volatile = createLocalRepository(17, blocked);
  assert.equal(volatile.save(q), false);
  assert.ok(volatile.list().some(x => x.id === 'NEW'));
  assert.equal(createLocalRepository(17, { getItem: () => '[{"invalid":true}]' }).list().length, rows.length);
});

test('content identity ignores ids, answer order, metadata and Unicode/whitespace differences', () => {
  const q = rows[1];
  const duplicate = { ...q, id: 'OTHER', stem: `  ${q.stem.normalize('NFD')}  `, choices: [...q.choices].reverse(), answer: 3, level: 'vdc' };
  assert.equal(questionFingerprint(q), questionFingerprint(duplicate));
  assert.equal(uniqueQuestions([q, duplicate]).length, 1);
  for (const changed of [{ stem: q.stem + ' khác' }, { grade: '11' }, { choices: ['a','b','c','d'] }, { stem: q.stem.replace('2x', '3x') }]) {
    assert.notEqual(questionFingerprint(q), questionFingerprint({ ...q, ...changed }));
  }
  assert.notEqual(questionFingerprint({ ...q, stem: '$x$' }), questionFingerprint({ ...q, stem: '$X$' }));
  assert.equal(filterQuestions([q, duplicate], { tab: 'school' }, 17).length, 1);
});
test('matrix and shuffled exams use unique content even under different ids and levels', () => {
  const q = rows[1], duplicate = { ...q, id: 'DUPLICATE', level: 'vd' };
  assert.throws(() => extractMatrix([q, duplicate], { subject: q.subject, grade: q.grade, counts: { nb: 1, th: 0, vd: 1, vdc: 0 } }), /hiện có 0/);
  const exam = buildExam([q, duplicate]);
  assert.ok(exam.variants.every(v => v.questions.length === 1 && v.questions[0].points === 10));
  const generated = generateVariants(q);
  assert.equal(generateVariants(q, generated).length, 0);
});
test('repository rejects duplicate inserts/edits and removal survives reload without changing an exported exam', () => {
  const data = new Map(), storage = { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v) };
  const repo = createLocalRepository(17, storage), q = rows[1];
  assert.throws(() => repo.save({ ...q, id: 'DUPLICATE' }), /đã có/);
  assert.throws(() => repo.save({ ...q, id: rows[2].id }), /đã có/);
  const exam = buildExam([q]);
  assert.equal(repo.remove(q.id), true);
  assert.ok(!createLocalRepository(17, storage).list().some(x => x.id === q.id));
  assert.equal(exam.variants[0].questions[0].id, q.id);
  assert.throws(() => repo.remove('missing'), /Không tìm thấy/);
});
