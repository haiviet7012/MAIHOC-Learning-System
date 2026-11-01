// Synthetic chart fixtures for the isolated browser preview only.
export async function seedAdvisorPreview(db, schoolId, yearId, classId) {
  await db.query(
    "INSERT INTO legacy_class_mappings(class_code,school_id,academic_year_id,class_id) VALUES('12A1',$1,$2,$3)",
    [schoolId, yearId, classId],
  );
  for (const [index, subject] of [
    "Toán",
    "Vật lý",
    "Hóa học",
    "Sinh học",
    "Tiếng Anh",
    "Tin học",
  ].entries()) {
    const id = `advisor-preview-${index}`;
    await db.query(
      `INSERT INTO documents(id,subject,grade,category,title,filename,original_name,size) VALUES($1,$2,'12','test',$2,'fixture.pdf','fixture.pdf',1)`,
      [id, subject],
    );
    await db.query(
      `INSERT INTO tests(id,document_id,title,subject,grade,open_at,close_at,duration_minutes,created_by,class_code) VALUES($1,$1,$2,$2,'12',now()::text,(now()+interval '1 day')::text,30,101,'12A1')`,
      [id, subject],
    );
    for (let day = 1; day <= 3; day++) {
      const score = 4 + index * 0.65 + day * 0.4,
        at = new Date(Date.now() - (4 - day) * 86400000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts(user_id,document_id,title,subject,grade,category,graded,score,scale,answers_json,answer_key_json,result_json,created_at) VALUES(100,$1,$2,$2,'12','practice',1,$3,10,'{}','{}','{}',$4)`,
        [id, subject, score, at],
      );
      await db.query(
        `INSERT INTO test_submissions(test_id,user_id,title,subject,grade,grading_status,graded,score,scale,answers_json,answer_key_json,result_json,submitted_at) VALUES($1,100,$2,$2,'12','graded',1,$3,10,'{}','{}','{}',$4)`,
        [id, subject, score, at],
      );
    }
  }
}
