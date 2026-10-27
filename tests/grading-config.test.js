import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gradeAnswers } from "../server/grading/engine.js";

const config = JSON.parse(readFileSync(new URL("../configs/exam-layouts.json", import.meta.url), "utf8"));
const subject = config.subjects.Toán;
const layout = subject.assessment;
const grading = subject.grading;

function perfectAnswerKey() {
  const answers = {};
  for (let number = 1; number <= 12; number++) answers[`I-${number}`] = "A";
  for (let number = 1; number <= 4; number++) {
    for (const statement of ["a", "b", "c", "d"]) answers[`II-${number}${statement}`] = "true";
  }
  for (let number = 1; number <= 6; number++) answers[`III-${number}`] = "42";
  return { answers, points: {} };
}

function perfectSubmission() {
  return perfectAnswerKey().answers;
}

test("Toán scoring follows config weights and totals exactly 10 points", () => {
  const result = gradeAnswers(perfectAnswerKey(), perfectSubmission(), { layout, grading });
  assert.equal(result.completeAnswerKey, true);
  assert.equal(result.scale, 10);
  assert.equal(result.totalPoints, 10);
  assert.equal(result.earnedPoints, 10);
  assert.equal(result.score, 10);
  assert.equal(result.percent, 100);
  assert.equal(result.questionCount, 22);
  assert.equal(result.correctCount, 22);
  assert.equal(result.results[0].totalPoints, 0.25);
  assert.equal(result.results[12].totalPoints, 1);
  assert.equal(result.results[16].totalPoints, 0.5);
});

test("True/false section uses partial-credit weights from config", () => {
  const key = perfectAnswerKey();
  const submitted = perfectSubmission();
  submitted["II-1a"] = "true";
  submitted["II-1b"] = "false";
  submitted["II-1c"] = "true";
  submitted["II-1d"] = "false";
  const result = gradeAnswers(key, submitted, { layout, grading });
  const trueFalse = result.results.find(row => row.question === "II-1");
  assert.equal(trueFalse.correctStatements, 2);
  assert.equal(trueFalse.earnedPoints, 0.25);
  assert.equal(trueFalse.totalPoints, 1);
  assert.equal(result.earnedPoints, 9.25);
});

test("Sequential answer-key IDs can be matched without crossing section boundaries", () => {
  const answers = {};
  for (let number = 1; number <= 12; number++) answers[String(number)] = "A";
  for (let number = 1; number <= 4; number++) {
    const sequential = 12 + number;
    for (const statement of ["a", "b", "c", "d"]) answers[`${sequential}${statement}`] = "true";
  }
  for (let number = 1; number <= 6; number++) answers[String(16 + number)] = "42";
  const result = gradeAnswers({ answers }, perfectSubmission(), { layout, grading });
  assert.equal(result.completeAnswerKey, true);
  assert.equal(result.score, 10);
});
