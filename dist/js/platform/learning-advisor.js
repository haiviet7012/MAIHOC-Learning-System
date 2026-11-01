import { escapeHTML as e } from "../ui.js";
import { api } from "./api.js";
const modes = {
  plan: "Thiết kế lộ trình học tập",
  evaluate: "Đánh giá lộ trình học tập",
  charts: "Biểu đồ tiến bộ",
};
const prompts = {
  plan: "Hãy thiết kế lộ trình học tập cá nhân dựa trên kết quả hiện tại và mục tiêu của tôi.",
  evaluate:
    "Hãy đánh giá lộ trình đã áp dụng, đối chiếu kết quả mới và đề xuất điều chỉnh.",
  charts: "Hãy giải thích biểu đồ tiến bộ và gợi ý việc cần ưu tiên tiếp theo.",
};
function lineChart(rows) {
  if (!rows.length)
    return "<p>Chưa có bài đã chấm trong khoảng thời gian này.</p>";
  const start = Date.parse(rows[0].date),
    end = Date.parse(rows.at(-1).date),
    width = 560;
  const points = rows.map((r) => ({
    x:
      end === start
        ? 320
        : 40 + ((Date.parse(r.date) - start) / (end - start)) * width,
    y: 200 - r.percent * 1.7,
    r,
  }));
  const path = points.map((p) => `${p.x},${p.y}`).join(" ");
  return `<svg viewBox="0 0 640 260" role="img" aria-label="Điểm trung bình theo ngày trên thang 10"><line x1="40" y1="200" x2="600" y2="200" stroke="#d4d4d4"/><text x="5" y="35">10</text><text x="15" y="200">0</text><polygon points="${points[0].x},200 ${path} ${points.at(-1).x},200" fill="#fde1df"/><polyline points="${path}" fill="none" stroke="#d93431" stroke-width="3"/>${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="white" stroke="#d93431" stroke-width="3"><title>${e(p.r.date)}: ${(p.r.percent / 10).toFixed(2)}/10 · ${p.r.count} bài</title></circle>`).join("")}<text x="40" y="235">${e(rows[0].date)}</text><text x="600" y="235" text-anchor="end">${e(rows.at(-1).date)}</text></svg>`;
}
function radarChart(rows, previous = []) {
  if (rows.length < 3)
    return "<p>Cần ít nhất 3 môn có điểm để vẽ radar. Bảng dữ liệu bên dưới vẫn hiển thị đầy đủ.</p>";
  const axes = rows.slice(0, 8),
    n = axes.length,
    center = 180,
    radius = 112;
  const point = (i, ratio) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return `${center + Math.cos(a) * radius * ratio},${center + Math.sin(a) * radius * ratio}`;
  };
  const ring = (ratio) => axes.map((_, i) => point(i, ratio)).join(" ");
  const older = axes.map((r) => previous.find((p) => p.subject === r.subject));
  return `<svg viewBox="0 0 360 360" role="img" aria-label="Radar kết quả theo môn, thang 100">${[0.25, 0.5, 0.75, 1].map((r) => `<polygon points="${ring(r)}" fill="none" stroke="#d5e8db"/>`).join("")}${axes.map((_, i) => `<line x1="180" y1="180" x2="${point(i, 1).split(",")[0]}" y2="${point(i, 1).split(",")[1]}" stroke="#e2ece5"/>`).join("")}${older.every(Boolean) ? `<polygon points="${older.map((r, i) => point(i, r.percent / 100)).join(" ")}" fill="none" stroke="#687d91" stroke-dasharray="5 4" stroke-width="2"/>` : ""}<polygon points="${axes.map((r, i) => point(i, r.percent / 100)).join(" ")}" fill="#26974c26" stroke="#26974c" stroke-width="3"/>${axes
    .map((r, i) => {
      const [x, y] = point(i, 1.34).split(",");
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="11">${e(r.subject.slice(0, 18))}<tspan x="${x}" dy="15">${r.percent}/100</tspan></text>`;
    })
    .join(
      "",
    )}</svg><p class="muted tiny">Tối đa 8 môn trên radar. ${older.every(Boolean) ? "Nét đứt: ngày có kết quả liền trước." : "Môn chưa có điểm không được gán bằng 0."}</p>`;
}
function mountAdvisorContent(
  container,
  { scope = "learning", schoolId = null } = {},
) {
  const controller = new AbortController();
  let days = 30,
    selectedDay = "",
    state = null,
    busy = false,
    mode = "plan";
  const url = (path) =>
    `/api/learning-advisor${path}?scope=${scope}${schoolId ? `&schoolId=${encodeURIComponent(schoolId)}` : ""}&days=${days}`;
  const request = (path, options = {}) =>
    api(url(path), { ...options, signal: controller.signal });
  container.innerHTML =
    '<section class="portal-panel advisor"><h2>Cố vấn học tập AI</h2><p role="status">Đang kết nối dữ liệu học tập…</p></section>';
  function charts() {
    const { data } = state,
      daily = data.daily,
      selected = selectedDay
        ? data.radarDaily?.find((r) => r.date === selectedDay)
        : null;
    const radar = selected?.subjects || data.radar;
    const dates = data.radarDaily || [],
      idx = dates.findIndex((d) => d.date === selectedDay),
      previous = idx > 0 ? dates[idx - 1].subjects : [];
    return `<div class="advisor-charts">${scope === "school" ? `<article class="advisor-chart"><h3>Kết quả qua từng ngày</h3>${lineChart(daily)}<p>Điểm đã chuẩn hóa về thang 10 · ${data.observations} lượt làm bài</p></article>` : ""}<article class="advisor-chart"><h3>Bản đồ kết quả theo môn</h3><label>Ngày so sánh<select data-advisor-day><option value="">Toàn khoảng thời gian</option>${dates.map((d) => `<option ${selectedDay === d.date ? "selected" : ""}>${e(d.date)}</option>`).join("")}</select></label>${radarChart(radar, previous)}</article></div><details><summary>Xem số liệu và hoạt động từng ngày</summary><div class="timetable-scroll"><table><caption>Kết quả bài làm đã chấm</caption><thead><tr><th>Ngày</th><th>Điểm /10</th><th>Số bài</th></tr></thead><tbody>${daily.map((r) => `<tr><td>${e(r.date)}</td><td>${(r.percent / 10).toFixed(2)}</td><td>${r.count}</td></tr>`).join("") || '<tr><td colspan="3">Chưa có dữ liệu.</td></tr>'}</tbody></table><table><caption>Kết quả theo môn trong khoảng đang xem</caption><thead><tr><th>Môn</th><th>Kết quả /100</th><th>Số bài</th></tr></thead><tbody>${radar.map((r) => `<tr><td>${e(r.subject)}</td><td>${r.percent}</td><td>${r.count}${r.count < 5 ? " · Mẫu còn ít" : ""}</td></tr>`).join("") || '<tr><td colspan="3">Chưa đủ dữ liệu.</td></tr>'}</tbody></table>${scope === "learning" ? `<p>Thay đổi tiến trình học liệu: ${data.activity.map((r) => `${e(r.date)}: ${r.count} sự kiện`).join(" · ") || "Chưa có sự kiện trong khoảng này."}</p>` : ""}</div></details><p class="muted tiny">${e(data.note)}</p>`;
  }
  function roadmapMarkup(roadmap) {
    const { plan } = roadmap;
    return `<article class="advisor-plan"><h3>${roadmap.applied_at ? "Lộ trình đã áp dụng" : "Lộ trình đề xuất"}</h3><p>${e(plan.goal || "Mục tiêu học tập cá nhân")} · ${plan.minutesPerDay} phút/ngày</p>${roadmap.applied_at ? `<p class="muted">Ngày 1: ${e(new Date(roadmap.applied_at).toLocaleDateString("vi-VN"))}. Đánh dấu dưới đây là học sinh tự xác nhận.</p>` : `<button type="button" class="button primary" data-advisor-apply="${e(roadmap.id)}">Áp dụng lộ trình</button>`}<ol>${plan.tasks.map((t, i) => `<li><label><input type="checkbox" data-advisor-task="${i}" data-plan="${e(roadmap.id)}" ${t.done ? "checked" : ""} ${roadmap.applied_at ? "" : "disabled"}> <strong>Ngày ${t.day} · ${e(t.subject)}</strong> — ${e(t.title)} (${t.minutes} phút)</label></li>`).join("")}</ol></article>`;
  }
  function render() {
    if (controller.signal.aborted) return;
    const draft = state.roadmaps.find((p) => !p.applied_at),
      applied = state.roadmaps
        .filter((p) => p.applied_at)
        .sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at))[0];
    container.innerHTML = `<section class="portal-panel advisor"><div class="advisor-heading"><div><p class="eyebrow">MAIHOC · ${scope.toUpperCase()}</p><h2>Cố vấn học tập AI</h2><p>Lộ trình của bạn, dựa trên việc học thực tế.</p></div><label>Khoảng thời gian<select data-advisor-days>${[7, 30, 90].map((n) => `<option value="${n}" ${days === n ? "selected" : ""}>${n} ngày</option>`).join("")}</select></label></div><div class="advisor-options">${Object.entries(
      modes,
    )
      .map(
        ([key, label]) =>
          `<button type="button" class="button ${mode === key ? "primary" : "secondary"}" data-advisor-mode="${key}" aria-pressed="${mode === key}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div data-advisor-charts>${charts()}</div><div class="advisor-workspace"><div><div class="advisor-chat" role="log" aria-label="Hội thoại Cố vấn học tập">${state.messages.length ? state.messages.map((m) => `<article class="advisor-message ${m.role === "user" ? "advisor-user" : ""}"><strong>${m.role === "user" ? "Bạn" : "Cố vấn học tập"}</strong><p>${e(m.content)}</p></article>`).join("") : "<p>Chọn một chức năng, bổ sung mục tiêu và gửi yêu cầu. Cố vấn chỉ hỗ trợ học tập.</p>"}</div><form data-advisor-form><label>Mục tiêu học tập<input name="goal" maxlength="500" placeholder="Ví dụ: đạt 8 điểm Toán trong 4 tuần"></label><label>Thời gian học mỗi ngày (phút)<input name="minutes" type="number" min="10" max="240" value="45" required></label><label>Trao đổi với cố vấn<textarea name="message" maxlength="4000" rows="3" required>${e(prompts[mode])}</textarea></label><div class="inline-actions"><button class="button primary" type="submit">${e(modes[mode])}</button><button class="button secondary" type="button" data-advisor-chat>Gửi câu hỏi học tập</button></div></form>${!state.aiConfigured ? "<p>Chưa cấu hình API riêng. Bạn vẫn xem được biểu đồ và lộ trình đã lưu.</p>" : ""}<p data-advisor-status role="status" aria-live="polite"></p></div><aside>${draft ? roadmapMarkup(draft) : ""}${applied ? roadmapMarkup(applied) : "<p>Chưa có lộ trình đang áp dụng.</p>"}</aside></div></section>`;
  }
  async function load() {
    state = await request("/");
    render();
  }
  const status = (message) => {
    const el = container.querySelector("[data-advisor-status]");
    if (el) el.textContent = message;
  };
  async function send(chat = false) {
    if (busy) return;
    const form = container.querySelector("form");
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    busy = true;
    container
      .querySelectorAll("button,input,select,textarea")
      .forEach((el) => (el.disabled = true));
    status("Cố vấn đang phân tích dữ liệu…");
    try {
      const answer = await request("/chat", {
        method: "POST",
        body: {
          ...fields,
          minutes: Number(fields.minutes),
          mode: chat ? "chat" : mode,
        },
      });
      if (controller.signal.aborted) return;
      state.messages.push(
        { role: "user", content: fields.message },
        { role: "model", content: answer.reply },
      );
      if (answer.roadmap) state.roadmaps.unshift(answer.roadmap);
      render();
      const nextForm = container.querySelector("form");
      nextForm.elements.goal.value = fields.goal;
      nextForm.elements.minutes.value = fields.minutes;
      container.querySelector(".advisor-chat").scrollTop =
        container.querySelector(".advisor-chat").scrollHeight;
    } catch (error) {
      if (!controller.signal.aborted) status(error.message);
    } finally {
      busy = false;
      if (!controller.signal.aborted)
        container
          .querySelectorAll("button,input,select,textarea")
          .forEach((el) => {
            if (
              !el.matches("[data-advisor-task]") ||
              state.roadmaps.find((p) => p.id === el.dataset.plan)?.applied_at
            )
              el.disabled = false;
          });
    }
  }
  container.addEventListener(
    "submit",
    (event) => {
      if (event.target.matches("[data-advisor-form]")) {
        event.preventDefault();
        send();
      }
    },
    { signal: controller.signal },
  );
  container.addEventListener(
    "click",
    async (event) => {
      if (busy) return;
      const choice = event.target.closest("[data-advisor-mode]");
      if (choice) {
        const f = container.querySelector("form"),
          goal = f.elements.goal.value,
          minutes = f.elements.minutes.value;
        mode = choice.dataset.advisorMode;
        render();
        container.querySelector("form").elements.goal.value = goal;
        container.querySelector("form").elements.minutes.value = minutes;
        return;
      }
      if (event.target.closest("[data-advisor-chat]")) {
        send(true);
        return;
      }
      const apply = event.target.closest("[data-advisor-apply]");
      if (apply) {
        busy = true;
        apply.disabled = true;
        try {
          await request(`/roadmaps/${apply.dataset.advisorApply}`, {
            method: "POST",
            body: { action: "apply" },
          });
          await load();
        } catch (error) {
          status(error.message);
          apply.disabled = false;
        } finally {
          busy = false;
        }
      }
    },
    { signal: controller.signal },
  );
  container.addEventListener(
    "change",
    async (event) => {
      const target = event.target;
      if (busy) return;
      if (target.matches("[data-advisor-day]")) {
        selectedDay = target.value;
        container.querySelector("[data-advisor-charts]").innerHTML = charts();
        return;
      }
      if (target.matches("[data-advisor-days]")) {
        days = Number(target.value);
        selectedDay = "";
        busy = true;
        try {
          await load();
        } catch (error) {
          status(error.message);
        } finally {
          busy = false;
        }
        return;
      }
      if (target.matches("[data-advisor-task]")) {
        busy = true;
        target.disabled = true;
        try {
          const { roadmap } = await request(
            `/roadmaps/${target.dataset.plan}`,
            {
              method: "POST",
              body: {
                action: "task",
                index: Number(target.dataset.advisorTask),
                done: target.checked,
              },
            },
          );
          state.roadmaps = state.roadmaps.map((p) =>
            p.id === roadmap.id ? roadmap : p,
          );
        } catch (error) {
          target.checked = !target.checked;
          status(error.message);
        } finally {
          busy = false;
          target.disabled = false;
        }
      }
    },
    { signal: controller.signal },
  );
  load().catch((error) => {
    if (!controller.signal.aborted)
      container.innerHTML = `<section class="portal-panel advisor"><h2>Cố vấn học tập AI</h2><p role="status">${e(error.message)}</p></section>`;
  });
  return () => controller.abort();
}

