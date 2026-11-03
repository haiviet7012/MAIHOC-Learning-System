import { escapeHTML as e } from "../ui.js";
export function schoolOverviewMarkup(user, school, data, staff) {
  const initials = String(user.name || "MH")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((x) => x[0])
    .join("");
  const role =
    school.role === "school_admin"
      ? "Quản trị nhà trường"
      : staff
        ? "Giáo viên"
        : "Học sinh";
  return `<div class="school-overview-lead"><section class="school-overview-hero"><div><p class="eyebrow">KHÔNG GIAN HỌC TẬP CỦA BẠN</p><h2>Học tốt hơn.<br>Tiến xa hơn, cùng nhau.</h2><p>${staff ? "Kết nối lớp học, chuẩn bị bài giảng và đồng hành cùng từng học sinh." : "Một nơi cho lịch học, bài tập và những điều bạn muốn khám phá mỗi ngày."}</p><button class="button" data-route="${staff ? "assignment-management" : "assignments"}">${staff ? "Quản lý bài học" : "Tiếp tục học tập"} <span aria-hidden="true">↗</span></button></div></section><aside class="school-overview-profile" aria-label="Hồ sơ School"><p class="eyebrow">HỒ SƠ CỦA BẠN</p><div class="school-profile-avatar" aria-hidden="true">${e(initials)}</div><h3>${e(user.name)}</h3><p>${e(role)}</p><span class="pill">${e(school.name)}</span></aside></div><div class="portal-stats school-overview-stats"><article class="portal-stat"><span>Lớp học</span><strong>${data.classes.length}</strong><span class="school-stat-symbol" aria-hidden="true">▦</span></article><article class="portal-stat"><span>Năm học</span><strong>${data.years.length}</strong><span class="school-stat-symbol" aria-hidden="true">▤</span></article><article class="portal-stat"><span>Thành viên</span><strong>${data.memberCount == null ? "—" : Number(data.memberCount)}</strong><span class="school-stat-symbol" aria-hidden="true">♧</span></article></div><div class="school-quick-links"><button data-route="timetable"><span aria-hidden="true">▦</span><span>Thời khóa biểu<small>Sắp xếp nhịp học của bạn</small></span></button><button data-route="school-tutor"><span aria-hidden="true">✦</span><span>Gia sư AI<small>Hiểu từng bước, vững kiến thức</small></span></button><button data-route="school-lab"><span aria-hidden="true">⚛</span><span>Phòng thí nghiệm<small>Khám phá bằng trải nghiệm</small></span></button></div>`;
}
