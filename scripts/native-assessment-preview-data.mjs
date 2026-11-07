// Isolated preview fixture for regression coverage of previously published work.
export async function seedNativeAssessment(db, schoolId, classId) {
  const version = (await db.query("INSERT INTO curriculum_versions(school_id,name) VALUES($1,'Fixture') RETURNING id", [schoolId])).rows[0];
  const topic = (await db.query("INSERT INTO curriculum_nodes(school_id,curriculum_version_id,subject,grade,name) VALUES($1,$2,'Toán',12,'Hàm số lịch sử') RETURNING id", [schoolId,version.id])).rows[0];
  const item = (await db.query("INSERT INTO question_items(school_id,created_by) VALUES($1,101) RETURNING id", [schoolId])).rows[0];
  const question = (await db.query("INSERT INTO question_versions(school_id,subject,grade,type,stem,choices,answer,curriculum_node_id,source,status,question_item_id,version) VALUES($1,'Toán',12,'short_answer','Tính giá trị của phân số 1/2 trong bài đã giao','[]','0.5',$2,'Preview fixture','approved',$3,1) RETURNING id", [schoolId, topic.id,item.id])).rows[0];
  const assessment = (await db.query("INSERT INTO assessments(school_id,title,created_by,subject) VALUES($1,'Bài kiểm tra pilot',101,'Toán') RETURNING id", [schoolId])).rows[0];
  await db.query("INSERT INTO assessment_items(school_id,assessment_id,question_version_id,position,points,snapshot) VALUES($1,$2,$3,0,1,$4)", [schoolId, assessment.id, question.id, JSON.stringify({stem:'Tính giá trị của phân số 1/2 trong bài đã giao',type:'short_answer',choices:[],answer:'0.5',curriculumNodeId:topic.id})]);
  await db.query("INSERT INTO assessment_assignments(school_id,assessment_id,class_id,open_at,close_at,duration_minutes) VALUES($1,$2,$3,now()-interval '1 minute',now()+interval '1 hour',30)", [schoolId,assessment.id,classId]);
}
