import { api } from "./api.js";
import { escapeHTML as e } from "../ui.js";
import { mountClassroomShell } from "./classroom-shell.js?v=20261105livekit1";
export const upgradeRoutes = new Set([
  "school-lab",
  "school-rooms",
  "school-digitize",
  "school-notebook",
]);
export const upgradeApi = "/api/school/upgrade";
export const btn = (label, attr = "") =>
  `<button type="button" class="button secondary" ${attr}>${label}</button>`;
export const field = (name, label, content) =>
  `<label>${label}${content || `<input name="${name}" required maxlength="200">`}</label>`;
export const schoolSelect = (schools) =>
  `<label>Trường thử nghiệm<select data-upgrade-school>${schools.map((s) => `<option value="${e(s.id)}">${e(s.name)}</option>`).join("")}</select></label>`;
export function mountSchoolUpgrade(container, route, user, onNavigate, state = {}) {
  if (route === "school-rooms") return mountClassroomShell(container, user, {onNavigate, classroomCode:state.classroomCode});
  let disposed = false,
    child = () => {},
    sid = "",
    mountVersion = 0;
  const controller = new AbortController();
  const request = (path, opts = {}) =>
    api(upgradeApi + path, { ...opts, signal: controller.signal });
  container.innerHTML = '<p role="status">Đang tải School…</p>';
  async function load() {
    const caps = await request("/capabilities");
    if (disposed) return;
    const title = {
      "school-lab": "Thí nghiệm School",
      "school-rooms": "Phòng học School",
      "school-digitize": "Số hóa đề AI",
      "school-notebook": "Vở học AI",
    }[route];
    container.innerHTML = `<div class="portal-heading"><div><p class="eyebrow">MAIHOC SCHOOL · BẢN THỬ NGHIỆM</p><h1>${title}</h1><p>Nối việc học, minh chứng và hỗ trợ cá nhân.</p></div>${caps.schools.length ? schoolSelect(caps.schools) : ""}</div><p data-upgrade-status role="status" aria-live="polite"></p><div data-upgrade-content></div>`;
    const content = container.querySelector("[data-upgrade-content]");
    if (!caps.enabled || !caps.schools.length) {
      content.innerHTML =
        '<section class="portal-panel"><h2>Chưa bật bản thử nghiệm</h2><p>Quản trị viên cần bật nâng cấp và đăng ký trường dùng thử theo hướng dẫn trong PR. Các chức năng School hiện tại vẫn sử dụng được.</p></section>';
      return;
    }
    sid = String(caps.schools[0].id);
    async function mount() {
      const version = ++mountVersion;
      child();
      child = () => {};
      const status = container.querySelector("[data-upgrade-status]");
      status.textContent = "";
      const report = (msg) => {
        if (!disposed && version === mountVersion) status.textContent = msg;
      };
      if (route === "school-rooms") {
        const m = await import("../../study-rooms/school-client.js");
        if (!disposed && version === mountVersion)
          child = m.mountSchoolRooms(content, {
            schoolId: sid,
            user,
            request,
            report,
          });
      } else if (route === "school-lab") {
        const m = await import("../../physics-lab/school-lab.js");
        if (!disposed && version === mountVersion)
          child = m.mountSchoolLab(content, { schoolId: sid, request, report });
      } else {
        const m = await import("./school-documents.js");
        if (!disposed && version === mountVersion)
          child = m.mountSchoolDocuments(content, {
            schoolId: sid,
            kind: route === "school-notebook" ? "notebook" : "exam",
            request,
            report,
            onNavigate: (route,params) => onNavigate(route === "ai-solver" ? "school-tutor" : route,params),
            caps,
          });
      }
    }
    container.querySelector("[data-upgrade-school]").addEventListener(
      "change",
      (ev) => {
        sid = ev.target.value;
        mount().catch((err) => {
          if (!disposed)
            container.querySelector("[data-upgrade-status]").textContent =
              err.message;
        });
      },
      { signal: controller.signal },
    );
    await mount();
  }
  load().catch((err) => {
    if (!disposed)
      container.innerHTML = `<section class="portal-panel" role="alert"><h1>Chưa mở được School</h1><p>${e(err.message)}</p></section>`;
  });
  return () => {
    disposed = true;
    controller.abort();
    child();
  };
}
