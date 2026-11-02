/**
 * physics-lab/physics-lab.js
 * Điểm khởi chạy chính (Orchestrator) của Phòng thí nghiệm Vật lí ảo 2D MAIHOC
 */

import { LAB_CONFIG } from "./config/lab.config.js";
import { ExperimentRegistry } from "./core/experiment-registry.js";
import { SimulationRenderer } from "./core/simulation-renderer.js";
import { GraphManager } from "./core/graph-manager.js";
import { SimulationManager } from "./core/simulation-manager.js";

// DOM Elements
const simCanvas = document.getElementById("simCanvas");
const graphCanvas = document.getElementById("graphCanvas");
const catalogContainer = document.getElementById("catalog-list");
const searchInput = document.getElementById("exp-search");

const viewChapter = document.getElementById("view-chapter");
const viewName = document.getElementById("view-name");
const viewDesc = document.getElementById("view-desc");

const formulaText = document.getElementById("formula-text");
const formulaDesc = document.getElementById("formula-desc");
const dynamicParamsContainer = document.getElementById("dynamic-params");
const paramCountBadge = document.getElementById("param-count");
const dynamicResultsContainer = document.getElementById("dynamic-results");

const ctrlPlay = document.getElementById("ctrl-play");
const ctrlPause = document.getElementById("ctrl-pause");
const ctrlReset = document.getElementById("ctrl-reset");
const fpsCounter = document.getElementById("fps-counter");

const btnToggleGraph = document.getElementById("btn-toggle-graph");
const graphCardBox = document.getElementById("graph-panel-box");
const btnClearGraph = document.getElementById("btn-clear-points");

const btnInstruction = document.getElementById("btn-instruction");
const guideModal = document.getElementById("guide-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnGotIt = document.getElementById("btn-got-it");
const modalExpTitle = document.getElementById("modal-exp-title");
const modalExpContent = document.getElementById("modal-exp-content");

const btnTheme = document.getElementById("btn-theme");
const btnFullscreen = document.getElementById("btn-fullscreen");
const btnBack = document.getElementById("btn-back");
const toast = document.getElementById("toast-msg");

let toastTimer = null;
let showGraph = true;

// 1. Khởi tạo Renderer & Graph Manager
const renderer = new SimulationRenderer(simCanvas);
const graphManager = new GraphManager(graphCanvas);

// 2. Khởi tạo Simulation Manager
const simulationManager = new SimulationManager({
  renderer,
  graphManager,
  onStateChange: (metadata, currentParams) => {
    updateMetadataUI(metadata);
    renderDynamicParams(metadata, currentParams);
    renderSidebarList(metadata.id);
  },
  onResultsUpdate: (results) => {
    renderResults(results);
    if (simulationManager.engine) {
      fpsCounter.innerText = `${simulationManager.engine.fps} FPS · Tương tác thời gian thực`;
    }
  }
});

// 3. Hàm hiển thị Toast thông báo
function showToast(message) {
  if (!toast) return;
  toast.innerText = message;
  toast.style.display = "flex";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 2200);
}

// 4. Render danh mục 4 chương và 25 thí nghiệm
function renderSidebarList(activeId) {
  catalogContainer.innerHTML = "";
  const chapters = LAB_CONFIG.chapters;

  chapters.forEach((ch) => {
    const group = document.createElement("div");
    group.className = "chapter-group";

    const head = document.createElement("div");
    head.className = "chapter-header";
    head.innerHTML = `<span>${ch.code}: ${ch.name}</span><span class="chapter-badge">${ch.count} bài</span>`;
    group.appendChild(head);

    const experiments = ExperimentRegistry.getExperimentsByChapter(ch.id);
    experiments.forEach((exp) => {
      const item = document.createElement("div");
      item.className = `exp-item ${exp.id === activeId ? "active" : ""}`;
      item.setAttribute("data-id", exp.id);

      item.innerHTML = `
        <div class="exp-idx">${exp.idx}</div>
        <div class="exp-info">
          <div class="exp-name">${exp.title}</div>
          <div class="exp-desc">${exp.desc}</div>
        </div>
      `;

      item.addEventListener("click", () => {
        simulationManager.loadExperiment(exp.id);
        ctrlPlay.style.display = "none";
        ctrlPause.style.display = "inline-flex";
        showToast(`Đã mở Thí nghiệm ${exp.idx}`);
      });

      group.appendChild(item);
    });

    catalogContainer.appendChild(group);
  });
}

// 5. Cập nhật thông tin Header & Banner của thí nghiệm
function updateMetadataUI(metadata) {
  viewChapter.innerText = metadata.chapterName.toUpperCase();
  viewName.innerText = `Thí nghiệm ${metadata.idx}: ${metadata.title}`;
  viewDesc.innerText = metadata.desc;

  formulaText.innerText = metadata.formula;
  formulaDesc.innerHTML = `
    <strong>${metadata.formulaDesc}</strong><br>
    <span style="color:var(--muted);margin-top:4px;display:inline-block;">Đơn vị chuẩn: ${metadata.siUnits}</span>
  `;
}

// 6. Render các thanh trượt tham số động theo từng thí nghiệm
function renderDynamicParams(metadata, currentParams) {
  dynamicParamsContainer.innerHTML = "";
  const params = metadata.params || [];
  paramCountBadge.innerText = `${params.length} tham số`;

  params.forEach((p) => {
    const row = document.createElement("div");
    row.className = "param-row";

    const val = currentParams[p.id] !== undefined ? currentParams[p.id] : p.defaultValue;

    row.innerHTML = `
      <div class="param-label-row">
        <span>${p.label}</span>
        <span class="param-val" id="val-${p.id}">${val} ${p.unit}</span>
      </div>
      <input type="range" class="param-slider" id="slider-${p.id}"
        min="${p.min}" max="${p.max}" step="${p.step}" value="${val}">
    `;

    dynamicParamsContainer.appendChild(row);

    const slider = row.querySelector(`#slider-${p.id}`);
    slider.addEventListener("input", (e) => {
      const num = parseFloat(e.target.value);
      row.querySelector(`#val-${p.id}`).innerText = `${num} ${p.unit}`;
      simulationManager.setParam(p.id, num);
    });
  });
}