export function mountLearningAdvisor(container, options = {}) {
  const controller = new AbortController();
  const host = document.createElement('div'); host.className = 'advisor-drawer-host';
  const panelId = `advisor-panel-${Math.random().toString(36).slice(2)}`;
  host.innerHTML = `<button type="button" class="advisor-pull" aria-expanded="false" aria-controls="${panelId}" aria-label="Mở Cố vấn học tập"><span aria-hidden="true">&lt;</span></button><aside id="${panelId}" class="advisor-drawer" aria-label="Cố vấn học tập" inert><button type="button" class="advisor-dismiss" aria-label="Đóng Cố vấn học tập">×</button><div class="advisor-drawer-content"></div></aside>`;
  document.body.append(host);
  const pull = host.querySelector('.advisor-pull'), panel = host.querySelector('.advisor-drawer');
  let dispose = null;
  function toggle(open) {
    host.classList.toggle('is-open', open); panel.inert = !open;
    pull.setAttribute('aria-expanded', String(open));
    if (open) { dispose ||= mountAdvisorContent(host.querySelector('.advisor-drawer-content'), options); host.querySelector('.advisor-dismiss').focus(); }
    else pull.focus();
  }
  pull.addEventListener('click', () => toggle(!host.classList.contains('is-open')), { signal: controller.signal });
  host.querySelector('.advisor-dismiss').addEventListener('click', () => toggle(false), { signal: controller.signal });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && host.classList.contains('is-open')) toggle(false); }, { signal: controller.signal });
  return () => { controller.abort(); dispose?.(); host.remove(); };
}
