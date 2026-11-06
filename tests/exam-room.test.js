import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerKey, draftKey, numericAnswer, questionAnswered, questionGroups, readRoomDraft, roomQuestions, secondsRemaining } from '../js/platform/exam-room-model.js';
import { parseQuestionText } from '../js/question-parser.js';
import { parseRoute, routeUrl } from '../js/platform/router.js';

const content = String.raw`Phần I. Trắc nghiệm nhiều lựa chọn.
Câu 1: Tính \(1+1\). A. 1 B. 2 C. 3 D. 4
Câu 2: Tính 2+2. A. 1 B. 2 C. 4 D. 5
Phần II. Trắc nghiệm đúng sai.
Câu 1: Cho số x=2. a) x>0 b) x<0 c) x=2 d) x=3
Phần III. Trắc nghiệm trả lời ngắn.
Câu 1: Tính -5/4.`;
const config = JSON.parse(await readFile(new URL('../configs/exam-layouts.json', import.meta.url), 'utf8'));
const questions = roomQuestions({ content, subject: 'Toán' }, config.subjects['Toán'].assessment);

test('THPT room keeps option/statement text, section IDs, math and all three answer types', () => {
  assert.equal(questions.length, 4);
  assert.deepEqual(questions.map(answerKey), ['I-1', 'I-2', 'II-1', 'III-1']);
  assert.equal(questions[0].options[1].text, '2');
  assert.match(questions[0].text, /\\\(1\+1\\\)/);
  assert.deepEqual(questions[2].statements.map(statement => statement.text), ['x>0', 'x<0', 'x=2', 'x=3']);
  assert.ok(!questions[1].options[3].text.includes('Phần II'));
  assert.equal(questions[3].isNumeric, true);
  assert.equal(questionGroups(questions).length, 3);
  assert.equal(parseQuestionText(content)[0].options[0].text, '1');
  const full = roomQuestions({}, config.subjects['Toán'].assessment);
  assert.equal(full.length, 22);
});

test('Palette counts complete questions, including four true/false items and decimal zero', () => {
  assert.equal(questionAnswered(questions[0], { 'I-1': 'B' }), true);
  assert.equal(questionAnswered(questions[0], { 'I-1': 'Z' }), false);
  assert.equal(questionAnswered(questions[2], { 'II-1a': 'true' }), false);
  assert.equal(questionAnswered(questions[2], { 'II-1a': 'true', 'II-1b': 'false', 'II-1c': 'true', 'II-1d': 'false' }), true);
  for (const value of ['0', '-1,25', '0.5', '+2', '.75']) assert.equal(questionAnswered(questions[3], { 'III-1': value }), true, value);
  for (const value of ['', '-', '1/2', 'abc', '1,2.3']) assert.equal(numericAnswer(value), false, value);
});

test('Deadline remains absolute across reload/suspended tabs and drafts are scoped to account/exam', () => {
  assert.equal(secondsRemaining(120000, 1000), 119);
  assert.equal(secondsRemaining(120000, 119001), 1);
  assert.equal(secondsRemaining(120000, 500000), 0);
  assert.notEqual(draftKey(1, 'M101'), draftKey(2, 'M101'));
  assert.notEqual(draftKey(1, 'M101'), draftKey(1, 'M102'));
  const data = { deadline: 500000, answers: { 'I-1': 'B', malicious: {} }, flags: ['I-1', 7], mode: 'single', activeId: 'II-1' };
  const draft = readRoomDraft({ getItem: () => JSON.stringify(data) }, 'test');
  assert.deepEqual(draft, { deadline: 500000, answers: { 'I-1': 'B' }, flags: ['I-1'], mode: 'single', activeId: 'II-1' });
  assert.equal(readRoomDraft({ getItem: () => 'invalid' }, 'test'), null);
  assert.equal(readRoomDraft({ getItem: () => '{"deadline":1,"answers":[]}' }, 'test'), null);
});

test('Dedicated exam room route round trips encoded exam IDs', () => {
  const state = { route: 'exam-room-view', examDocId: 'M 101', examOrigin: 'national-exam-hub' };
  const url = routeUrl(state);
  assert.equal(url, '/learning/national-exams/M%20101/room');
  assert.deepEqual(parseRoute(new URL(url, 'https://maihoc.test')), state);
});
