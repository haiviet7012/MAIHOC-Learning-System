import test from 'node:test';
import assert from 'node:assert/strict';
import { seedQuestions, filterQuestions, createLocalRepository, validateQuestion, generateVariants, extractMatrix, buildExam, needsReview } from '../js/platform/question-bank-model.js';

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
  const repo = createLocalRepository(17, storage), q = { ...rows[0], id: 'NEW', status: 'draft' };
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
