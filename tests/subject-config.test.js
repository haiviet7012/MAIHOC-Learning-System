import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const catalog = JSON.parse(readFileSync(new URL("../configs/subjects.json", import.meta.url), "utf8"));
const assessments = JSON.parse(readFileSync(new URL("../configs/exam-layouts.json", import.meta.url), "utf8"));
test("enabled subjects have an explicit assessment profile", () => {
  for (const subject of catalog.subjects.filter(item => item.enabled && item.assessmentProfile)) {
    assert.ok(assessments.subjects[subject.assessmentProfile], `Missing grading config for ${subject.name}`);
    assert.ok(assessments.subjects[subject.assessmentProfile].grading, `Missing grading rules for ${subject.name}`);
  }
});
test("Literature and IELTS remain registered but disabled until criteria are configured", () => {
  for (const name of ["Ngữ văn", "IELTS"]) {
    const subject = catalog.subjects.find(item => item.name === name);
    assert.ok(subject, `Missing subject registry entry: ${name}`);
    assert.equal(subject.enabled, false);
    assert.equal(assessments.subjects[subject.assessmentProfile], undefined);
  }
});
test("assessment profiles are never silently borrowed from Mathematics", () => {
  assert.equal(assessments.subjects["Đề thi THPT quốc gia"], undefined);
});
