/**
 * js/chemistry/ai-solver/solver-view.js
 * Quản lý giao diện và tương tác của AI Solver Hóa học
 */

import { renderSolutionHtml } from "./solution-renderer.js";

const SAMPLES = [
  {
    title: "Kim loại + Axit (Al + HCl)",
    text: "Hòa tan hoàn toàn 5.4 gam bột nhôm (Al) vào lượng dư dung dịch axit clohidric (HCl). Tính thể tích khí hiđro thoát ra ở điều kiện chuẩn (đkc: 25 °C, 1 bar)."
  },
  {
    title: "Cân bằng Oxi hóa - Khử",
    text: "Lập phương trình hóa học của phản ứng oxi hóa - khử sau theo phương pháp thăng bằng electron:\nFe3O4 + HNO3 -> Fe(NO3)3 + NO + H2O"
  },
  {
    title: "Tính pH dung dịch",
    text: "Trộn 100 mL dung dịch HCl 0.1 M với 100 mL dung dịch Ba(OH)2 0.075 M. Tính pH của dung dịch thu được sau khi phản ứng xảy ra hoàn toàn."
  },
  {
    title: "Thủy phân Este",
    text: "Cho 8.8 gam etyl axetat (CH3COOC2H5) tác dụng vừa đủ với 100 mL dung dịch NaOH 1 M, đun nóng. Sau khi phản ứng kết thúc, cô cạn dung dịch thu được bao nhiêu gam muối khan?"
  }
];

