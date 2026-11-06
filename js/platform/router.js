const paths = {
  "school-tutor": "/school/tutor",
  'school-lab': '/school/lab',
  'school-rooms': '/school/rooms',
  'school-digitize': '/school/digitize',
  'school-notebook': '/school/notebook',
  'school-plans': '/school/plans',
  'school-advisor': '/school/advisor',
  'school-ielts': '/school/ielts',
  home: "/learning",
  school: "/school/classes",
  organization: "/school",
  "question-bank": "/school/question-bank",
  "assignment-management": "/school/assignment-management",
  assignments: "/school/assignments",
  "school-analytics": "/school/progress",
  timetable: "/school/timetable",
  analytics: "/learning/progress",
  "subject-picker": "/learning/subjects",
  theory: "/learning/library",
  practice: "/learning/practice",
  "exam-select": "/learning/exams",
  "national-exam-hub": "/learning/national-exams",
  tests: "/school/tests",
  "ai-solver": "/learning/tutor",
  "study-rooms": "/learning/study-rooms",
  "physics-formulas": "/learning/physics-formulas",
  "account-center": "/account",
  admin: "/school/admin",
};
export function routeUrl(state) {
  if (state.route === 'exam-result-view') return `/learning/national-exams/results/${encodeURIComponent(state.resultId || 'guest')}`;
  if (state.route === 'exam-room-view' && state.examDocId)
    return `/learning/national-exams/${encodeURIComponent(state.examDocId)}/room`;
  if (state.route === 'school-rooms' && state.classroomCode)
    return `/school/rooms/${encodeURIComponent(state.classroomCode)}`;
  if (state.route === 'ielts-skill')
    return `/school/ielts/${encodeURIComponent(state.ieltsSkill || 'speaking')}`;
  if (state.route === 'school-announcements' && state.announcementId)
    return `/school/announcements/${encodeURIComponent(state.announcementId)}`;
  if (state.route === 'school-announcements') return '/school/announcements';
  if (state.route === 'assignments' && state.assignmentId)
    return `/school/assignments/${encodeURIComponent(state.assignmentId)}?schoolId=${encodeURIComponent(state.targetSchoolId || '')}`;
  if (state.route === 'tests' && state.pendingTestId)
    return `/school/tests/${encodeURIComponent(state.pendingTestId)}`;
  if (state.route === "exam" && state.examDocId)
    return `/learning/tests/${encodeURIComponent(state.examDocId)}`;
  if (state.route === "reader")
    return `/learning/documents/${encodeURIComponent(state.docId)}`;
  if (state.route === "school-class")
    return `/school/classes/${encodeURIComponent(state.classCode)}`;
  const base = paths[state.route];
  if (base) return base;
  const query = new URLSearchParams({
    route: state.route,
    subject: state.subject || "Toán",
    grade: state.grade || "10",
  });
  return `/learning?${query}`;
}
export function parseRoute(url) {
  const path = url.pathname.replace(/\/$/, "") || "/";
  const nationalResult = path.match(/^\/learning\/national-exams\/results\/([^/]+)$/);
  if (nationalResult) return { route: 'exam-result-view', resultId: decodeURIComponent(nationalResult[1]) };
  const examRoom = path.match(/^\/learning\/national-exams\/([^/]+)\/room$/);
  if (examRoom) return { route: 'exam-room-view', examDocId: decodeURIComponent(examRoom[1]), examOrigin: 'national-exam-hub' };
  if (path.startsWith('/school/rooms/')) return {route:'school-rooms', classroomCode:decodeURIComponent(path.slice('/school/rooms/'.length))};
  if (url.searchParams.has("route"))
    return {
      route: url.searchParams.get("route"),
      subject: url.searchParams.get("subject") || "Toán",
      grade: url.searchParams.get("grade") || "10",
    };
  if (path === '/school/announcements') return { route: 'school-announcements', announcementId: null };
  if (path.startsWith('/school/ielts/')) return { route: 'ielts-skill', subject: 'IELTS', ieltsSkill: decodeURIComponent(path.slice('/school/ielts/'.length)) };
  if (path.startsWith('/school/announcements/')) return { route: 'school-announcements', announcementId: decodeURIComponent(path.slice(22)) };
  if (path.startsWith('/school/assignments/')) return { route: 'assignments', assignmentId: decodeURIComponent(path.slice(20)), targetSchoolId: url.searchParams.get('schoolId') };
  if (path === "/learning/timetable") return { route: "timetable" };
  if (path === "/learning/assignments") return { route: "assignments" };
  if (path === "/learning/tests") return { route: "tests" };
  if (path.startsWith("/school/tests/")) return { route: "tests", pendingTestId: decodeURIComponent(path.slice(14)) };
  if (path.startsWith("/learning/tests/"))
    return {
      route: "tests",
      pendingTestId: decodeURIComponent(path.slice(16)),
    };
  if (path.startsWith("/learning/documents/"))
    return { route: "reader", docId: decodeURIComponent(path.slice(20)) };
  if (path.startsWith("/school/classes/"))
    return {
      route: "school-class",
      classCode: decodeURIComponent(path.slice(16)),
    };
  return {
    route: Object.keys(paths).find((key) => paths[key] === path) || "home",
  };
}
