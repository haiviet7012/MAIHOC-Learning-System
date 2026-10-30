import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { publicUser, isSuperAdminUser, isTeacherUser } from "../server/auth.js";
import { installSchoolSystemRoutes, validateTeacherProfile, saveTeacherAssignments } from "../server/school-system.js";

test("publicUser separates Admin, Homeroom Teacher, Subject Teacher, School Student, and External Student", () => {
  const admin = publicUser({
    id: 1,
    name: "MAI HOC Admin",
    email: "admin@maihoc.test",
    role: "admin",
    admin_level: 2,
    account_type: "external"
  });
  assert.equal(admin.isSuperAdmin, true);
  assert.equal(admin.isTeacher, false);
  assert.equal(admin.accountRole, "admin");
  assert.equal(admin.roleLabel, "Quản trị MAI HỌC");

  const homeroomTeacher = publicUser({
    id: 14,
    name: "hai viet",
    email: "haiviet701@gmail.com",
    role: "admin",
    admin_level: 1,
    account_type: "school",
    homeroom_class: "10A1"
  });
  assert.equal(homeroomTeacher.isSuperAdmin, false);
  assert.equal(homeroomTeacher.isTeacher, true);
  assert.equal(homeroomTeacher.accountRole, "teacher");
  assert.equal(homeroomTeacher.teacherKind, "homeroom");
  assert.equal(homeroomTeacher.homeroomClass, "10A1");
  assert.equal(homeroomTeacher.roleLabel, "Giáo viên chủ nhiệm · Lớp 10A1");

  const subjectTeacher = publicUser({
    id: 15,
    name: "Giao Vien Bo Mon",
    email: "gvbm@gmail.com",
    role: "admin",
    admin_level: 1,
    account_type: "school"
  });
  assert.equal(subjectTeacher.isSuperAdmin, false);
  assert.equal(subjectTeacher.isTeacher, true);
  assert.equal(subjectTeacher.accountRole, "teacher");
  assert.equal(subjectTeacher.teacherKind, "subject");
  assert.equal(subjectTeacher.roleLabel, "Giáo viên bộ môn");

  const schoolStudent = publicUser({
    id: 13,
    name: "hai viet 1",
    email: "hainguyenviet231@gmail.com",
    role: "user",
    admin_level: 0,
    account_type: "school",
    student_class: "10A1"
  });
  assert.equal(schoolStudent.isSuperAdmin, false);
  assert.equal(schoolStudent.isTeacher, false);
  assert.equal(schoolStudent.accountRole, "student");
  assert.equal(schoolStudent.accountType, "school");
  assert.equal(schoolStudent.classCode, "10A1");
  assert.equal(schoolStudent.roleLabel, "Học sinh trong trường · Lớp 10A1");

  const externalStudent = publicUser({
    id: 16,
    name: "Hoc Sinh Ngoai",
    email: "external@gmail.com",
    role: "user",
    admin_level: 0,
    account_type: "external"
  });
  assert.equal(externalStudent.accountType, "external");
  assert.equal(externalStudent.roleLabel, "Học sinh ngoài trường");
});