export function initChemistrySolver(container, { initialPrompt = "" } = {}) {
  let activeImageBase64 = null;
  let activeImageMime = null;
  let activeAbortController = null;

  function render() {
    container.innerHTML = `
      <div class="solver-container">
        <!-- Khung nhập đề (Trái) -->
        <section class="solver-panel">
          <h3>⚗️ Nhập đề bài Hóa học</h3>
          <p class="muted tiny" style="color:#94a3b8;">Dán nội dung đề, chọn bài mẫu nhanh hoặc tải ảnh đề thi.</p>

          <textarea class="solver-textarea" placeholder="Nhập câu hỏi, phương trình hoặc bài toán Hóa học cần giải tại đây...">${initialPrompt}</textarea>

          <div class="solver-samples">
            ${SAMPLES.map((s, idx) => `
              <button type="button" class="solver-sample-btn" data-sample-idx="${idx}">+ ${s.title}</button>
            `).join("")}
          </div>

          <label class="solver-dropzone" tabindex="0">
            <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" class="solver-file-input">
            <span>📷 Kéo thả ảnh đề bài vào đây (hoặc nhấn để chọn ảnh)</span>
            <div class="solver-dropzone-preview" hidden></div>
          </label>

          <div style="display:flex;gap:12px;margin-top:14px;">
            <label style="flex:1;font-size:12px;">Khối lớp:
              <select class="ptable-filter-select solver-grade-select" style="width:100%;margin-top:4px;">
                <option value="all">Tự động nhận diện</option>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </label>
            <label style="flex:1;font-size:12px;">Chế độ giải:
              <select class="ptable-filter-select solver-mode-select" style="width:100%;margin-top:4px;">
                <option value="detailed">Chi tiết từng bước</option>
                <option value="hint">Gợi ý phương pháp</option>
                <option value="concise">Đáp số nhanh</option>
              </select>
            </label>
          </div>

          <div style="display:flex;gap:10px;margin-top:18px;">
            <button type="button" class="button primary" id="btn-submit-solve" style="flex:1;">✨ Bắt đầu giải</button>
            <button type="button" class="button secondary" id="btn-cancel-solve" style="display:none;">Hủy</button>
            <button type="button" class="button secondary" id="btn-clear-solve">Làm mới</button>
          </div>
        </section>

        <!-- Khung hiển thị kết quả (Phải) -->
        <section class="solution-panel">
          <div class="solution-empty-state" style="text-align:center;padding:70px 20px;color:#94a3b8;">
            <div style="font-size:42px;margin-bottom:12px;">🧪</div>
            <h4 style="margin:0 0 8px;color:#e2e8f0;">Chưa có lời giải</h4>
            <p style="font-size:13px;max-width:340px;margin:0 auto;color:#94a3b8;">Nhập đề bài hoặc chọn câu hỏi mẫu bên trái, sau đó nhấn "Bắt đầu giải" để AI phân tích.</p>
          </div>
          <div class="solution-loading" style="display:none;text-align:center;padding:80px 20px;">
            <span class="spinner" style="width:32px;height:32px;border-width:3px;border-top-color:#38bdf8;"></span>
            <p style="margin-top:14px;color:#38bdf8;font-weight:600;">Gemini đang phân tích dữ kiện và lập phương trình cân bằng...</p>
          </div>
          <div class="solution-result-body"></div>
        </section>
      </div>
    `;

    wireEvents();
  }

  function wireEvents() {
    const textarea = container.querySelector(".solver-textarea");
    const fileInput = container.querySelector(".solver-file-input");
    const dropzone = container.querySelector(".solver-dropzone");
    const previewBox = container.querySelector(".solver-dropzone-preview");
    const btnSubmit = container.querySelector("#btn-submit-solve");
    const btnCancel = container.querySelector("#btn-cancel-solve");
    const btnClear = container.querySelector("#btn-clear-solve");
    const resultBody = container.querySelector(".solution-result-body");
    const emptyState = container.querySelector(".solution-empty-state");
    const loadingState = container.querySelector(".solution-loading");

    // Chọn câu mẫu nhanh
    container.querySelectorAll("[data-sample-idx]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.sampleIdx);
        textarea.value = SAMPLES[idx].text;
      });
    });

    // Kéo thả ảnh đề bài
    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("#btn-remove-img")) return;
      fileInput.click();
    });

    dropzone.addEventListener("dragover", e => {
      e.preventDefault();
      dropzone.style.borderColor = "#38bdf8";
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.style.borderColor = "";
    });

    dropzone.addEventListener("drop", e => {
      e.preventDefault();
      dropzone.style.borderColor = "";
      if (e.dataTransfer?.files?.[0]) {
        handleImage(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      handleImage(file);
    });

    function handleImage(file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.");
        return;
      }
      activeImageMime = file.type;
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        activeImageBase64 = dataUrl.split(",")[1];
        previewBox.hidden = false;
        previewBox.innerHTML = `
          <img src="${dataUrl}" alt="Ảnh đề bài">
          <button type="button" class="close-button" style="position:absolute;top:-8px;right:-8px;background:#ef4444;color:white;" id="btn-remove-img">×</button>
        `;
        previewBox.querySelector("#btn-remove-img")?.addEventListener("click", ev => {
          ev.stopPropagation();
          activeImageBase64 = null;
          activeImageMime = null;
          previewBox.hidden = true;
          fileInput.value = "";
        });
      };
      reader.readAsDataURL(file);
    }

    // Làm mới
    btnClear.addEventListener("click", () => {
      textarea.value = "";
      activeImageBase64 = null;
      activeImageMime = null;
      previewBox.hidden = true;
      fileInput.value = "";
      emptyState.style.display = "block";
      resultBody.innerHTML = "";
    });

    // Bắt đầu giải bài
    btnSubmit.addEventListener("click", async () => {
      const prompt = textarea.value.trim();
      if (!prompt && !activeImageBase64) {
        alert("Vui lòng nhập đề bài hoặc tải ảnh lên.");
        return;
      }

      emptyState.style.display = "none";
      loadingState.style.display = "block";
      resultBody.innerHTML = "";
      btnSubmit.disabled = true;
      btnCancel.style.display = "inline-flex";

      activeAbortController = new AbortController();

      try {
        const payload = {
          prompt,
          grade: container.querySelector(".solver-grade-select").value,
          mode: container.querySelector(".solver-mode-select").value,
          image: activeImageBase64 ? { mimeType: activeImageMime, data: activeImageBase64 } : null
        };

        const res = await fetch("/api/chemistry/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: activeAbortController.signal
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Không thể giải bài lúc này.");

        resultBody.innerHTML = renderSolutionHtml(data.solution);
      } catch (err) {
        if (err.name === "AbortError") {
          resultBody.innerHTML = `<p class="muted" style="color:#94a3b8;padding:20px;">Đã hủy yêu cầu giải bài.</p>`;
        } else {
          resultBody.innerHTML = `
            <div class="auth-error" style="margin:20px 0;background:rgba(239,68,68,0.1);border-color:#ef4444;color:#fca5a5;">
              <strong>Không thể hoàn tất lời giải:</strong> ${err.message}
            </div>
          `;
        }
      } finally {
        loadingState.style.display = "none";
        btnSubmit.disabled = false;
        btnCancel.style.display = "none";
        activeAbortController = null;
      }
    });

    btnCancel.addEventListener("click", () => {
      if (activeAbortController) activeAbortController.abort();
    });
  }

  render();
}

