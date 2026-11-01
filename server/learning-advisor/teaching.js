import express from 'express';
import { randomUUID } from 'node:crypto';
import { isTeacherUser } from '../auth.js';
import { fail, integer, text } from '../platform/policy.js';
import { summarize } from './analytics.js';
import { advise, validateAdvice } from './gemini.js';

export function installTeachingAdvisor(app, { db, requireAuth, requireSameOrigin, generate = advise }) {
  const router = express.Router();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  router.use(requireAuth, (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!isTeacherUser(req.user)) return res.status(403).json({ error: 'Chức năng dành cho giáo viên.' });
    if (process.env.MAIHOC_LEARNING_ADVISOR_ENABLED === '0') return res.status(503).json({ error: 'Cố vấn đang tạm tắt.' });
    next();
  });
  async function classes(user) {
    const legacy = await rows('SELECT DISTINCT class_code FROM school_teacher_assignments WHERE teacher_id=$1 ORDER BY class_code', [user.id]);
    const list = legacy.map(c => ({ key: `legacy:${c.class_code}`, name: c.class_code, code: c.class_code, kind: 'legacy' }));
    const exists = (await rows("SELECT to_regclass('public.teacher_course_assignments') AS ready"))[0].ready;
    if (exists) {
      const modern = await rows(`SELECT DISTINCT c.id,c.name,c.class_code,c.school_id,s.name AS school_name,y.code AS year_code
        FROM classes c JOIN schools s ON s.id=c.school_id JOIN academic_years y ON y.id=c.academic_year_id
        JOIN teacher_course_assignments a ON a.class_id=c.id AND a.school_id=c.school_id
        JOIN school_memberships m ON m.school_id=c.school_id AND m.user_id=a.teacher_id
        WHERE a.teacher_id=$1 AND m.status='active' AND m.role='teacher' AND s.status='active' AND c.status='active' ORDER BY c.id`, [user.id]);
      list.push(...modern.map(c => ({ key: `school:${c.id}`, name: `${c.name} · ${c.school_name} · ${c.year_code}`, code: c.class_code, classId: c.id, schoolId: c.school_id, kind: 'school' })));
    }
    return list;
  }
  async function selection(user, key) {
    const selected = (await classes(user)).find(c => c.key === key);
    if (!selected) fail('Bạn chưa được phân công lớp này.', 403);
    const students = selected.kind === 'legacy'
      ? await rows(`SELECT DISTINCT u.id,u.name FROM school_class_members m JOIN users u ON u.id=m.user_id WHERE m.class_code=$1 AND u.role='user' ORDER BY u.name,u.id`, [selected.code])
      : await rows(`SELECT DISTINCT u.id,u.name FROM student_enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=$1 AND e.school_id=$2 AND e.status='active' ORDER BY u.name,u.id`, [selected.classId, selected.schoolId]);
    if (students.length > 200) fail('Lớp vượt giới hạn 200 học sinh. Vui lòng liên hệ quản trị viên.');
    return { selected, students };
  }
  router.get('/classes', wrap(async (req, res) => res.json({ classes: await classes(req.user) })));
  router.get('/students', wrap(async (req, res) => {
    const { students } = await selection(req.user, text(req.query.classKey, 'Lớp', 100));
    res.json({ students });
  }));
  router.use(requireSameOrigin);

  router.post('/generate', wrap(async (req, res) => {
    if (!['lesson', 'plan'].includes(req.body.mode)) fail('Chức năng không hợp lệ.');
    const message = text(req.body.message, 'Yêu cầu', 4000);
    const days = integer(req.body.days ?? 30, 'Khoảng dữ liệu', 1, 90);
    const minutes = integer(req.body.minutes ?? 45, 'Thời lượng', 10, 240);
    const subject = text(req.body.subject, 'Môn học', 100);
    const { selected, students } = await selection(req.user, text(req.body.classKey, 'Lớp', 100));
    let targets = students;
    if (req.body.studentId != null && req.body.studentId !== '') {
      const studentId = integer(req.body.studentId, 'Học sinh');
      targets = students.filter(s => Number(s.id) === studentId);
      if (!targets.length && req.body.mode === 'plan') fail('Học sinh không thuộc lớp đã chọn.', 403);
    }
    if (!targets.length && req.body.mode === 'plan') fail('Lớp chưa có học sinh. Hãy cập nhật danh sách lớp trước.');
    const assignments = selected.kind === 'legacy'
      ? await rows('SELECT subject,assignment_type AS kind FROM school_teacher_assignments WHERE teacher_id=$1 AND class_code=$2', [req.user.id, selected.code])
      : await rows('SELECT subject,kind FROM teacher_course_assignments WHERE teacher_id=$1 AND class_id=$2 AND school_id=$3', [req.user.id, selected.classId, selected.schoolId]);
    if (!assignments.some(a => a.kind === 'homeroom' || a.subject === subject)) fail('Bạn chưa được phân công môn này trong lớp đã chọn.', 403);
    await db.transaction(async () => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      const count = (await rows(`SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour') AS hour,count(*) AS day FROM learning_advisor_calls WHERE user_id=$1 AND created_at>now()-interval '1 day'`, [req.user.id]))[0];
      if (Number(count.hour)>=20 || Number(count.day)>=100) fail('Đã đạt giới hạn 20 lượt/giờ hoặc 100 lượt/ngày.',429);
      await db.query('INSERT INTO learning_advisor_calls(id,user_id) VALUES($1,$2)', [randomUUID(),req.user.id]);
    })();
    const ids = targets.map(s => Number(s.id));
    // No client-supplied scores or progress enter the prompt. Always query fresh records.
    const progress = await rows(`SELECT subject,item_type,item_title,progress_percent,status FROM user_progress
      WHERE user_id=ANY($1::bigint[]) AND subject=$2 ORDER BY updated_at DESC LIMIT 1000`, [ids, subject]);
    const personal = await rows(`SELECT subject,score,scale,created_at AS at FROM exam_attempts
      WHERE user_id=ANY($1::bigint[]) AND subject=$2 AND graded=1 AND category IN ('exam','practice')
      AND created_at::timestamp>=now()-$3*interval '1 day' ORDER BY created_at DESC LIMIT 2000`, [ids, subject, days]);
    let school;
    if (selected.kind === 'legacy') {
      school = await rows(`SELECT s.subject,s.score,s.scale,s.submitted_at AS at FROM test_submissions s JOIN tests t ON t.id=s.test_id
        WHERE s.user_id=ANY($1::bigint[]) AND s.subject=$2 AND s.grading_status='graded'
        AND (t.class_code=$3 OR (t.class_code='ALL' AND t.grade=$4))
        AND s.submitted_at::timestamp>=now()-$5*interval '1 day' ORDER BY s.submitted_at DESC LIMIT 2000`, [ids, subject, selected.code, selected.code.slice(0, 2), days]);
    } else {
      school = await rows(`SELECT s.subject,r.score,r.scale,a.submitted_at AS at FROM assessment_attempts a
        JOIN assessment_results r ON r.attempt_id=a.id JOIN assessments s ON s.id=a.assessment_id JOIN assessment_assignments aa ON aa.id=a.assignment_id AND aa.school_id=a.school_id
        WHERE a.student_id=ANY($1::bigint[]) AND aa.class_id=$2 AND a.school_id=$3 AND s.subject=$4 AND a.status='graded'
        AND a.submitted_at>=now()-$5*interval '1 day' ORDER BY a.submitted_at DESC LIMIT 2000`, [ids, selected.classId, selected.schoolId, subject, days]);
    }
    if (selected.kind === 'school') {
      const legacyMapped = await rows(`SELECT ts.subject,ts.score,ts.scale,ts.submitted_at AS at
        FROM test_submissions ts JOIN tests t ON t.id=ts.test_id
        JOIN legacy_class_mappings m ON m.class_id=$2 AND m.school_id=$3
        JOIN classes c ON c.id=m.class_id AND c.school_id=m.school_id
        WHERE ts.user_id=ANY($1::bigint[]) AND ts.subject=$4 AND ts.grading_status='graded'
        AND (t.class_code=m.class_code OR (t.class_code='ALL' AND t.grade=c.grade_level::text))
        AND ts.submitted_at::timestamp>=now()-$5*interval '1 day' ORDER BY ts.submitted_at DESC LIMIT 2000`, [ids,selected.classId,selected.schoolId,subject,days]);
      school.push(...legacyMapped);
    }
    const context = { audience: 'teacher', teachingMode: req.body.mode, subject, classCode: selected.code,
      target: req.body.studentId ? 'individual' : 'class', studentCount: targets.length,
      learning: summarize(personal), school: summarize(school), progress,
      days, generatedAt: new Date().toISOString(),
      note: 'Dữ liệu có giới hạn số dòng; tiến trình hoàn thành không phải điểm. Nếu thiếu dữ liệu phải nói rõ, không tự gán điểm 0. Không liệt kê điểm hoặc tên học sinh trong câu trả lời.' };
    const checked = validateAdvice(await generate({ audience: 'teacher', mode: req.body.mode === 'plan' ? 'plan' : 'chat', message, goal: message, minutes, context, history: [], roadmap: null }));
    if (!checked.inScope) { checked.reply = 'Cố vấn giảng dạy chỉ hỗ trợ thiết kế bài giảng và lộ trình học tập.'; checked.tasks = []; }
    if (req.body.mode === 'lesson') checked.tasks = [];
    const totals = new Map();
    for (const task of checked.tasks) totals.set(task.day, (totals.get(task.day) || 0) + task.minutes);
    if ([...totals.values()].some(v => v > minutes)) fail('Lộ trình vượt thời lượng mỗi ngày. Hãy yêu cầu chia nhỏ nhiệm vụ.', 502);
    res.json({ reply: checked.reply, tasks: checked.tasks, mode: req.body.mode, studentCount: targets.length });
  }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const missing = ['42P01','42883'].includes(error.pgCode || error.code);
    res.status(error.status || (missing ? 503 : 500)).json({ error: error.status ? error.message : missing ? 'Cần chạy migration Cố vấn trên backend trước khi sử dụng.' : 'Không đọc được dữ liệu Cố vấn giảng dạy. Vui lòng thử lại hoặc liên hệ quản trị viên.' });
  });
  app.use('/api/teaching-advisor', router);
}
