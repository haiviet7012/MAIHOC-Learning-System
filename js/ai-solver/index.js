import { escapeHTML } from "../ui.js";

const SUBJECTS = [
  ["Toán", "∑"], ["Tiếng Anh", "文"], ["Vật lý", "⚡"], ["Hóa học", "⚗️"],
  ["Ngữ văn", "✍️"], ["Sinh học", "🧬"], ["Đề thi THPT quốc gia", "🎓"], ["IELTS", "🌐"]
];

export function mountUniversalAiSolver(container, { onNavigate } = {}) {
  let selectedImage = null;
  let selectedFile = null;
  let activeController = null;
  let destroyed = false;

  const render = () => {
    container.innerHTML = `
      <section class="universal-ai-page">
        <header class="universal-ai-header">
          <div>
            <button type="button" class="button secondary small" data-ai-back>← Về trang học tập</button>
            <p class="eyebrow">TRỢ LÝ HỌC TẬP ĐA MÔN</p>
            <h1>AI Giải bài tập</h1>
            <p class="muted">Giải nhanh hoặc phân tích chi tiết đề bài từ văn bản, ảnh chụp và PDF.</p>
          </div>
          <span class="universal-ai-chip">✨ MAI HỌC AI</span>
        </header>
        <div class="universal-ai-layout">
          <section class="solver-panel universal-ai-input-panel">
            <h2>🤖 Nhập đề bài</h2>
            <p class="solver-help">Chọn môn học, nhập nội dung đề hoặc đính kèm một tệp để bắt đầu.</p>
            <label class="universal-ai-field">Môn học
              <select class="universal-ai-subject">
                ${SUBJECTS.map(([name]) => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("")}
              </select>
            </label>
            <label class="universal-ai-field">Nội dung đề bài
              <textarea class="solver-textarea universal-ai-prompt" maxlength="18000" placeholder="Nhập hoặc dán câu hỏi, nhiều câu hỏi hay đề bài tại đây…"></textarea>
            </label>
            <div class="universal-ai-upload-grid">
              <label class="solver-dropzone universal-ai-upload" data-ai-image-zone>
                <input class="universal-ai-image" type="file" accept="image/png,image/jpeg,image/webp" hidden>
                <span class="universal-ai-upload-icon">🖼️</span>
                <strong>Chọn ảnh đề bài</strong>
                <span class="solver-help">PNG, JPG, WebP · tối đa 20 MB</span>
                <span class="universal-ai-file-name" data-ai-image-name>Chưa chọn ảnh</span>
              </label>
              <label class="solver-dropzone universal-ai-upload" data-ai-pdf-zone>
                <input class="universal-ai-pdf" type="file" accept="application/pdf,.pdf" hidden>
                <span class="universal-ai-upload-icon">📄</span>
                <strong>Chọn tệp PDF</strong>
                <span class="solver-help">Tối đa 20 MB, 80 trang</span>
                <span class="universal-ai-file-name" data-ai-pdf-name>Chưa chọn tệp</span>
              </label>
            </div>
            <div class="universal-ai-mode">
              <span>Chế độ giải</span>
              <div role="group" aria-label="Chế độ giải" class="universal-ai-mode-switch">
                <button type="button" class="is-active" data-ai-mode="quick" aria-pressed="true">⚡ Giải nhanh</button>
                <button type="button" data-ai-mode="detailed" aria-pressed="false">📝 Giải chi tiết</button>
              </div>
            </div>
            <div class="universal-ai-actions">
              <button type="button" class="button primary" data-ai-submit>✨ Bắt đầu giải</button>
              <button type="button" class="button secondary" data-ai-cancel hidden>Hủy</button>
              <button type="button" class="button secondary" data-ai-clear>Làm mới</button>
            </div>
            <p class="tiny muted universal-ai-note">Không cần chọn khối lớp. AI sẽ suy luận theo nội dung đề; hãy kiểm tra lại đáp án quan trọng với tài liệu học tập.</p>
          </section>
          <section class="solution-panel universal-ai-result-panel" aria-live="polite">
            <div class="universal-ai-empty">
              <div class="universal-ai-empty-icon">🧪</div>
              <h2>Chưa có lời giải</h2>
              <p>Chọn môn học, nhập đề bài hoặc tải ảnh/PDF lên rồi nhấn “Bắt đầu giải”.</p>
            </div>
            <div class="universal-ai-loading" hidden>
              <span class="spinner universal-ai-spinner"></span>
              <h2>AI đang phân tích đề bài…</h2>
              <p class="muted">Tệp PDF đang được trích xuất văn bản nếu có thể đọc được.</p>
            </div>
            <div class="universal-ai-error" role="alert" hidden></div>
            <article class="universal-ai-answer" hidden>
              <div class="universal-ai-answer-head"><span class="pill">✨ Lời giải AI</span><button class="button secondary small" type="button" data-ai-copy>Sao chép lời giải</button></div>
              <div class="universal-ai-answer-meta muted tiny" data-ai-meta></div>
              <div class="universal-ai-answer-content" data-ai-answer></div>
              <p class="tiny muted">Lời giải do AI hỗ trợ học tập; hãy đối chiếu khi đề bài có dữ kiện mờ, thiếu hoặc gây nhiều cách hiểu.</p>
            </article>
          </section>
        </div>
      </section>`;
    wireEvents();
  };

  function wireEvents() {
    const prompt = container.querySelector(".universal-ai-prompt");
    const imageInput = container.querySelector(".universal-ai-image");
    const pdfInput = container.querySelector(".universal-ai-pdf");
    const imageZone = container.querySelector("[data-ai-image-zone]");
    const pdfZone = container.querySelector("[data-ai-pdf-zone]");
    const submit = container.querySelector("[data-ai-submit]");
    const cancel = container.querySelector("[data-ai-cancel]");
    const clear = container.querySelector("[data-ai-clear]");
    const empty = container.querySelector(".universal-ai-empty");
    const loading = container.querySelector(".universal-ai-loading");
    const answer = container.querySelector(".universal-ai-answer");
    const errorBox = container.querySelector(".universal-ai-error");
    const modeButtons = [...container.querySelectorAll("[data-ai-mode]")];
    let mode = "quick";

    function readAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Không thể đọc tệp đã chọn."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.readAsDataURL(file);
      });
    }

    function setImage(file) {
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        errorBox.hidden = false;
        errorBox.textContent = "Ảnh phải ở định dạng PNG, JPG hoặc WebP.";
        imageInput.value = "";
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        errorBox.hidden = false;
        errorBox.textContent = "Ảnh quá lớn. Vui lòng chọn ảnh tối đa 20 MB.";
        imageInput.value = "";
        return;
      }
      selectedImage = file;
      selectedFile = null;
      pdfInput.value = "";
      container.querySelector("[data-ai-image-name]").textContent = file.name;
      container.querySelector("[data-ai-pdf-name]").textContent = "Chưa chọn tệp";
      errorBox.hidden = true;
    }

    function setPdf(file) {
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        errorBox.hidden = false;
        errorBox.textContent = "Tệp đính kèm phải là PDF.";
        pdfInput.value = "";
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        errorBox.hidden = false;
        errorBox.textContent = "PDF quá lớn. Vui lòng chọn tệp tối đa 20 MB.";
        pdfInput.value = "";
        return;
      }
      selectedFile = file;
      selectedImage = null;
      imageInput.value = "";
      container.querySelector("[data-ai-pdf-name]").textContent = file.name;
      container.querySelector("[data-ai-image-name]").textContent = "Chưa chọn ảnh";
      errorBox.hidden = true;
    }

    imageZone.addEventListener("click", event => { if (!event.target.closest("input")) imageInput.click(); });
    pdfZone.addEventListener("click", event => { if (!event.target.closest("input")) pdfInput.click(); });
    for (const zone of [imageZone, pdfZone]) {
      zone.addEventListener("dragover", event => { event.preventDefault(); zone.classList.add("is-dragging"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));
      zone.addEventListener("drop", event => {
        event.preventDefault();
        zone.classList.remove("is-dragging");
        const file = event.dataTransfer?.files?.[0];
        if (zone === imageZone) setImage(file); else setPdf(file);
      });
      zone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); zone.click(); }
      });
    }
    imageInput.addEventListener("change", () => setImage(imageInput.files?.[0]));
    pdfInput.addEventListener("change", () => setPdf(pdfInput.files?.[0]));

    modeButtons.forEach(button => button.addEventListener("click", () => {
      mode = button.dataset.aiMode;
      modeButtons.forEach(item => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    }));

    submit.addEventListener("click", async () => {
      const text = prompt.value.trim();
      if (!text && !selectedImage && !selectedFile) {
        errorBox.hidden = false;
        errorBox.textContent = "Hãy nhập đề bài, chọn ảnh hoặc tải PDF lên.";
        return;
      }
      errorBox.hidden = true;
      answer.hidden = true;
      empty.hidden = true;
      loading.hidden = false;
      submit.disabled = true;
      cancel.hidden = false;
      activeController = new AbortController();
      try {
        const payload = new FormData();
        payload.set("prompt", text);
        payload.set("subject", container.querySelector(".universal-ai-subject").value);
        payload.set("mode", mode);
        if (selectedImage) payload.set("image", selectedImage, selectedImage.name);
        if (selectedFile) payload.set("file", selectedFile, selectedFile.name);
        const response = await fetch("/api/ai/solve", {
          method: "POST",
          credentials: "same-origin",
          body: payload,
          signal: activeController.signal
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Không thể giải bài lúc này.");
        if (destroyed) return;
        container.querySelector("[data-ai-meta]").textContent =
          `${result.solution.subject} · ${mode === "quick" ? "Giải nhanh" : "Giải chi tiết"} · ${result.solution.modelUsed}`;
        const answerNode = container.querySelector("[data-ai-answer]");
        answerNode.innerHTML = escapeHTML(result.solution.answer || "AI chưa trả về nội dung lời giải.").replace(/\\r?\\n/g, "<br>");
        answer.hidden = false;
        if (window.MathJax?.typesetPromise) {
          try { await window.MathJax.typesetPromise([answerNode]); }
          catch (mathError) { console.warn("MathJax could not typeset AI answer:", mathError); }
        }
      } catch (err) {
        if (destroyed) return;
        if (err.name === "AbortError") {
          empty.hidden = false;
          container.querySelector(".universal-ai-empty h2").textContent = "Đã hủy yêu cầu";
          container.querySelector(".universal-ai-empty p").textContent = "Bạn có thể chỉnh sửa đề bài và thử lại.";
        } else {
          errorBox.hidden = false;
          errorBox.textContent = err.message || "Không thể hoàn tất lời giải.";
        }
      } finally {
        if (!destroyed) {
          loading.hidden = true;
          submit.disabled = false;
          cancel.hidden = true;
          activeController = null;
        }
      }
    });

    cancel.addEventListener("click", () => activeController?.abort());
    clear.addEventListener("click", () => {
      activeController?.abort();
      prompt.value = "";
      selectedImage = null;
      selectedFile = null;
      imageInput.value = "";
      pdfInput.value = "";
      container.querySelector("[data-ai-image-name]").textContent = "Chưa chọn ảnh";
      container.querySelector("[data-ai-pdf-name]").textContent = "Chưa chọn tệp";
      container.querySelector("[data-ai-answer]").textContent = "";
      answer.hidden = true;
      errorBox.hidden = true;
      empty.hidden = false;
      container.querySelector(".universal-ai-empty h2").textContent = "Chưa có lời giải";
      container.querySelector(".universal-ai-empty p").textContent = "Chọn môn học, nhập đề bài hoặc tải ảnh/PDF lên rồi nhấn “Bắt đầu giải”.";
    });
    container.querySelector("[data-ai-copy]").addEventListener("click", async () => {
      const text = container.querySelector("[data-ai-answer]").textContent;
      try {
        await navigator.clipboard.writeText(text);
        container.querySelector("[data-ai-copy]").textContent = "Đã sao chép";
        window.setTimeout(() => { if (container.isConnected) container.querySelector("[data-ai-copy]").textContent = "Sao chép lời giải"; }, 1600);
      } catch {
        errorBox.hidden = false;
        errorBox.textContent = "Trình duyệt không cấp quyền sao chép. Bạn có thể chọn nội dung lời giải và sao chép thủ công.";
      }
    });
    container.querySelector("[data-ai-back]").addEventListener("click", () => {
      if (onNavigate) onNavigate("home");
      else window.dispatchEvent(new CustomEvent("maihoc-navigate", { detail: { route: "home" } }));
    });
  }

  render();
  return () => {
    destroyed = true;
    activeController?.abort();
    container.innerHTML = "";
  };
}
