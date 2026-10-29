/**
 * js/chemistry/periodic-table/element-detail.js
 * Component hiển thị thông tin chi tiết một nguyên tố hóa học
 */

import { escapeHTML } from "../../ui.js";

export function renderElementModal(element) {
  if (!element) return "";

  const shells = Array.isArray(element.electronsPerShell)
    ? element.electronsPerShell.join(" - ")
    : "Chưa xác định";

  const oxidation = Array.isArray(element.oxidationStates) && element.oxidationStates.length
    ? element.oxidationStates.map(v => (v > 0 ? `+${v}` : v)).join(", ")
    : "Chưa xác định";

  return `
  <dialog id="element-detail-dialog" class="modal element-detail-modal" style="width:min(640px,calc(100% - 28px));">
    <div class="modal-heading">
      <div>
        <span class="pill cat-${escapeHTML(element.category || 'unknown')}">${escapeHTML(element.categoryVi || element.category)}</span>
        <h2 style="margin:4px 0 0;font-size:24px;">${escapeHTML(element.nameVi)} (${escapeHTML(element.symbol)}) — Z = ${element.number}</h2>
        <span class="muted tiny">Tên quốc tế: ${escapeHTML(element.name)} · Khối: ${escapeHTML(element.block || '—')} · Chu kỳ: ${element.period} · Nhóm: ${element.group || 'Lanthanide/Actinide'}</span>
      </div>
      <button type="button" class="close-button" data-close-element aria-label="Đóng">×</button>
    </div>

    <div class="element-detail-body" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;">
      <div class="card" style="padding:14px;">
        <h4 style="margin:0 0 10px;color:var(--primary);font-size:13px;text-transform:uppercase;">Cấu tạo nguyên tử</h4>
        <p style="margin:4px 0;"><strong>Số proton / electron:</strong> ${element.number}</p>
        <p style="margin:4px 0;"><strong>Nguyên tử khối ($A_r$):</strong> ${element.atomicMass} ${element.isRadioactive ? '<span class="pill tiny" style="background:#ef444422;color:#f87171;">Phóng xạ</span>' : ''}</p>
        <p style="margin:4px 0;"><strong>Cấu hình e:</strong> <code>${escapeHTML(element.electronConfiguration || 'Chưa xác định')}</code></p>
        <p style="margin:4px 0;"><strong>e theo lớp:</strong> ${shells}</p>
        <p style="margin:4px 0;"><strong>Độ âm điện (Pauling):</strong> ${element.electronegativity ?? 'Chưa xác định'}</p>
        <p style="margin:4px 0;"><strong>Số oxi hóa:</strong> ${oxidation}</p>
      </div>

      <div class="card" style="padding:14px;">
        <h4 style="margin:0 0 10px;color:var(--primary);font-size:13px;text-transform:uppercase;">Tính chất & Ứng dụng</h4>
        <p style="margin:4px 0;"><strong>Trạng thái (298 K):</strong> ${escapeHTML(element.standardStateVi || element.standardState || 'Chưa xác định')}</p>
        <p style="margin:4px 0;"><strong>Hợp chất tiêu biểu:</strong> ${Array.isArray(element.representativeCompounds) && element.representativeCompounds.length ? element.representativeCompounds.map(c => `<code>${escapeHTML(c)}</code>`).join(", ") : 'Đang cập nhật'}</p>
        <p style="margin:4px 0;"><strong>Ứng dụng chính:</strong> ${escapeHTML(element.applicationsVi || 'Đang cập nhật tư liệu thực tế.')}</p>
        ${element.safetyWarningVi ? `<p style="margin:6px 0 0;color:var(--danger);font-size:12px;">⚠️ <strong>Cảnh báo an toàn:</strong> ${escapeHTML(element.safetyWarningVi)}</p>` : ''}
      </div>
    </div>

    <div class="modal-actions" style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;gap:8px;">
        <button type="button" class="button secondary small" data-nav-prev ${element.number <= 1 ? 'disabled' : ''}>← ${element.number > 1 ? `Z=${element.number - 1}` : 'Đầu bảng'}</button>
        <button type="button" class="button secondary small" data-nav-next ${element.number >= 118 ? 'disabled' : ''}>${element.number < 118 ? `Z=${element.number + 1}` : 'Cuối bảng'} →</button>
      </div>
      <button type="button" class="button primary small" data-action="solve-with-element" data-symbol="${escapeHTML(element.symbol)}" data-name="${escapeHTML(element.nameVi)}">⚗️ Giải bài tập về chất này với AI →</button>
    </div>
  </dialog>
  `;
}

