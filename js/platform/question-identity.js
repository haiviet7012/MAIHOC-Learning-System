// Keep case, accents, numbers and operators: they may change a mathematical answer.
const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();

export function questionFingerprint(question) {
  let choices = question.choices || [];
  if (typeof choices === 'string') choices = JSON.parse(choices);
  return JSON.stringify([
    normalize(question.subject), String(question.grade), question.type,
    normalize(question.stem), choices.map(normalize).sort(),
  ]);
}

// Input order determines the retained representative. Filter permissions/status first.
export function uniqueQuestions(questions, existing = []) {
  const seen = new Set(existing.map(questionFingerprint));
  return questions.filter(question => {
    const key = questionFingerprint(question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
