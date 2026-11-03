import { escapeHTML as e } from "../ui.js";
import { api } from "./api.js";
import { btn, field, upgradeApi } from "./school-upgrade.js";
export function mountSchoolEvidence(container, { schoolId, classes }) {
  const events = new AbortController();
  let disposed = false,
    groups = [];
  container.innerHTML = `<section class="portal-panel"><h2>Bằng chứng và nhóm phụ đạo · thử nghiệm</h2><form data-evidence-filter class="upgrade-form"><label>Lớp<select name="classId" required><option value="">Chọn lớp</option>${classes.map((c) => `<option value="${e(c.id)}">${e(c.name)}</option>`).join("")}</select></label>${field("subject", "Môn học", '<select name="subject"><option>Toán</option><option>Vật lý</option><option>Hóa học</option><option>Tiếng Anh</option><option>Ngữ văn</option><option>Sinh học</option></select>')}<button class="button secondary">Phân tích 30 ngày gần nhất</button></form><p data-evidence-status role="status"></p><div data-evidence-results></div><div data-intervention-drafts></div></section>`;
  const form = container.querySelector("form"),
    status = container.querySelector("[data-evidence-status]");
  const body = () => ({
    classId: Number(form.elements.classId.value),
    subject: form.elements.subject.value,
  });
  const query = () => new URLSearchParams(body()).toString();
  const request = (path, opts) =>
    api(upgradeApi + `/schools/${schoolId}${path}`, {
      ...opts,
      signal: events.signal,
    });
  async function load() {
    const data = await request(`/evidence?${query()}`);
    if (disposed) return;
    groups = data.groups;
    status.textContent = data.truncated
      ? "Dữ liệu đã giới hạn 5.000 câu. Chưa phản ánh toàn bộ lịch sử."
      : "Chỉ dùng câu đã chấm; không suy luận năng lực từ thời gian online.";
    container.querySelector("[data-evidence-results]").innerHTML =
      groups
        .map(
          (g) =>
            `<article class="upgrade-list-item"><h3>${e(g.topic)} · ${e(g.studentName)}</h3><p>${g.observations} câu độc lập · ${g.attempts} lượt đánh giá · sai ${g.errorRate}%</p><strong>${{ insufficient: "Thiếu dữ liệu", preliminary: "Có cơ sở sơ bộ", extended: "Có thêm cơ sở" }[g.dataLevel]}</strong><p>${e(g.note)}</p><details><summary>Mở bằng chứng từng câu</summary>${g.evidence.map((r) => `<div class="upgrade-evidence"><strong>Câu ${Number(r.position) + 1} · bài ${r.assignment_id}</strong><p>${e(r.stem || "Nội dung câu chưa có trong snapshot")}</p><p>Bài làm: ${e(r.response)}</p><p>${r.correct ? "Đúng" : "Sai"} · ${new Date(r.submitted_at).toLocaleDateString("vi-VN")}</p></div>`).join("")}</details>${data.staff && g.dataLevel !== "insufficient" && g.errorRate >= 40 ? btn("Đề xuất nhóm cùng chuyên đề", `data-propose-topic="${g.topicId}"`) : ""}</article>`,
        )
        .join("") || "<p>Chưa có bằng chứng câu đã chấm trong phạm vi này.</p>";
    if (data.staff) await drafts();
  }
  async function drafts() {
    const r = await request(`/interventions?${query()}`);
    if (disposed) return;
    container.querySelector("[data-intervention-drafts]").innerHTML =
      `<h3>Giáo viên duyệt trước khi giao</h3>${r.drafts.map((d) => `<article class="upgrade-list-item"><h4>${e(d.title)}</h4><p>Học sinh: ${d.student_ids.map(e).join(", ")} · câu hỏi: ${d.question_ids.map(e).join(", ")}</p><p>${d.status === "draft" ? "Bản nháp, chưa giao cho học sinh" : "Đã giao bài bổ trợ"}</p>${d.status === "draft" ? btn("Duyệt và giao bài", `data-approve-intervention="${d.id}"`) : `<p>Mã bài đã giao: ${d.assignment_ids.map(e).join(", ")}. Kết quả kiểm tra lại xuất hiện trong hệ thống bài tập hiện có.</p>`}</article>`).join("") || "<p>Chưa có nhóm đề xuất.</p>"}`;
  }
  container.addEventListener(
    "submit",
    (ev) => {
      ev.preventDefault();
      load().catch((err) => {
        if (!disposed) status.textContent = err.message;
      });
    },
    { signal: events.signal },
  );
  container.addEventListener(
    "click",
    (ev) => {
      const el = ev.target.closest("button");
      if (!el) return;
      const run = async () => {
        if (el.dataset.proposeTopic) {
          await request("/interventions", {
            method: "POST",
            body: { ...body(), topicId: Number(el.dataset.proposeTopic) },
          });
          await drafts();
          status.textContent =
            "Đã tạo đề xuất theo câu sai và chuyên đề. Chưa giao bài.";
        }
        if (
          el.dataset.approveIntervention &&
          confirm("Duyệt danh sách và giao bài bổ trợ cho nhóm học sinh này?")
        ) {
          await request(
            `/interventions/${el.dataset.approveIntervention}/approve`,
            { method: "POST", body: body() },
          );
          await drafts();
          status.textContent = "Đã giao bài qua hệ thống Bài được giao.";
        }
      };
      run().catch((err) => {
        if (!disposed) status.textContent = err.message;
      });
    },
    { signal: events.signal },
  );
  return () => {
    disposed = true;
    events.abort();
  };
}
