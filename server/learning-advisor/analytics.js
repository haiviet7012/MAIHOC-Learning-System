// Metrics come only from server records; the language model never supplies chart values.
export function vnDay(value) {
  if (!value) return null;
  const raw = String(value);
  const date =
    value instanceof Date
      ? value
      : new Date(
          /[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : raw.replace(" ", "T") + "Z",
        );
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
    : null;
}
export function summarize(records, events = []) {
  const days = new Map(),
    subjects = new Map(),
    daySubjects = new Map();
  for (const r of records) {
    const day = vnDay(r.at),
      score = r.score == null ? NaN : Number(r.score),
      scale = Number(r.scale);
    if (
      !day ||
      !Number.isFinite(score) ||
      !(scale > 0) ||
      score < 0 ||
      score > scale
    )
      continue;
    const percent = (score / scale) * 100;
    if (!daySubjects.has(day)) daySubjects.set(day, new Map());
    for (const [map, key] of [
      [days, day],
      [subjects, r.subject],
      [daySubjects.get(day), r.subject],
    ]) {
      const v = map.get(key) || { sum: 0, count: 0 };
      v.sum += percent;
      v.count++;
      map.set(key, v);
    }
  }
  const activity = new Map();
  for (const event of events) {
    const day = vnDay(event.occurred_at);
    if (day) activity.set(day, (activity.get(day) || 0) + 1);
  }
  const round = (n) => Math.round(n * 10) / 10;
  return {
    daily: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        percent: round(v.sum / v.count),
        count: v.count,
      })),
    radar: [...subjects]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, v]) => ({
        subject,
        percent: round(v.sum / v.count),
        count: v.count,
      })),
    radarDaily: [...daySubjects]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        subjects: [...values]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([subject, v]) => ({
            subject,
            percent: round(v.sum / v.count),
            count: v.count,
          })),
      })),
    activity: [...activity]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    observations: [...subjects.values()].reduce((n, v) => n + v.count, 0),
  };
}
export async function snapshot(db, userId, scope, schoolId, days) {
  let records,
    progress = [],
    events = [],
    topics = [];
  if (scope === "learning") {
    records = (
      await db.query(
        `SELECT subject,score,scale,created_at AS at FROM exam_attempts WHERE user_id=$1 AND graded=1 AND category IN ('exam','practice') AND created_at::timestamp >= now()-$2*interval '1 day' ORDER BY created_at DESC LIMIT 2000`,
        [userId, days],
      )
    ).rows;
    progress = (
      await db.query(
        `SELECT item_type,item_id,item_title,subject,progress_percent,status FROM user_progress WHERE user_id=$1 AND item_type IN ('lesson','document','exam','practice') ORDER BY updated_at DESC LIMIT 200`,
        [userId],
      )
    ).rows;
    events = (
      await db.query(
        `SELECT occurred_at FROM learning_activity_events WHERE user_id=$1 AND occurred_at >= now()-$2*interval '1 day' ORDER BY occurred_at DESC LIMIT 5000`,
        [userId, days],
      )
    ).rows;
  } else {
    records = (
      await db.query(
        `SELECT s.subject,r.score,r.scale,a.submitted_at AS at FROM assessment_attempts a JOIN assessment_results r ON r.attempt_id=a.id JOIN assessments s ON s.id=a.assessment_id WHERE a.student_id=$1 AND a.school_id=$2 AND a.status='graded' AND a.submitted_at >= now()-$3*interval '1 day' ORDER BY a.submitted_at DESC LIMIT 2000`,
        [userId, schoolId, days],
      )
    ).rows;
    progress = (await db.query(`SELECT item_type,item_id,item_title,subject,progress_percent,status FROM user_progress
      WHERE user_id=$1 AND item_type IN ('lesson','document','exam','practice') ORDER BY updated_at DESC LIMIT 200`, [userId])).rows;
    // Legacy rows belong to School only through an explicit class mapping.
    const legacy = (
      await db.query(
        `SELECT s.subject,s.score,s.scale,s.submitted_at AS at FROM test_submissions s JOIN tests t ON t.id=s.test_id JOIN legacy_class_mappings m ON m.class_code=t.class_code WHERE s.user_id=$1 AND m.school_id=$2 AND s.grading_status='graded' AND s.submitted_at::timestamp >= now()-$3*interval '1 day' ORDER BY s.submitted_at DESC LIMIT 2000`,
        [userId, schoolId, days],
      )
    ).rows;
    records.push(...legacy);
    topics = (
      await db.query(
        `SELECT n.name AS topic,count(*) AS observations,count(*) FILTER(WHERE aa.correct) AS correct FROM attempt_answers aa JOIN assessment_attempts a ON a.id=aa.attempt_id JOIN assessment_items i ON i.id=aa.assessment_item_id JOIN question_versions q ON q.id=i.question_version_id JOIN curriculum_nodes n ON n.id=q.curriculum_node_id WHERE a.student_id=$1 AND a.school_id=$2 AND aa.correct IS NOT NULL AND a.submitted_at >= now()-$3*interval '1 day' GROUP BY n.id,n.name ORDER BY n.name LIMIT 100`,
        [userId, schoolId, days],
      )
    ).rows;
  }
  return {
    ...summarize(records, events),
    progress,
    topics,
    scope,
    days,
    generatedAt: new Date().toISOString(),
    note: "Điểm trung bình các lượt làm bài đã chấm, không phải GPA. Lịch sử thay đổi học liệu bắt đầu từ khi bật ghi sự kiện. Dữ liệu được giới hạn để bảo đảm hiệu năng.",
  };
}
