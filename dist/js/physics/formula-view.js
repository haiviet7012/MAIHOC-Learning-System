/**
 * js/physics/formula-view.js
 * Giao diện tương tác Thư viện Công thức Vật lý MAIHOC
 */

import { PHYSICS_FORMULAS_DATA } from "./data/physics-formulas-data.js";

export function createPhysicsFormulaView(container, { initialGrade = 10, onNavigate, onBack } = {}) {
  let currentGrade = initialGrade;
  let selectedChapterId = "all";
  let searchQuery = "";
  let selectedType = "all";
  let favorites = [];
  let activeModalFormula = null;
  let toastTimer = null;

  // Load favorites from localStorage
  try {
    const saved = localStorage.getItem("maihoc_physics_favorites");
    if (saved) favorites = JSON.parse(saved);
  } catch (e) {
    favorites = [];
  }

  function saveFavorites() {
    try {
      localStorage.setItem("maihoc_physics_favorites", JSON.stringify(favorites));
    } catch (e) {}
  }

  function showToast(text) {
    let toast = document.getElementById("pfl-toast-box");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pfl-toast-box";
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--surface-2);
        border: 1px solid var(--primary);
        color: var(--text);
        padding: 10px 18px;
        font-size: 13.5px;
        font-weight: 600;
        box-shadow: var(--shadow);
        z-index: 1100;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✓</span> <span>${escapeHtml(text)}</span>`;
    toast.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = "none";
    }, 2400);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function triggerMathJax() {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([container]).catch((err) => {
        console.warn("MathJax typesetting notice:", err);
      });
    }
  }

  function findFormulaById(id) {
    for (const g of [10, 11, 12]) {
      const gData = PHYSICS_FORMULAS_DATA[g];
      if (!gData) continue;
      for (const ch of gData.chapters) {
        for (const sub of ch.subsections) {
          for (const f of sub.formulas) {
            if (f.id === id) return f;
          }
        }
      }
    }
    return null;
  }

  function getContextFormulas() {
    if (currentGrade === "favorites") {
      const list = [];
      [10, 11, 12].forEach((g) => {
        PHYSICS_FORMULAS_DATA[g]?.chapters.forEach((ch) => {
          ch.subsections.forEach((sub) => {
            sub.formulas.forEach((f) => {
              if (favorites.includes(f.id)) list.push(f);
            });
          });
        });
      });
      return list;
    }

    if (currentGrade === "si") return [];

    const gradeData = PHYSICS_FORMULAS_DATA[currentGrade];
    if (!gradeData) return [];

    let list = [];
    gradeData.chapters.forEach((ch) => {
      if (selectedChapterId === "all" || ch.chapterId === selectedChapterId) {
        ch.subsections.forEach((sub) => {
          list = list.concat(sub.formulas);
        });
      }
    });
    return list;
  }

  function renderSkeleton() {
    container.innerHTML = `
      <div class="physics-formula-library">
        <!-- HEADER -->
        <section class="pfl-header-section">
          <div class="pfl-breadcrumb-bar">
            <nav class="pfl-breadcrumb" aria-label="Đường dẫn">
              <button type="button" id="pfl-bc-home">MAIHOC</button>
              <span class="pfl-sep">/</span>
              <button type="button" id="pfl-bc-subject">Vật lý</button>
              <span class="pfl-sep">/</span>
              <span class="pfl-current">Công thức Vật lý</span>
            </nav>
            <div class="pfl-badge-counter">
              <span>Toàn bộ 3 khối lớp:</span>
              <strong>125 công thức</strong>
            </div>
          </div>

          <div class="pfl-title-row">
            <div class="pfl-title-group">
              <div class="pfl-icon-box">⚛</div>
              <div>
                <h1>Thư viện công thức Vật lý</h1>
                <p class="pfl-desc">Tra cứu toàn bộ công thức theo chương trình Vật lý lớp 10, 11 và 12 (Kết nối tri thức với cuộc sống)</p>
              </div>
            </div>
          </div>
        </section>

        <!-- GRADE TABS -->
        <nav class="pfl-tabs-nav" aria-label="Chọn khối lớp">
          <button type="button" class="pfl-tab-btn ${currentGrade === 10 ? 'active' : ''}" data-grade="10">
            <span>Lớp 10</span>
            <span class="pfl-tab-count">46 CT</span>
          </button>
          <button type="button" class="pfl-tab-btn ${currentGrade === 11 ? 'active' : ''}" data-grade="11">
            <span>Lớp 11</span>
            <span class="pfl-tab-count">42 CT</span>
          </button>
          <button type="button" class="pfl-tab-btn ${currentGrade === 12 ? 'active' : ''}" data-grade="12">
            <span>Lớp 12</span>
            <span class="pfl-tab-count">37 CT</span>
          </button>
          <button type="button" class="pfl-tab-btn ${currentGrade === 'favorites' ? 'active' : ''}" data-grade="favorites">
            <span>⭐ Đã lưu</span>
            <span class="pfl-tab-count" id="pfl-fav-count">${favorites.length}</span>
          </button>
          <button type="button" class="pfl-tab-btn ${currentGrade === 'si' ? 'active' : ''}" data-grade="si">
            <span>📐 Bảng đơn vị SI</span>
            <span class="pfl-tab-count">14 đại lượng</span>
          </button>
        </nav>

        <!-- MAIN LAYOUT GRID -->
        <div class="pfl-layout-grid" id="pfl-main-layout">
          <!-- SIDEBAR -->
          <aside class="pfl-sidebar" id="pfl-sidebar">
            <div class="pfl-sidebar-head">
              <h3 id="pfl-sidebar-head-title">Danh mục chương</h3>
              <span class="pfl-tab-count" id="pfl-sidebar-badge">4 chương</span>
            </div>
            <nav class="pfl-sidebar-list" id="pfl-sidebar-nav" aria-label="Danh mục chương học"></nav>
          </aside>

          <!-- CONTENT COLUMN -->
          <main class="pfl-content-column">
            <!-- TOOLBAR -->
            <div class="pfl-toolbar" id="pfl-toolbar">
              <div class="pfl-search-wrap">
                <span class="pfl-search-icon">🔍</span>
                <input type="text" class="pfl-search-input" id="pfl-search-input" placeholder="Tìm kiếm theo tên công thức, ký hiệu ($v, a, F$), chương..." value="${escapeHtml(searchQuery)}">
                <button type="button" class="pfl-search-clear" id="pfl-search-clear" title="Xóa tìm kiếm">×</button>
              </div>

              <select class="pfl-filter-select" id="pfl-type-select">
                <option value="all">Tất cả phân loại</option>
                <option value="Trọng tâm">Chỉ công thức trọng tâm</option>
                <option value="Mở rộng & Vận dụng">Mở rộng &amp; Vận dụng</option>
                <option value="Chuyên đề">Chuyên đề</option>
              </select>

              <div class="pfl-counter-info">
                Hiển thị <strong id="pfl-match-num">0</strong> / <span id="pfl-total-num">0</span> công thức
              </div>
            </div>

            <!-- CONTEXT BAR -->
            <div class="pfl-context-bar" id="pfl-context-bar">
              <h2 id="pfl-view-heading">Toàn bộ chương</h2>
              <span class="pfl-context-desc" id="pfl-view-desc">SGK Vật lí Kết nối tri thức</span>
            </div>

            <!-- FORMULA CARDS GRID -->
            <div class="pfl-formula-grid" id="pfl-cards-container"></div>

            <!-- SI TABLE VIEW -->
            <div class="pfl-si-view" id="pfl-si-container" style="display:none;">
              <div class="pfl-si-head">
                <div>
                  <h2>Bảng đơn vị đo lường Hệ SI trong Vật lí</h2>
                  <p style="font-size:12px;color:var(--muted);margin:3px 0 0;">Trích xuất chuẩn xác theo tài liệu Vật lí 10 Kết nối tri thức với cuộc sống</p>
                </div>
                <span class="pfl-tab-count">14 đại lượng chuẩn</span>
              </div>
              <div class="pfl-si-table-wrap">
                <table class="pfl-si-table">
                  <thead>
                    <tr>
                      <th>Đại lượng</th>
                      <th>Kí hiệu đơn vị</th>
                      <th>Tên đơn vị</th>
                      <th>Phân loại trong hệ SI</th>
                    </tr>
                  </thead>
                  <tbody id="pfl-si-tbody"></tbody>
                </table>
              </div>
            </div>
          </main>
        </div>

        <!-- MODAL DETAIL -->
        <div class="pfl-modal-overlay" id="pfl-detail-modal">
          <div class="pfl-modal-container">
            <div class="pfl-modal-header">
              <div>
                <div class="pfl-card-badges" id="pfl-modal-badges"></div>
                <h2 id="pfl-modal-title">Tên công thức</h2>
              </div>
              <button type="button" class="pfl-modal-close-btn" id="pfl-modal-close-btn" title="Đóng">×</button>
            </div>

            <div class="pfl-modal-body">
              <div class="pfl-modal-formula-hero">
                <div class="pfl-modal-formula-large" id="pfl-modal-math"></div>
                <button type="button" class="pfl-copy-btn" id="pfl-modal-copy-btn">
                  <span>📋</span> Sao chép mã LaTeX biểu thức
                </button>
              </div>

              <div class="pfl-modal-section" id="pfl-modal-sec-quantities">
                <div class="pfl-modal-sec-title"><span>🏷️</span> Đại lượng &amp; Ý nghĩa ký hiệu</div>
                <div class="pfl-modal-sec-box" id="pfl-modal-quantities-box"></div>
              </div>

              <div class="pfl-modal-section" id="pfl-modal-sec-conditions">
                <div class="pfl-modal-sec-title"><span>⚙️</span> Điều kiện áp dụng &amp; Phạm vi</div>
                <div class="pfl-modal-sec-box" id="pfl-modal-conditions-box"></div>
              </div>

              <div class="pfl-modal-section" id="pfl-modal-sec-cases" style="display:none;">
                <div class="pfl-modal-sec-title"><span>🔄</span> Các trường hợp &amp; Biến thể</div>
                <div class="pfl-modal-sec-box" id="pfl-modal-cases-box"></div>
              </div>

              <div class="pfl-modal-section" id="pfl-modal-sec-notes">
                <div class="pfl-modal-sec-title"><span>💡</span> Giải thích &amp; Thí nghiệm thực hành</div>
                <div class="pfl-modal-sec-box" id="pfl-modal-notes-box"></div>
              </div>
            </div>

            <div class="pfl-modal-footer">
              <button type="button" class="pfl-copy-btn" id="pfl-modal-fav-toggle" style="padding:7px 14px;font-size:12.5px;">
                <span>⭐</span> Đánh dấu yêu thích
              </button>
              <button type="button" class="pfl-btn-reset" id="pfl-modal-bottom-close" style="margin:0;padding:7px 16px;">
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    renderContent();
  }

  function bindEvents() {
    // Breadcrumbs
    container.querySelector("#pfl-bc-home")?.addEventListener("click", () => {
      onNavigate ? onNavigate("home") : window.dispatchEvent(new CustomEvent("maihoc-navigate", { detail: { route: "home" } }));
    });
    container.querySelector("#pfl-bc-subject")?.addEventListener("click", () => {
      if (onBack) onBack();
      else if (onNavigate) onNavigate("subject", { subject: "Vật lý" });
      else window.dispatchEvent(new CustomEvent("maihoc-navigate", { detail: { route: "subject", params: { subject: "Vật lý" } } }));
    });

    // Grade Tabs
    container.querySelectorAll(".pfl-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gradeVal = btn.dataset.grade;
        currentGrade = (gradeVal === "favorites" || gradeVal === "si") ? gradeVal : parseInt(gradeVal, 10);
        selectedChapterId = "all";
        searchQuery = "";
        selectedType = "all";

        const sInput = container.querySelector("#pfl-search-input");
        if (sInput) sInput.value = "";
        const sClear = container.querySelector("#pfl-search-clear");
        if (sClear) sClear.style.display = "none";
        const tSel = container.querySelector("#pfl-type-select");
        if (tSel) tSel.value = "all";

        container.querySelectorAll(".pfl-tab-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });

        renderContent();
      });
    });

    // Search Input
    const sInput = container.querySelector("#pfl-search-input");
    const sClear = container.querySelector("#pfl-search-clear");
    sInput?.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      if (sClear) sClear.style.display = searchQuery ? "block" : "none";
      renderCardsOnly();
    });

    sClear?.addEventListener("click", () => {
      if (sInput) sInput.value = "";
      searchQuery = "";
      sClear.style.display = "none";
      renderCardsOnly();
    });

    // Type Filter
    const tSel = container.querySelector("#pfl-type-select");
    tSel?.addEventListener("change", (e) => {
      selectedType = e.target.value;
      renderCardsOnly();
    });

    // Modal Close
    const modal = container.querySelector("#pfl-detail-modal");
    container.querySelector("#pfl-modal-close-btn")?.addEventListener("click", closeModal);
    container.querySelector("#pfl-modal-bottom-close")?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Modal Copy LaTeX
    container.querySelector("#pfl-modal-copy-btn")?.addEventListener("click", () => {
      if (!activeModalFormula) return;
      navigator.clipboard.writeText(activeModalFormula.primaryMath).then(() => {
        showToast("Đã sao chép biểu thức LaTeX vào clipboard!");
      });
    });

    // Modal Favorite Toggle
    container.querySelector("#pfl-modal-fav-toggle")?.addEventListener("click", () => {
      if (!activeModalFormula) return;
      toggleFavorite(activeModalFormula.id);
      updateModalFavButton();
    });
  }

  function renderContent() {
    const sidebar = container.querySelector("#pfl-sidebar");
    const cardsContainer = container.querySelector("#pfl-cards-container");
    const siContainer = container.querySelector("#pfl-si-container");
    const toolbar = container.querySelector("#pfl-toolbar");
    const contextBar = container.querySelector("#pfl-context-bar");

    if (currentGrade === "si") {
      sidebar.style.display = "none";
      cardsContainer.style.display = "none";
      toolbar.style.display = "none";
      contextBar.style.display = "none";
      siContainer.style.display = "block";
      renderSITable();
      return;
    }

    sidebar.style.display = "flex";
    cardsContainer.style.display = "grid";
    toolbar.style.display = "flex";
    contextBar.style.display = "flex";
    siContainer.style.display = "none";

    renderSidebar();
    renderCardsOnly();
  }

  function renderSidebar() {
    const nav = container.querySelector("#pfl-sidebar-nav");
    const headTitle = container.querySelector("#pfl-sidebar-head-title");
    const headBadge = container.querySelector("#pfl-sidebar-badge");
    if (!nav) return;

    if (currentGrade === "favorites") {
      headTitle.innerText = "Mục yêu thích";
      headBadge.innerText = `${favorites.length} mục`;
      nav.innerHTML = `
        <button type="button" class="pfl-chapter-btn active">
          <span class="pfl-chapter-title">⭐ Tất cả công thức đã lưu</span>
          <span class="pfl-chapter-count">${favorites.length}</span>
        </button>
      `;
      return;
    }

    const gradeData = PHYSICS_FORMULAS_DATA[currentGrade];
    if (!gradeData) return;

    headTitle.innerText = `Chương học Lớp ${currentGrade}`;
    headBadge.innerText = `${gradeData.chapters.length} chương`;

    let html = `
      <button type="button" class="pfl-chapter-btn ${selectedChapterId === 'all' ? 'active' : ''}" data-ch="all">
        <span class="pfl-chapter-title">📚 Tất cả chương</span>
        <span class="pfl-chapter-count">${gradeData.totalFormulas}</span>
      </button>
    `;

    gradeData.chapters.forEach((ch) => {
      const isActive = ch.chapterId === selectedChapterId;
      html += `
        <button type="button" class="pfl-chapter-btn ${isActive ? 'active' : ''}" data-ch="${ch.chapterId}" title="${escapeHtml(ch.fullTitle)}">
          <span class="pfl-chapter-title">${ch.chapterNum}: ${escapeHtml(ch.chapterName)}</span>
          <span class="pfl-chapter-count">${ch.formulaCount}</span>
        </button>
      `;
    });

    nav.innerHTML = html;

    nav.querySelectorAll(".pfl-chapter-btn").forEach((b) => {
      b.addEventListener("click", () => {
        selectedChapterId = b.dataset.ch;
        nav.querySelectorAll(".pfl-chapter-btn").forEach((x) => x.classList.toggle("active", x === b));
        renderCardsOnly();
      });
    });
  }

  function renderCardsOnly() {
    const cardsContainer = container.querySelector("#pfl-cards-container");
    const matchNum = container.querySelector("#pfl-match-num");
    const totalNum = container.querySelector("#pfl-total-num");
    const heading = container.querySelector("#pfl-view-heading");
    const desc = container.querySelector("#pfl-view-desc");

    const rawList = getContextFormulas();
    const totalInContext = rawList.length;

    const filtered = rawList.filter((f) => {
      if (selectedType !== "all") {
        if (selectedType === "Trọng tâm" && f.sectionType !== "Trọng tâm") return false;
        if (selectedType === "Mở rộng & Vận dụng" && f.sectionType !== "Mở rộng & Vận dụng") return false;
        if (selectedType === "Chuyên đề" && f.sectionType !== "Chuyên đề") return false;
      }

      if (searchQuery) {
        const inTitle = f.title.toLowerCase().includes(searchQuery);
        const inMath = f.primaryMath.toLowerCase().includes(searchQuery);
        const inChapter = f.chapterName.toLowerCase().includes(searchQuery);
        const inSection = f.sectionTitle.toLowerCase().includes(searchQuery);
        const inRaw = f.rawChunk.toLowerCase().includes(searchQuery);
        const inCases = f.subCases?.some((sc) => sc.label.toLowerCase().includes(searchQuery) || sc.math.toLowerCase().includes(searchQuery));
        if (!inTitle && !inMath && !inChapter && !inSection && !inRaw && !inCases) {
          return false;
        }
      }
      return true;
    });

    if (matchNum) matchNum.innerText = filtered.length;
    if (totalNum) totalNum.innerText = totalInContext;

    if (currentGrade === "favorites") {
      heading.innerText = "Công thức đã lưu ⭐";
      desc.innerText = `${filtered.length} công thức trong danh sách yêu thích`;
    } else {
      if (selectedChapterId === "all") {
        heading.innerText = `Chương trình Vật lý lớp ${currentGrade}`;
        desc.innerText = `4 chương theo SGK Kết nối tri thức với cuộc sống`;
      } else {
        const chObj = PHYSICS_FORMULAS_DATA[currentGrade]?.chapters.find((c) => c.chapterId === selectedChapterId);
        heading.innerText = chObj ? `${chObj.chapterNum}: ${chObj.chapterName}` : "Chương học";
        desc.innerText = `Chương trình Vật lý lớp ${currentGrade}`;
      }
    }

    if (filtered.length === 0) {
      cardsContainer.innerHTML = `
        <div class="pfl-empty-box">
          <span class="pfl-empty-icon">🔍</span>
          <h3>Không tìm thấy công thức phù hợp</h3>
          <p>Không có kết quả nào khớp với từ khóa "<strong>${escapeHtml(searchQuery)}</strong>" hoặc bộ lọc hiện tại.</p>
          <button type="button" class="pfl-btn-reset" id="pfl-btn-reset-filters">Đặt lại bộ lọc &amp; tìm kiếm</button>
        </div>
      `;
      cardsContainer.querySelector("#pfl-btn-reset-filters")?.addEventListener("click", () => {
        selectedChapterId = "all";
        searchQuery = "";
        selectedType = "all";
        const sInput = container.querySelector("#pfl-search-input");
        if (sInput) sInput.value = "";
        const sClear = container.querySelector("#pfl-search-clear");
        if (sClear) sClear.style.display = "none";
        const tSel = container.querySelector("#pfl-type-select");
        if (tSel) tSel.value = "all";
        renderSidebar();
        renderCardsOnly();
      });
      return;
    }

    cardsContainer.innerHTML = filtered.map((f) => {
      const isFav = favorites.includes(f.id);
      const typeClass = f.sectionType === "Trọng tâm" ? "focus" : (f.sectionType === "Mở rộng & Vận dụng" ? "advanced" : "special");
      
      let subcasesHtml = "";
      if (f.subCases && f.subCases.length > 0) {
        subcasesHtml = `
          <div class="pfl-subcase-list">
            ${f.subCases.slice(0, 3).map((sc) => `
              <div class="pfl-subcase-item">
                <span class="pfl-subcase-bullet">▸</span>
                <span><strong>${escapeHtml(sc.label)}:</strong> ${sc.math ? `$${escapeHtml(sc.math)}$` : ''}</span>
              </div>
            `).join("")}
            ${f.subCases.length > 3 ? `<div style="font-size:11px;color:var(--primary);padding-left:12px;">+ ${f.subCases.length - 3} trường hợp khác (nhấn xem chi tiết)</div>` : ''}
          </div>
        `;
      }

      return `
        <article class="pfl-card" data-id="${f.id}">
          <div class="pfl-card-head">
            <div class="pfl-card-badges">
              <span class="pfl-pill-type ${typeClass}">${escapeHtml(f.sectionType)}</span>
              <span class="pfl-pill-chapter">${f.chapterNum}</span>
            </div>
            <div class="pfl-card-actions">
              <button type="button" class="pfl-icon-button ${isFav ? 'is-fav' : ''}" data-action="toggle-fav" data-id="${f.id}" title="${isFav ? 'Bỏ lưu' : 'Lưu công thức'}">
                ${isFav ? '★' : '☆'}
              </button>
              <button type="button" class="pfl-icon-button" data-action="copy-math" data-id="${f.id}" title="Sao chép biểu thức LaTeX">
                📋
              </button>
            </div>
          </div>

          <h3 class="pfl-card-title">${escapeHtml(f.title)}</h3>

          <div class="pfl-math-box">
            $$${f.primaryMath}$$
          </div>

          ${subcasesHtml}

          <div class="pfl-card-footer">
            <button type="button" class="pfl-detail-link" data-action="open-detail" data-id="${f.id}">
              Xem chi tiết <span>→</span>
            </button>
            <span style="font-size:11px;color:var(--muted);font-family:var(--font-mono, monospace);">${f.id}</span>
          </div>
        </article>
      `;
    }).join("");

    // Attach card event listeners
    cardsContainer.querySelectorAll(".pfl-card").forEach((card) => {
      const id = card.dataset.id;
      card.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("button");
        if (actionBtn) {
          const action = actionBtn.dataset.action;
          if (action === "toggle-fav") {
            e.stopPropagation();
            toggleFavorite(id);
            renderCardsOnly();
            return;
          }
          if (action === "copy-math") {
            e.stopPropagation();
            copyFormulaLatex(id);
            return;
          }
        }
        openModal(id);
      });
    });

    triggerMathJax();
  }

  function renderSITable() {
    const tbody = container.querySelector("#pfl-si-tbody");
    if (!tbody) return;
    const list = PHYSICS_FORMULAS_DATA[10]?.siTable || [];
    tbody.innerHTML = list.map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.quantity)}</strong> ${item.symbol ? `<span class="pfl-si-sym">(${escapeHtml(item.symbol)})</span>` : ''}</td>
        <td class="pfl-si-sym">${escapeHtml(item.unitSymbol)}</td>
        <td>${escapeHtml(item.unitName)}</td>
        <td>
          <span class="pfl-si-badge">${escapeHtml(item.category)}</span>
        </td>
      </tr>
    `).join("");
  }

  function toggleFavorite(id) {
    if (favorites.includes(id)) {
      favorites = favorites.filter((x) => x !== id);
      showToast("Đã xóa khỏi danh sách yêu thích");
    } else {
      favorites.push(id);
      showToast("Đã thêm vào danh sách yêu thích");
    }
    saveFavorites();
    const favCount = container.querySelector("#pfl-fav-count");
    if (favCount) favCount.innerText = favorites.length;
  }

  function copyFormulaLatex(id) {
    const f = findFormulaById(id);
    if (!f) return;
    navigator.clipboard.writeText(f.primaryMath).then(() => {
      showToast("Đã sao chép công thức vào clipboard!");
    });
  }

  function openModal(id) {
    const f = findFormulaById(id);
    if (!f) return;
    activeModalFormula = f;

    const modal = container.querySelector("#pfl-detail-modal");
    if (!modal) return;

    container.querySelector("#pfl-modal-title").innerText = f.title;
    const typeClass = f.sectionType === "Trọng tâm" ? "focus" : (f.sectionType === "Mở rộng & Vận dụng" ? "advanced" : "special");
    container.querySelector("#pfl-modal-badges").innerHTML = `
      <span class="pfl-pill-type ${typeClass}">${escapeHtml(f.sectionType)}</span>
      <span class="pfl-pill-chapter">Lớp ${f.grade} · ${f.chapterNum}</span>
      <span class="pfl-pill-chapter" style="font-family:var(--font-mono, monospace);">${f.id}</span>
    `;

    container.querySelector("#pfl-modal-math").innerHTML = `$$${f.primaryMath}$$`;

    const quantBox = container.querySelector("#pfl-modal-quantities-box");
    if (f.variables && f.variables.length > 0) {
      quantBox.innerHTML = f.variables.map((v) => `<p style="margin:4px 0;">${escapeHtml(v)}</p>`).join("");
    } else {
      quantBox.innerHTML = `<p style="color:var(--muted);font-style:italic;margin:0;">Các đại lượng tuân theo quy chuẩn Hệ SI của chương trình Vật lý ${f.grade}.</p>`;
    }

    const condBox = container.querySelector("#pfl-modal-conditions-box");
    if (f.conditions && f.conditions.length > 0) {
      condBox.innerHTML = `<ul>${f.conditions.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;
    } else {
      condBox.innerHTML = `<p style="color:var(--muted);font-style:italic;margin:0;">Chưa có thông tin điều kiện riêng trong tài liệu (áp dụng trong điều kiện vật lý chuẩn).</p>`;
    }

    const casesSec = container.querySelector("#pfl-modal-sec-cases");
    const casesBox = container.querySelector("#pfl-modal-cases-box");
    if (f.subCases && f.subCases.length > 0) {
      casesSec.style.display = "flex";
      casesBox.innerHTML = `<ul>${f.subCases.map((sc) => `
        <li>
          <strong>${escapeHtml(sc.label)}:</strong> ${sc.math ? `$${escapeHtml(sc.math)}$` : ''}
        </li>
      `).join("")}</ul>`;
    } else {
      casesSec.style.display = "none";
    }

    const noteBox = container.querySelector("#pfl-modal-notes-box");
    if (f.notes && f.notes.length > 0) {
      noteBox.innerHTML = f.notes.map((n) => `<p style="margin:4px 0;">${escapeHtml(n)}</p>`).join("");
    } else {
      noteBox.innerHTML = `<p style="color:var(--muted);font-style:italic;margin:0;">Chưa có thông tin ghi chú bổ sung trong tài liệu.</p>`;
    }

    updateModalFavButton();

    modal.classList.add("open");
    document.body.style.overflow = "hidden";

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([modal]).catch(() => {});
    }
  }

  function updateModalFavButton() {
    if (!activeModalFormula) return;
    const isFav = favorites.includes(activeModalFormula.id);
    const favBtn = container.querySelector("#pfl-modal-fav-toggle");
    if (favBtn) {
      favBtn.innerHTML = isFav ? `<span>★</span> Bỏ yêu thích` : `<span>☆</span> Đánh dấu yêu thích`;
    }
  }

  function closeModal() {
    const modal = container.querySelector("#pfl-detail-modal");
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
    activeModalFormula = null;
  }

  renderSkeleton();

  return function cleanup() {
    clearTimeout(toastTimer);
    const toast = document.getElementById("pfl-toast-box");
    if (toast) toast.remove();
    document.body.style.overflow = "";
    container.innerHTML = "";
  };
}

