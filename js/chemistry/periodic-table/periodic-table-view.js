/**
 * js/chemistry/periodic-table/periodic-table-view.js
 * Quản lý logic hiển thị và lọc Bảng tuần hoàn 118 nguyên tố
 */

import { renderElementModal } from "./element-detail.js";

let elementsData = [];
let activeFilter = { search: "", block: "all", state: "all", category: "all" };

export async function initPeriodicTable(container, { onSelectElementForSolver } = {}) {
  if (!elementsData.length) {
    try {
      const res = await fetch("/js/chemistry/periodic-table/elements.json");
      if (res.ok) elementsData = await res.json();
    } catch (e) {
      console.error("Không tải được dữ liệu elements.json:", e);
    }
  }

  function render() {
    const filtered = elementsData.filter(el => {
      if (activeFilter.search) {
        const q = activeFilter.search.toLowerCase();
        const matchSymbol = el.symbol.toLowerCase().includes(q);
        const matchNameVi = (el.nameVi || "").toLowerCase().includes(q);
        const matchNameEn = (el.name || "").toLowerCase().includes(q);
        const matchZ = String(el.number) === q;
        if (!matchSymbol && !matchNameVi && !matchNameEn && !matchZ) return false;
      }
      if (activeFilter.block !== "all" && el.block !== activeFilter.block) return false;
      if (activeFilter.state !== "all" && el.standardState !== activeFilter.state) return false;
      if (activeFilter.category !== "all" && el.category !== activeFilter.category) return false;
      return true;
    });

    const activeSet = new Set(filtered.map(e => e.number));

    container.innerHTML = `
      <div class="ptable-container">
        <div class="ptable-toolbar">
          <input type="search" class="ptable-search-input" placeholder="🔍 Tìm theo tên (Hiđro, Sắt), ký hiệu (Fe, Cu) hoặc số Z..." value="${activeFilter.search}">
          <select class="ptable-filter-select" data-filter="block">
            <option value="all">Tất cả khối (s, p, d, f)</option>
            <option value="s" ${activeFilter.block === "s" ? "selected" : ""}>Khối s</option>
            <option value="p" ${activeFilter.block === "p" ? "selected" : ""}>Khối p</option>
            <option value="d" ${activeFilter.block === "d" ? "selected" : ""}>Khối d</option>
            <option value="f" ${activeFilter.block === "f" ? "selected" : ""}>Khối f</option>
          </select>
          <select class="ptable-filter-select" data-filter="state">
            <option value="all">Tất cả thể (298 K)</option>
            <option value="solid" ${activeFilter.state === "solid" ? "selected" : ""}>Chất rắn</option>
            <option value="liquid" ${activeFilter.state === "liquid" ? "selected" : ""}>Chất lỏng</option>
            <option value="gas" ${activeFilter.state === "gas" ? "selected" : ""}>Chất khí</option>
          </select>
          <select class="ptable-filter-select" data-filter="category">
            <option value="all">Tất cả nhóm hóa học</option>
            <option value="alkali-metal" ${activeFilter.category === "alkali-metal" ? "selected" : ""}>Kim loại kiềm</option>
            <option value="alkaline-earth" ${activeFilter.category === "alkaline-earth" ? "selected" : ""}>Kim loại kiềm thổ</option>
            <option value="transition-metal" ${activeFilter.category === "transition-metal" ? "selected" : ""}>Kim loại chuyển tiếp</option>
            <option value="post-transition" ${activeFilter.category === "post-transition" ? "selected" : ""}>Kim loại sau chuyển tiếp</option>
            <option value="metalloid" ${activeFilter.category === "metalloid" ? "selected" : ""}>Á kim</option>
            <option value="reactive-nonmetal" ${activeFilter.category === "reactive-nonmetal" ? "selected" : ""}>Phi kim hoạt động</option>
            <option value="noble-gas" ${activeFilter.category === "noble-gas" ? "selected" : ""}>Khí hiếm</option>
            <option value="lanthanide" ${activeFilter.category === "lanthanide" ? "selected" : ""}>Lanthanide</option>
            <option value="actinide" ${activeFilter.category === "actinide" ? "selected" : ""}>Actinide</option>
          </select>
          <button type="button" class="button secondary small" data-action="reset-filters">Xóa bộ lọc (${filtered.length}/118)</button>
        </div>

        <div class="ptable-grid-wrapper">
          <div class="ptable-grid">
            <!-- Ô giữ chỗ đại diện cho dãy Lanthanide chu kỳ 6 nhóm 3 -->
            <div class="ptable-cell cat-lanthanide ptable-placeholder-cell" style="grid-row:6;grid-column:3;" title="Dãy Lanthanide (Z = 57 - 71)">
              <span>57-71</span>
              <span>La-Lu</span>
            </div>

            <!-- Ô giữ chỗ đại diện cho dãy Actinide chu kỳ 7 nhóm 3 -->
            <div class="ptable-cell cat-actinide ptable-placeholder-cell" style="grid-row:7;grid-column:3;" title="Dãy Actinide (Z = 89 - 103)">
              <span>89-103</span>
              <span>Ac-Lr</span>
            </div>

            ${elementsData.map(el => {
              const isMatch = activeSet.has(el.number);
              const gridRow = el.gridRow || el.period;
              const gridCol = el.gridColumn || el.group;
              return `
                <div class="ptable-cell cat-${el.category || 'unknown'} ${isMatch ? '' : 'is-dimmed'}"
                     style="grid-row: ${gridRow}; grid-column: ${gridCol};"
                     data-element-id="${el.number}" tabindex="0" role="button" aria-label="${el.nameVi}">
                  <div class="ptable-cell-top">
                    <span>${el.number}</span>
                    <span class="tiny">${el.block || ''}</span>
                  </div>
                  <div class="ptable-symbol">${el.symbol}</div>
                  <div class="ptable-name">${el.nameVi || el.name}</div>
                  <div class="ptable-mass">${el.atomicMass}</div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div class="ptable-legend">
          <div class="ptable-legend-item" data-cat-filter="alkali-metal"><span class="ptable-legend-badge cat-alkali-metal"></span> Kim loại kiềm</div>
          <div class="ptable-legend-item" data-cat-filter="alkaline-earth"><span class="ptable-legend-badge cat-alkaline-earth"></span> Kim loại kiềm thổ</div>
          <div class="ptable-legend-item" data-cat-filter="transition-metal"><span class="ptable-legend-badge cat-transition-metal"></span> Kim loại chuyển tiếp</div>
          <div class="ptable-legend-item" data-cat-filter="post-transition"><span class="ptable-legend-badge cat-post-transition"></span> Kim loại sau chuyển tiếp</div>
          <div class="ptable-legend-item" data-cat-filter="metalloid"><span class="ptable-legend-badge cat-metalloid"></span> Á kim</div>
          <div class="ptable-legend-item" data-cat-filter="reactive-nonmetal"><span class="ptable-legend-badge cat-reactive-nonmetal"></span> Phi kim hoạt động</div>
          <div class="ptable-legend-item" data-cat-filter="noble-gas"><span class="ptable-legend-badge cat-noble-gas"></span> Khí hiếm</div>
          <div class="ptable-legend-item" data-cat-filter="lanthanide"><span class="ptable-legend-badge cat-lanthanide"></span> Dãy Lanthanide</div>
          <div class="ptable-legend-item" data-cat-filter="actinide"><span class="ptable-legend-badge cat-actinide"></span> Dãy Actinide</div>
        </div>
      </div>
      <div id="element-modal-host"></div>
    `;

    wireEvents();
  }

  function wireEvents() {
    const searchInput = container.querySelector(".ptable-search-input");
    searchInput?.addEventListener("input", e => {
      activeFilter.search = e.target.value.trim();
      render();
    });

    container.querySelectorAll(".ptable-filter-select").forEach(sel => {
      sel.addEventListener("change", e => {
        activeFilter[e.target.dataset.filter] = e.target.value;
        render();
      });
    });

    container.querySelectorAll(".ptable-legend-item").forEach(item => {
      item.addEventListener("click", () => {
        const cat = item.dataset.catFilter;
        activeFilter.category = activeFilter.category === cat ? "all" : cat;
        render();
      });
    });

    container.querySelector("[data-action='reset-filters']")?.addEventListener("click", () => {
      activeFilter = { search: "", block: "all", state: "all", category: "all" };
      render();
    });

    container.querySelectorAll("[data-element-id]").forEach(card => {
      card.addEventListener("click", () => {
        openModal(Number(card.dataset.elementId));
      });
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openModal(Number(card.dataset.elementId));
        }
      });
    });
  }

  function openModal(z) {
    const element = elementsData.find(e => e.number === z);
    if (!element) return;
    const host = container.querySelector("#element-modal-host");
    if (!host) return;

    host.innerHTML = renderElementModal(element);

    const dialog = host.querySelector("#element-detail-dialog");
    dialog?.showModal?.();

    host.querySelector("[data-close-element]")?.addEventListener("click", () => {
      dialog.close();
      host.innerHTML = "";
    });

    dialog?.addEventListener("click", e => {
      if (e.target === dialog) {
        dialog.close();
        host.innerHTML = "";
      }
    });

    host.querySelector("[data-nav-prev]")?.addEventListener("click", () => openModal(z - 1));
    host.querySelector("[data-nav-next]")?.addEventListener("click", () => openModal(z + 1));
    host.querySelector("[data-action='solve-with-element']")?.addEventListener("click", (e) => {
      dialog.close();
      host.innerHTML = "";
      if (onSelectElementForSolver) {
        onSelectElementForSolver(e.currentTarget.dataset.symbol, e.currentTarget.dataset.name);
      }
    });
  }

  render();
}

