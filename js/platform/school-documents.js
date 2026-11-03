import { escapeHTML as e } from "../ui.js";
import { btn, field, upgradeApi } from "./school-upgrade.js";
export function mountSchoolDocuments(
  container,
  { schoolId, kind, request, report, onNavigate, caps },
) {
  let disposed = false,
    job = null,
    timer,
    sourceUrl = null;
  const events = new AbortController();
  container.innerHTML = `<div class="upgrade-document-grid"><section class="portal-panel"><h2>${kind === "notebook" ? "Thêm trang vở" : "Nhập đề hoặc đáp án"}</h2><p>${caps.documentAi ? "Ảnh hoặc PDF tối đa 10 MB, 20 trang. AI đọc xong cần đối chiếu." : "Chưa cấu hình AI tài liệu. Có thể nhập bản chép thủ công để thử quy trình."}</p><form data-doc-upload class="upgrade-form">${field("title", "Tên tài liệu")}${field("subject", "Môn học", '<select name="subject"><option>Toán</option><option>Vật lý</option><option>Hóa học</option><option>Tiếng Anh</option><option>Ngữ văn</option><option>Sinh học</option></select>')}${kind === "notebook" ? '<input type="hidden" name="kind" value="notebook">' : field("kind", "Loại bản gốc", '<select name="kind"><option value="exam">Đề bài</option><option value="answers">Đáp án</option></select>')}${field("file", "Ảnh / PDF", '<input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf">')}<details><summary>Nhập nội dung thủ công khi không dùng AI</summary><p>Nhập nội dung để tạo bản nháp. Đề: mỗi câu cách nhau một dòng trống. Đáp án: mỗi dòng ghi số câu | đáp án.</p><textarea name="manualText" aria-label="Nội dung bản chép" rows="8" placeholder="Nhập nội dung bạn muốn đối chiếu…"></textarea></details><button class="button primary" type="submit">Thêm tài liệu</button></form><h2>Tài liệu của bạn</h2><div data-doc-list></div></section><section class="portal-panel"><div data-doc-editor><h2>Đối chiếu bản đọc</h2><p>Chọn một tài liệu để xem bản gốc, sửa nội dung và xuất PDF.</p></div></section></div>`;
  const list = container.querySelector("[data-doc-list]"),
    editor = container.querySelector("[data-doc-editor]");
  async function refresh() {
    const data = await request(`/documents?schoolId=${schoolId}`);
    if (disposed) return;
    list.innerHTML =
      data.jobs
        .filter((j) =>
          kind === "notebook"
            ? j.kind.startsWith("notebook")
            : ["exam", "answers"].includes(j.kind),
        )
        .map(
          (j) =>
            `<article class="upgrade-list-item">${btn(e(j.title), `data-doc-open="${j.id}"`)}<small>${e(j.kind)} · ${e(j.status)}</small></article>`,
        )
        .join("") || "<p>Chưa có tài liệu.</p>";
  }
  function releaseSource() {
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
      sourceUrl = null;
    }
  }
  async function open(id) {
    clearTimeout(timer);
    const current = await request(`/documents/${id}`);
    if (disposed) return;
    job = current;
    releaseSource();
    report("");
    if (["queued", "running"].includes(job.status)) {
      editor.innerHTML = `<h2>${e(job.title)}</h2><p role="status">${job.status === "queued" ? "Đang chờ worker xử lý tài liệu." : "AI đang đọc tài liệu…"}</p><p>Có thể rời trang và mở lại tài liệu sau.</p>`;
      timer = setTimeout(
        () => open(id).catch((err) => report(err.message)),
        2500,
      );
      return;
    }
    if (job.status === "failed") {
      editor.innerHTML = `<h2>${e(job.title)}</h2><p role="alert">${e(job.error)}</p><p>Tải lại tệp với bản rõ hơn hoặc kiểm tra cấu hình AI. Tệp cũ vẫn giữ trong hồ sơ.</p>${btn("Xóa tài liệu lỗi", "data-doc-delete")}`;
      return;
    }
    let inner = "";
    if (job.kind === "notebook")
      inner = `<label>Bản chép cần xác nhận<textarea name="transcript" rows="14" maxlength="24000">${e(job.result.transcript)}</textarea></label>${(job.result.warnings || []).map((w) => `<p class="upgrade-warning">${e(w)}</p>`).join("")}`;
    else if (job.kind === "notebook_feedback")
      inner = `<p>Phản hồi AI, chưa phải điểm chính thức.</p><p class="upgrade-pre">${e(job.result.summary)}</p>${job.result.feedback.map((f) => `<article class="upgrade-list-item"><strong>${e(f.original)}</strong><p>${e(f.error)}</p><p>${e(f.explanation)}</p><p>${e(f.suggestion)}</p></article>`).join("")}`;
    else
      inner = `${(job.result.matchWarnings || []).map((w) => `<p class="upgrade-warning">${e(w)}</p>`).join("")}${job.result.items.map((q, i) => `<fieldset data-doc-item="${i}"><legend>Câu ${e(q.label)} · trang ${q.page}</legend>${field("label", "Số câu", `<input name="label" value="${e(q.label)}" required maxlength="80">`)}${field("section", "Phần", `<input name="section" value="${e(q.section)}" maxlength="100">`)}${job.kind === "exam" ? `<label>Nội dung<textarea name="stem" rows="4" required maxlength="8000">${e(q.stem)}</textarea></label><label>Lựa chọn (mỗi dòng một mục)<textarea name="choices" rows="3">${e(q.choices.join("\n"))}</textarea></label>` : ""}<label>Đáp án nguồn<textarea name="answer" rows="2" maxlength="8000">${e(q.answer)}</textarea></label>${q.warning ? `<p class="upgrade-warning">${e(q.warning)}</p>` : ""}</fieldset>`).join("")}`;
    editor.innerHTML = `<h2>${e(job.title)}</h2><p>${e(job.subject)} · ${e(job.status)} · v${job.revision}</p>${job.source_key ? "<details open><summary>Bản gốc để đối chiếu</summary><div data-doc-source>Đang tải bản gốc…</div></details>" : ""}<form data-doc-review class="upgrade-form">${inner}${job.kind !== "notebook_feedback" ? '<label class="upgrade-check"><input name="confirmed" type="checkbox"> Tôi đã đối chiếu và xác nhận bản đọc, kể cả các vùng cảnh báo.</label><button class="button primary" type="submit">Lưu bản đối chiếu</button>' : ""}</form><div class="upgrade-actions">${btn("Xuất PDF", 'data-doc-pdf="questions"')}${job.kind === "exam" ? btn("PDF đáp án", 'data-doc-pdf="answers"') + btn("PDF đề và đáp án", 'data-doc-pdf="complete"') : ""}${btn("Xóa tài liệu", "data-doc-delete")}</div><div data-doc-extra></div>`;
    if (job.kind === "exam") {
      const all = await request(`/documents?schoolId=${schoolId}`);
      if (disposed || job.id !== id) return;
      editor.querySelector("[data-doc-extra]").innerHTML =
        `<form data-doc-match class="upgrade-form"><h3>Ghép đáp án vào từng câu</h3><label>Bản đáp án<select name="answerId" required><option value="">Chọn đáp án đã đọc</option>${all.jobs
          .filter(
            (j) =>
              j.kind === "answers" &&
              ["ready", "needs_review"].includes(j.status),
          )
          .map((j) => `<option value="${j.id}">${e(j.title)}</option>`)
          .join(
            "",
          )}</select></label><button class="button secondary">Ghép và đối chiếu</button></form><details><summary>Giáo viên: đưa vào ngân hàng câu hỏi</summary><form data-doc-publish class="upgrade-form"><label>Mã chuyên đề trong ngân hàng câu hỏi<input name="topicId" type="number" min="1" required></label><p>Đề đã xác nhận sẽ được đưa vào kho dưới dạng nháp, chờ duyệt. Đáp án trắc nghiệm dùng A/B/C… hoặc vị trí 0, 1…</p><button class="button secondary">Tạo câu hỏi nháp</button></form></details>`;
    } else if (job.kind === "notebook")
      editor.querySelector("[data-doc-extra]").innerHTML =
        `<form data-doc-feedback class="upgrade-form"><label>Chế độ gia sư<select name="mode"><option value="hint">Gợi mở</option><option value="check">Sửa từng bước</option><option value="solve">Giải chi tiết</option></select></label><button class="button primary">Phân tích bản chép đã xác nhận</button></form>${btn("Chat với gia sư", "data-doc-tutor")}`;
    if (job.source_key) {
      const response = await fetch(`${upgradeApi}/documents/${id}/source`, {
        credentials: "same-origin",
        signal: events.signal,
      });
      if (!response.ok) throw new Error("Không tải được bản gốc.");
      const blob = await response.blob();
      if (disposed || job.id !== id) return;
      sourceUrl = URL.createObjectURL(blob);
      editor.querySelector("[data-doc-source]").innerHTML =
        job.source_type === "application/pdf"
          ? `<iframe class="upgrade-source" title="PDF bản gốc" src="${sourceUrl}"></iframe>`
          : `<img class="upgrade-source" alt="Trang tài liệu gốc" src="${sourceUrl}">`;
    }
  }
  container.addEventListener(
    "submit",
    (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const run = async () => {
        const submit = form.querySelector('button[type="submit"],button');
        if (submit) submit.disabled = true;
        try {
          if (form.matches("[data-doc-upload]")) {
            const data = new FormData(form);
            data.set("schoolId", schoolId);
            data.set("requestKey", crypto.randomUUID());
            if (!data.get("file")?.size) {
              data.delete("file");
              const text = String(data.get("manualText") || "").trim();
              if (!text)
                throw new Error("Tải tệp hoặc nhập nội dung bản chép.");
              const type = data.get("kind");
              const result =
                type === "notebook"
                  ? { transcript: text, warnings: [] }
                  : type === "answers"
                    ? {
                        items: text
                          .split("\n")
                          .filter((x) => x.trim())
                          .map((line) => {
                            const [label, ...answer] = line.split("|");
                            return {
                              label: label.trim(),
                              section: "",
                              answer: answer.join("|").trim(),
                              page: 1,
                            };
                          }),
                      }
                    : {
                        items: text
                          .split(/\n\s*\n/)
                          .filter((x) => x.trim())
                          .map((stem, i) => ({
                            label: String(i + 1),
                            section: "",
                            stem: stem.trim(),
                            choices: [],
                            answer: "",
                            page: 1,
                            warning: "",
                          })),
                      };
              data.set("content", JSON.stringify(result));
            }
            data.delete("manualText");
            const r = await fetch(upgradeApi + "/documents", {
              method: "POST",
              credentials: "same-origin",
              body: data,
              signal: events.signal,
            });
            const body = await r.json();
            if (!r.ok) throw new Error(body.error);
            await refresh();
            await open(body.id);
          }
          if (form.matches("[data-doc-review]")) {
            const result =
              job.kind === "notebook"
                ? { ...job.result, transcript: form.elements.transcript.value }
                : {
                    items: [...form.querySelectorAll("[data-doc-item]")].map(
                      (f, i) => ({
                        ...job.result.items[i],
                        label: f.elements.label.value,
                        section: f.elements.section.value,
                        answer: f.elements.answer.value,
                        ...(job.kind === "exam"
                          ? {
                              stem: f.elements.stem.value,
                              choices: f.elements.choices.value
                                .split("\n")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            }
                          : {}),
                      }),
                    ),
                  };
            await request(`/documents/${job.id}`, {
              method: "PATCH",
              body: {
                result,
                revision: job.revision,
                confirmed: form.elements.confirmed.checked,
              },
            });
            await refresh();
            await open(job.id);
            report("Đã lưu bản đối chiếu.");
          }
          if (form.matches("[data-doc-match]")) {
            await request(`/documents/${job.id}/match`, {
              method: "POST",
              body: { answerId: form.elements.answerId.value },
            });
            await open(job.id);
          }
          if (form.matches("[data-doc-feedback]")) {
            const r = await request(`/documents/${job.id}/feedback`, {
              method: "POST",
              body: {
                mode: form.elements.mode.value,
                requestKey: crypto.randomUUID(),
              },
            });
            await refresh();
            await open(r.id);
          }
          if (form.matches("[data-doc-publish]")) {
            await request(`/documents/${job.id}/publish`, {
              method: "POST",
              body: { topicId: Number(form.elements.topicId.value) },
            });
            report("Đã tạo câu hỏi nháp. Mở Ngân hàng câu hỏi để duyệt.");
          }
        } finally {
          if (submit && submit.isConnected) submit.disabled = false;
        }
      };
      run().catch((err) => {
        if (!disposed) report(err.message);
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
        if (el.dataset.docOpen) await open(el.dataset.docOpen);
        if (el.hasAttribute("data-doc-tutor")) {
          sessionStorage.setItem(
            "maihoc:ai-author-draft",
            `Hãy hỗ trợ bài ${job.subject} từ bản chép tôi đã xác nhận:\n${job.result.transcript}`,
          );
          onNavigate("ai-solver");
        }
        if (
          el.hasAttribute("data-doc-delete") &&
          confirm("Xóa tài liệu và bản phản hồi liên quan?")
        ) {
          await request(`/documents/${job.id}`, { method: "DELETE" });
          job = null;
          releaseSource();
          editor.innerHTML = "<p>Đã xóa tài liệu.</p>";
          await refresh();
        }
        if (el.dataset.docPdf) {
          const r = await fetch(
            `${upgradeApi}/documents/${job.id}/pdf?mode=${el.dataset.docPdf}`,
            { credentials: "same-origin", signal: events.signal },
          );
          if (!r.ok) throw new Error((await r.json()).error);
          const url = URL.createObjectURL(await r.blob()),
            a = document.createElement("a");
          a.href = url;
          a.download = `MAIHOC-${job.kind}-${el.dataset.docPdf}.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      };
      run().catch((err) => {
        if (!disposed) report(err.message);
      });
    },
    { signal: events.signal },
  );
  refresh().catch((err) => report(err.message));
  return () => {
    disposed = true;
    events.abort();
    clearTimeout(timer);
    releaseSource();
  };
}
