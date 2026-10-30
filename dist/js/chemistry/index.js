/**
 * js/chemistry/index.js
 * Entrypoint của Phân hệ Hóa học MAI HỌC
 */

import { initPeriodicTable } from "./periodic-table/periodic-table-view.js";
import { mountUniversalAiSolver } from "../ai-solver/index.js";

export function mountChemistryModule(container, { subView = "periodic-table", initialElement = null, onNavigate } = {}) {
  let currentSubView = subView;
  let activeSolverCleanup = null;
  let carryOverPrompt = initialElement
    ? `Tính chất hóa học, phương trình phản ứng tiêu biểu và bài toán ví dụ liên quan đến nguyên tố ${initialElement}.`
    : "";

  function renderHub() {
    container.innerHTML = `
      <section class="chemistry-hub-header" style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:14px;">
          <div>
            <div style="margin-bottom:6px;">
              <button type="button" class="button secondary small" id="btn-back-to-subject">← Về môn Hóa học</button>
            </div>
            <p class="eyebrow" style="color:var(--accent);">PHÂN HỆ HÓA HỌC CHUYÊN SÂU</p>
            <h1 style="margin:4px 0 6px;font-size:clamp(24px,3.5vw,32px);">${currentSubView === 'periodic-table' ? 'Bảng tuần hoàn 118 nguyên tố' : 'AI Giải bài tập Hóa học'}</h1>
            <p class="muted" style="margin:0;">Bảng tuần hoàn tương tác IUPAC &amp; Trợ lý AI giải bài tập Hóa học từng bước.</p>
          </div>
          <div class="inline-actions" style="background:var(--surface);border:1px solid var(--border);padding:5px;border-radius:12px;box-shadow:var(--shadow);">
            <button type="button" class="button ${currentSubView === 'periodic-table' ? 'primary' : 'ghost'} small" id="tab-ptable">📊 Bảng tuần hoàn</button>
            <button type="button" class="button ${currentSubView === 'ai-solver' ? 'primary' : 'ghost'} small" id="tab-solver">⚗️ AI Giải bài tập</button>
          </div>
        </div>
      </section>
      <div id="chemistry-subview-mount"></div>
    `;

    const subviewMount = container.querySelector("#chemistry-subview-mount");

    if (currentSubView === "periodic-table") {
      initPeriodicTable(subviewMount, {
        onSelectElementForSolver: (symbol, nameVi) => {
          carryOverPrompt = `Cho nguyên tố ${nameVi} (${symbol}). Nêu các phản ứng hóa học đặc trưng, phương trình cân bằng và một bài toán tính toán ví dụ liên quan đến ${symbol}.`;
          currentSubView = "ai-solver";
          renderHub();
        }
      });
    } else if (currentSubView === "ai-solver") {
      activeSolverCleanup?.();
      activeSolverCleanup = mountUniversalAiSolver(subviewMount, { onNavigate: (r, p) => onNavigate?.(r, p) });
      carryOverPrompt = "";
    }

    container.querySelector("#tab-ptable")?.addEventListener("click", () => {
      activeSolverCleanup?.();
      activeSolverCleanup = null;
      currentSubView = "periodic-table";
      renderHub();
    });

    container.querySelector("#tab-solver")?.addEventListener("click", () => {
      currentSubView = "ai-solver";
      renderHub();
    });

    container.querySelector("#btn-back-to-subject")?.addEventListener("click", () => {
      if (onNavigate) {
        onNavigate("subject", { subject: "Hóa học" });
      } else {
        window.dispatchEvent(new CustomEvent("maihoc-navigate", { detail: { route: "subject", params: { subject: "Hóa học" } } }));
      }
    });
  }

  renderHub();

  return () => {
    activeSolverCleanup?.();
    activeSolverCleanup = null;
    container.innerHTML = "";
  };
}
