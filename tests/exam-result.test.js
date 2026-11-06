import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExamResult } from '../js/platform/exam-result-view.js';
import { parseRoute, routeUrl } from '../js/platform/router.js';

test('Result adapter preserves bank results and normalizes legacy scores, selections and true/false reviews', () => {
  const bank = { nationalExam: true, score: 8.25, questions: [], sections: [], levels: [] };
  assert.equal(normalizeExamResult(bank), bank);
  const normalized = normalizeExamResult({ graded: true, score: 75, scale: 100, results: [
    { question: 'I-1', type: 'multiple_choice', userAnswer: 'B', expectedAnswer: ['A'], correct: false, totalPoints: 2 },
    { question: 'II-1', type: 'true_false', correct: false, earnedPoints: 1, totalPoints: 4,
      statements: [{ statement: 'a', userAnswer: 'false', expectedAnswer: ['true'] }, { statement: 'b', userAnswer: 'false', expectedAnswer: ['false'] }] },
    { question: 'III-1', type: 'essay', userAnswer: '', expectedAnswer: ['2'], correct: false, totalPoints: 4 },
  ] });
  assert.equal(normalized.score, 7.5); assert.equal(normalized.scale, 10);
  assert.equal(normalizeExamResult(normalized).score, 7.5);
  assert.equal(normalized.blankCount, 1); assert.equal(normalized.incorrectCount, 2);
  assert.equal(normalized.answers['I-1'], 'B'); assert.equal(normalized.answers['II-1a'], 'false');
  assert.deepEqual(normalized.questions[1].correctAnswer, { a: true, b: false });
  const state = { route: 'exam-result-view', resultId: '456' };
  assert.deepEqual(parseRoute(new URL(routeUrl(state), 'https://maihoc.test')), state);
});
