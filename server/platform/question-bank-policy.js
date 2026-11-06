import { questionFingerprint } from '../../js/platform/question-identity.js';
import { fail } from './policy.js';

// Serialize bank mutations per school, including digitized imports.
export async function lockQuestionBank(db, schoolId) {
  await db.query('SELECT id FROM schools WHERE id=$1 FOR UPDATE', [schoolId]);
}

export async function findDuplicateQuestion(db, schoolId, question, excludedItemId = null) {
  const { rows } = await db.query(
    `SELECT * FROM question_versions WHERE school_id=$1 AND subject=$2 AND grade=$3 AND status<>'archived'`,
    [schoolId, question.subject, question.grade],
  );
  const key = questionFingerprint(question);
  return rows.find(row => String(row.question_item_id) !== String(excludedItemId) && questionFingerprint(row) === key);
}

export async function assertQuestionIsNew(db, schoolId, question, excludedItemId) {
  if (await findDuplicateQuestion(db, schoolId, question, excludedItemId)) {
    fail('Câu hỏi đã có trong ngân hàng (trùng nội dung và phương án).', 409);
  }
}
