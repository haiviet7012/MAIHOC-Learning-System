const paths = {
  home: "/learning",
  school: "/school/classes",
  organization: "/school",
  "question-bank": "/school/question-bank",
  "assignment-management": "/school/assignment-management",
  assignments: "/school/assignments",
  analytics: "/learning/progress",
  "subject-picker": "/learning/subjects",
  theory: "/learning/library",
  practice: "/learning/practice",
  "exam-select": "/learning/exams",
  tests: "/school/tests",
  "ai-solver": "/learning/tutor",
  "study-rooms": "/learning/study-rooms",
  "account-center": "/account",
  admin: "/school/admin",
};
export function routeUrl(state) {
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
  if (url.searchParams.has("route"))
    return {
      route: url.searchParams.get("route"),
      subject: url.searchParams.get("subject") || "Toán",
      grade: url.searchParams.get("grade") || "10",
    };
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