// 7. Render bảng kết quả tính toán và đo đạc
function renderResults(results) {
  if (!Array.isArray(results) || results.length === 0) return;
  dynamicResultsContainer.innerHTML = results
    .map(
      (r) => `
      <div class="res-cell">
        <div class="res-cell-title">${r.label}</div>
        <div class="res-cell-value">${r.value}</div>
      </div>
    `
    )
    .join("");
}

// 8. Đăng ký các sự kiện điều khiển Toolbar
ctrlPlay.addEventListener("click", () => {
  simulationManager.play();
  ctrlPlay.style.display = "none";
  ctrlPause.style.display = "inline-flex";
  showToast("Mô phỏng đang chạy");
});

ctrlPause.addEventListener("click", () => {
  simulationManager.pause();
  ctrlPause.style.display = "none";
  ctrlPlay.style.display = "inline-flex";
  showToast("Đã tạm dừng");
});

ctrlReset.addEventListener("click", () => {
  simulationManager.reset();
  ctrlPlay.style.display = "none";
  ctrlPause.style.display = "inline-flex";
  showToast("Đã đặt lại trạng thái ban đầu");
});

document.querySelectorAll(".speed-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const spd = parseFloat(btn.dataset.speed);
    simulationManager.setSpeed(spd);
    showToast(`Tốc độ mô phỏng: ${spd}x`);
  });
});

btnClearGraph.addEventListener("click", () => {
  graphManager.clearPoints();
  showToast("Đã xóa dữ liệu đồ thị");
});

btnToggleGraph.addEventListener("click", () => {
  showGraph = !showGraph;
  graphCardBox.style.display = showGraph ? "block" : "none";
  btnToggleGraph.innerText = showGraph ? "📊 Ẩn Đồ Thị" : "📊 Hiện Đồ Thị";
});

// 9. Sự kiện chuột / cảm ứng trên Simulation Canvas (Kéo thả Piston, Kim la bàn, v.v.)
simCanvas.addEventListener("pointerdown", (e) => {
  const rect = simCanvas.getBoundingClientRect();
  simCanvas.setPointerCapture(e.pointerId);
  simulationManager.handlePointerDown(e, rect);
});

simCanvas.addEventListener("pointermove", (e) => {
  const rect = simCanvas.getBoundingClientRect();
  simulationManager.handlePointerMove(e, rect);
});

simCanvas.addEventListener("pointerup", (e) => {
  try {
    simCanvas.releasePointerCapture(e.pointerId);
  } catch (_e) {}
  simulationManager.handlePointerUp(e);
});

// 10. Tìm kiếm bài thí nghiệm
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  document.querySelectorAll(".exp-item").forEach((item) => {
    const text = item.innerText.toLowerCase();
    item.style.display = text.includes(query) ? "flex" : "none";
  });
});

// 11. Modal Hướng dẫn STEM
btnInstruction.addEventListener("click", () => {
  const meta = simulationManager.activeMetadata;
  if (!meta || !meta.instructions) return;

  modalExpTitle.innerText = `Hướng dẫn STEM — ${meta.title}`;
  modalExpContent.innerHTML = `
    <h4>1. Mục tiêu thí nghiệm</h4>
    <p>${meta.instructions.goal}</p>
    <h4>2. Dụng cụ &amp; Thiết bị đo</h4>
    <ul>
      ${meta.instructions.tools.map((t) => `<li>${t}</li>`).join("")}
    </ul>
    <h4>3. Các bước tiến hành</h4>
    <ol>
      ${meta.instructions.steps.map((s) => `<li>${s}</li>`).join("")}
    </ol>
    <h4>4. Câu hỏi thảo luận &amp; Giải thích hiện tượng</h4>
    <p>${meta.instructions.discussion}</p>
  `;
  guideModal.classList.add("open");
});

btnCloseModal.addEventListener("click", () => guideModal.classList.remove("open"));
btnGotIt.addEventListener("click", () => guideModal.classList.remove("open"));

// 12. Chuyển đổi giao diện Sáng / Tối
function initTheme() {
  const savedTheme = localStorage.getItem(LAB_CONFIG.themeStorageKey) || "light";
  document.documentElement.classList.toggle("dark", savedTheme === "dark");
  document.documentElement.classList.toggle("light", savedTheme !== "dark");
}

btnTheme.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  document.documentElement.classList.toggle("light", !isDark);
  localStorage.setItem(LAB_CONFIG.themeStorageKey, isDark ? "dark" : "light");
  showToast(isDark ? "Chế độ tối" : "Chế độ sáng");
});

// 13. Toàn màn hình
btnFullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// 14. Nút quay lại MAIHOC
btnBack.addEventListener("click", () => {
  if (window.opener) {
    window.close();
  } else {
    window.location.href = LAB_CONFIG.returnUrl;
  }
});

// 15. Resize Handler
function handleResize() {
  renderer.resize();
  graphManager.resize();
}
window.addEventListener("resize", handleResize);

// 16. Khởi chạy toàn bộ hệ thống
initTheme();
handleResize();
// Mặc định nạp Thí nghiệm 7: Định luật Boyle
simulationManager.loadExperiment("exp-07");
ctrlPlay.style.display = "none";
ctrlPause.style.display = "inline-flex";