test("Homeroom teacher can add student by email and Student can join class via /api/school/join-class", async () => {
  // In-memory mock db for school routes
  const users = new Map([
    [1, { id: 1, name: "Admin", email: "admin@maihoc.test", role: "admin", admin_level: 2, account_type: "external" }],
    [14, { id: 14, name: "hai viet", email: "haiviet701@gmail.com", role: "admin", admin_level: 1, account_type: "school" }],
    [15, { id: 15, name: "GV Bo Mon", email: "gvbm@gmail.com", role: "admin", admin_level: 1, account_type: "school" }],
    [12, { id: 12, name: "Hải Nguyễn Đức", email: "hainguyenduc2409@gmail.com", role: "user", admin_level: 0, account_type: "external" }],
    [13, { id: 13, name: "hai viet 1", email: "hainguyenviet231@gmail.com", role: "user", admin_level: 0, account_type: "school" }]
  ]);
  const classMembers = []; // { user_id, class_code, created_at }
  const joinLocks = []; // permanent one-time class selection by user
  const leaveRequests = []; // { id, class_code, student_id, status, created_at }
  const assignments = [
    { id: "a1", teacher_id: 14, class_code: "10A1", subject: "Chủ nhiệm", assignment_type: "homeroom" },
    { id: "a2", teacher_id: 14, class_code: "10A1", subject: "Toán", assignment_type: "subject" },
    { id: "a3", teacher_id: 15, class_code: "10A1", subject: "Vật lý", assignment_type: "subject" }
  ];

  const mockDb = {
    transaction(fn) {
      return async (...args) => fn(...args);
    },
    prepare(sql) {
      const s = sql.replace(/\s+/g, " ").trim();
      return {
        async get(...args) {
          if (s.includes("FROM users WHERE LOWER(email)=?")) {
            const email = String(args[0]).toLowerCase();
            return [...users.values()].find(u => u.email.toLowerCase() === email);
          }
          if (s.includes("SELECT * FROM users WHERE id=?")) {
            return users.get(Number(args[0]));
          }
          if (s.includes("FROM school_teacher_assignments") && s.includes("assignment_type='homeroom'")) {
            if (s.includes("teacher_id=? AND class_code=?")) {
              return assignments.find(a => a.teacher_id === Number(args[0]) && a.class_code === args[1] && a.assignment_type === "homeroom");
            }
            if (s.includes("WHERE a.class_code=?")) {
              const found = assignments.find(a => a.class_code === args[0] && a.assignment_type === "homeroom");
              if (!found) return undefined;
              const u = users.get(found.teacher_id);
              return { teacherId: u.id, teacherName: u.name };
            }
          }
          if (s.includes("FROM school_teacher_assignments WHERE teacher_id=? AND class_code=? LIMIT 1")) {
            return assignments.find(a => a.teacher_id === Number(args[0]) && a.class_code === args[1]);
          }
          if (s.includes("FROM school_class_members WHERE user_id=? AND class_code=?")) {
            return classMembers.find(m => m.user_id === Number(args[0]) && m.class_code === args[1]);
          }
          if (s.includes("FROM school_class_join_locks WHERE user_id=?")) {
            return joinLocks.find(lock => lock.user_id === Number(args[0]));
          }
          if (s.includes("FROM school_class_members WHERE user_id=? LIMIT 1")) {
            return classMembers.find(m => m.user_id === Number(args[0]));
          }
          if (s.includes("FROM school_class_leave_requests WHERE student_id=? AND class_code=? AND status='pending'")) {
            return leaveRequests.find(row => row.student_id === Number(args[0]) && row.class_code === args[1] && row.status === "pending");
          }
          if (s.includes("FROM school_class_leave_requests WHERE student_id=? AND class_code=?")) {
            return leaveRequests.filter(row => row.student_id === Number(args[0]) && row.class_code === args[1])
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          }
          if (s.includes("FROM school_class_leave_requests WHERE id=? AND class_code=? AND status='pending'")) {
            const row = leaveRequests.find(item => item.id === args[0] && item.class_code === args[1] && item.status === "pending");
            return row ? { id: row.id, studentId: row.student_id } : undefined;
          }
          return undefined;
        },
        async all(...args) {
          if (s.includes("SELECT class_code AS classCode, COUNT(*) AS total FROM school_class_members")) {
            const counts = new Map();
            for (const m of classMembers) counts.set(m.class_code, (counts.get(m.class_code) || 0) + 1);
            return [...counts.entries()].map(([classCode, total]) => ({ classCode, total }));
          }
          if (s.includes("FROM school_teacher_assignments a JOIN users u ON u.id=a.teacher_id WHERE a.assignment_type='homeroom'")) {
            return assignments.filter(a => a.assignment_type === "homeroom").map(a => ({
              classCode: a.class_code,
              teacherId: a.teacher_id,
              teacherName: users.get(a.teacher_id)?.name
            }));
          }
          if (s.includes("FROM school_teacher_assignments WHERE teacher_id=? GROUP BY class_code")) {
            const tid = Number(args[0]);
            const byClass = new Map();
            for (const a of assignments.filter(x => x.teacher_id === tid)) {
              const prev = byClass.get(a.class_code) || 0;
              byClass.set(a.class_code, Math.max(prev, a.assignment_type === "homeroom" ? 1 : 0));
            }
            return [...byClass.entries()].map(([classCode, isHomeroom]) => ({ classCode, isHomeroom }));
          }
          if (s.includes("FROM school_teacher_assignments a JOIN users u ON u.id=a.teacher_id WHERE a.class_code=?")) {
            const code = args[0];
            return assignments.filter(a => a.class_code === code).map(a => {
              const u = users.get(a.teacher_id);
              return { id: u.id, name: u.name, email: u.email, subject: a.subject, assignmentType: a.assignment_type };
            });
          }
          if (s.includes("FROM school_class_members m JOIN users u ON u.id=m.user_id WHERE m.class_code=?")) {
            const code = args[0];
            return classMembers.filter(m => m.class_code === code).map(m => {
              const u = users.get(m.user_id);
              return { id: u.id, name: u.name, email: u.email, joinedAt: m.created_at };
            });
          }
          if (s.includes("FROM school_class_members WHERE user_id=?")) {
            const uid = Number(args[0]);
            return classMembers.filter(m => m.user_id === uid).map(m => ({ classCode: m.class_code }));
          }
          if (s.includes("FROM school_class_leave_requests r JOIN users u ON u.id=r.student_id")) {
            return leaveRequests.filter(row => row.class_code === args[0] && row.status === "pending").map(row => {
              const student = users.get(row.student_id);
              return {
                id: row.id, classCode: row.class_code, createdAt: row.created_at,
                studentId: row.student_id, studentName: student?.name, studentEmail: student?.email
              };
            });
          }
          return [];
        },
        async run(...args) {
          if (s.startsWith("UPDATE users SET account_type='school' WHERE id=?")) {
            const u = users.get(Number(args[0]));
            if (u) u.account_type = "school";
            return { changes: 1 };
          }
          if (s.startsWith("INSERT INTO school_class_join_locks(user_id,class_code)")) {
            const uid = Number(args[0]);
            if (!joinLocks.some(lock => lock.user_id === uid)) {
              joinLocks.push({ user_id: uid, class_code: args[1], joined_at: "2026-10-30" });
            }
            return { changes: 1 };
          }
          if (s.startsWith("INSERT INTO school_class_leave_requests(id,class_code,student_id)")) {
            leaveRequests.push({
              id: args[0], class_code: args[1], student_id: Number(args[2]),
              status: "pending", created_at: String(leaveRequests.length + 1).padStart(2, "0")
            });
            return { changes: 1 };
          }
          if (s.startsWith("UPDATE school_class_leave_requests SET status=?")) {
            const row = leaveRequests.find(item => item.id === args[2] && item.status === "pending");
            if (row) row.status = args[0];
            return { changes: row ? 1 : 0 };
          }
          if (s.startsWith("DELETE FROM school_class_members WHERE user_id=? AND class_code=?")) {
            const uid = Number(args[0]);
            const code = args[1];
            const index = classMembers.findIndex(member => member.user_id === uid && member.class_code === code);
            if (index >= 0) classMembers.splice(index, 1);
            return { changes: index >= 0 ? 1 : 0 };
          }
          if (s.startsWith("INSERT INTO school_class_members(user_id,class_code)")) {
            classMembers.push({ user_id: Number(args[0]), class_code: args[1], created_at: "2026-10-30" });
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    }
  };

  const routes = {};
  const mockApp = {
    get: (p, ...h) => { routes[`GET ${p}`] = h[h.length - 1]; },
    post: (p, ...h) => { routes[`POST ${p}`] = h[h.length - 1]; },
    delete: (p, ...h) => { routes[`DELETE ${p}`] = h[h.length - 1]; }
  };

  const notifications = [];
  installSchoolSystemRoutes(mockApp, {
    db: mockDb,
    requireAuth: (_req, _res, next) => next?.(),
    requireSameOrigin: (_req, _res, next) => next?.(),
    requireSuperAdmin: (_req, _res, next) => next?.(),
    notifyUser: async (uid, type, title, msg) => notifications.push({ uid, type, title, msg }),
    notifyAdmins: async () => {}
  });

  function callRoute(key, { user, params = {}, body = {} }) {
    return new Promise(async (resolve) => {
      let statusCode = 200;
      const res = {
        setHeader() {},
        status(code) { statusCode = code; return this; },
        json(payload) { resolve({ status: statusCode, data: payload }); return this; }
      };
      await routes[key]({ user, params, body }, res);
    });
  }

  const homeroomUser = publicUser({ ...users.get(14), homeroom_class: "10A1" });
  const subjectTeacherUser = publicUser(users.get(15));
  const student1User = publicUser(users.get(13));

  // Subject teacher (not homeroom) CANNOT add student by email
  const forbiddenAdd = await callRoute("POST /api/school/classes/:classCode/students", {
    user: subjectTeacherUser,
    params: { classCode: "10A1" },
    body: { email: "hainguyenduc2409@gmail.com" }
  });
  assert.equal(forbiddenAdd.status, 403);

  // Homeroom teacher CAN add student by email (Image 1)
  const addRes = await callRoute("POST /api/school/classes/:classCode/students", {
    user: homeroomUser,
    params: { classCode: "10A1" },
    body: { email: "hainguyenduc2409@gmail.com" }
  });
  assert.equal(addRes.status, 201);
  assert.equal(addRes.data.student.email, "hainguyenduc2409@gmail.com");
  assert.equal(users.get(12).account_type, "school");

  // Student 1 joins class 10A1 via "Tham gia lớp" button (Image 2)
  const joinRes = await callRoute("POST /api/school/join-class", {
    user: student1User,
    body: { classCode: "10A1" }
  });
  assert.equal(joinRes.status, 200);
  assert.equal(joinRes.data.classCode, "10A1");
  assert.equal(joinRes.data.user.classCode, "10A1");
  assert.equal(joinRes.data.user.accountType, "school");

  const secondJoinAttempt = await callRoute("POST /api/school/join-class", {
    user: student1User,
    body: { classCode: "10A2" }
  });
  assert.equal(secondJoinAttempt.status, 409, "A student must not join a second class.");

  // Student requests to leave; the membership stays until their homeroom teacher approves.
  const leaveRequestRes = await callRoute("POST /api/school/classes/:classCode/leave-requests", {
    user: student1User,
    params: { classCode: "10A1" }
  });
  assert.equal(leaveRequestRes.status, 201);
  assert.equal(classMembers.some(m => m.user_id === 13 && m.class_code === "10A1"), true);

  const teacherClassDetail = await callRoute("GET /api/school/classes/:classCode", {
    user: homeroomUser,
    params: { classCode: "10A1" }
  });
  assert.equal(teacherClassDetail.status, 200);
  assert.equal(teacherClassDetail.data.leaveRequests.length, 1);
  assert.equal(teacherClassDetail.data.leaveRequests[0].studentId, 13);

  const rejectLeave = await callRoute("POST /api/school/classes/:classCode/leave-requests/:requestId/review", {
    user: homeroomUser,
    params: { classCode: "10A1", requestId: leaveRequestRes.data.id },
    body: { decision: "reject" }
  });
  assert.equal(rejectLeave.status, 200);
  assert.equal(classMembers.some(m => m.user_id === 13 && m.class_code === "10A1"), true);

  const retryLeave = await callRoute("POST /api/school/classes/:classCode/leave-requests", {
    user: student1User,
    params: { classCode: "10A1" }
  });
  assert.equal(retryLeave.status, 201);

  const approveLeave = await callRoute("POST /api/school/classes/:classCode/leave-requests/:requestId/review", {
    user: homeroomUser,
    params: { classCode: "10A1", requestId: retryLeave.data.id },
    body: { decision: "approve" }
  });
  assert.equal(approveLeave.status, 200);
  assert.equal(classMembers.some(m => m.user_id === 13 && m.class_code === "10A1"), false);
  assert.equal(joinLocks.some(lock => lock.user_id === 13 && lock.class_code === "10A1"), true);

  const joinAfterApprovedLeave = await callRoute("POST /api/school/join-class", {
    user: student1User,
    body: { classCode: "10A2" }
  });
  assert.equal(joinAfterApprovedLeave.status, 409, "Leaving a class must not reset the one-time join lock.");

  // Homeroom teacher overview shows only current members after the approved leave.
  const classesTabRes = await callRoute("GET /api/school/classes", {
    user: homeroomUser
  });
  assert.equal(classesTabRes.status, 200);
  assert.equal(classesTabRes.data.homeroomClass, "10A1");
  const studentEmails = classesTabRes.data.homeroomDetail.students.map(s => s.email).sort();
  assert.deepEqual(studentEmails, ["hainguyenduc2409@gmail.com"]);
});

test("UI moves class joining into My Classes and adds student leave approval controls", () => {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(rootDir, "js/app.js"), "utf8");
  const schoolJs = fs.readFileSync(path.join(rootDir, "js/school-system.js"), "utf8");

  assert.doesNotMatch(indexHtml, /id="join-class-open"/);
  assert.doesNotMatch(indexHtml, /id="join-class-dialog"/);
  assert.doesNotMatch(indexHtml, /register-school-class-field/);
  assert.doesNotMatch(appJs, /ensureStudentJoinClassNavButton/);
  assert.match(schoolJs, /student-join-class-inline-form/);
  assert.match(schoolJs, /Bạn chưa tham gia lớp nào/);
  assert.match(schoolJs, /data-school-request-leave/);
  assert.match(schoolJs, /data-school-review-leave-request/);
  assert.doesNotMatch(appJs, /<span class="pill">GIẢNG VIÊN<\/span>/);
  assert.doesNotMatch(appJs, /Quản lý nội dung học tập/);
});
