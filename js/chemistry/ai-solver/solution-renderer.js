/**
 * js/chemistry/ai-solver/solution-renderer.js
 * Render cấu trúc lời giải bài tập Hóa học
 */

import { escapeHTML } from "../../ui.js";

function mathText(value) {
  return escapeHTML(value ?? "").replace(/\r?\n/g, "<br>");
}

export function renderSolutionHtml(solution) {
  if (!solution) return "";

  const { summary, methodology, equations, steps, finalAnswer, sanityCheck, deepDive, modelUsed } = solution;

  const givenHtml = (summary?.given || []).map(g => `<li>${mathText(g)}</li>`).join("");
  const reqHtml = (summary?.requirements || []).map(r => `<li>${mathText(r)}</li>`).join("");

  const equationsHtml = (equations || []).map(eq => `
    <div style="margin:6px 0;padding:8px 12px;background:#050b14;border-radius:0;font-family:inherit;font-size:14px;color:#38bdf8;">
      <strong>${mathText(eq.equation)}</strong>
      ${eq.condition ? `<span class="muted tiny" style="margin-left:8px;color:#94a3b8;">(${mathText(eq.condition)})</span>` : ''}
    </div>
  `).join("");

  const stepsHtml = (steps || []).map(step => `
    <div style="margin-bottom:14px;padding:12px;background:rgba(255,255,255,0.03);border-radius:0;">
      <div style="font-weight:600;color:#7dd3fc;margin-bottom:4px;">Bước ${step.stepNumber}: ${mathText(step.title)}</div>
      <p style="margin:0 0 6px;">${mathText(step.explanation)}</p>
      ${step.calculation ? `<div style="font-family:inherit;color:#facc15;font-size:13px;background:rgba(0,0,0,0.3);padding:6px 10px;border-radius:0;word-break:break-word;">👉 ${mathText(step.calculation)}</div>` : ''}
      ${step.resultWithUnit ? `<div style="margin-top:6px;font-weight:600;color:#34d399;">↳ Kết quả: ${mathText(step.resultWithUnit)}</div>` : ''}
    </div>
  `).join("");

  return `
    <div class="solution-content">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span class="pill" style="background:#0369a1;color:#e0f2fe;">✨ Lời giải AI (${mathText(modelUsed || 'Gemini 2.5')})</span>
        <span class="muted tiny" style="color:#94a3b8;">Tuân thủ SGK GDPT mới</span>
      </div>

      <div class="solution-section">
        <h4>📋 1. Tóm tắt đề bài & Dữ kiện</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
          <div><strong>Dữ kiện cho:</strong><ul style="margin:4px 0 0;padding-left:18px;">${givenHtml || '<li>Đã ghi nhận dữ kiện từ đề bài.</li>'}</ul></div>
          <div><strong>Yêu cầu cần tìm:</strong><ul style="margin:4px 0 0;padding-left:18px;">${reqHtml || '<li>Giải đáp yêu cầu câu hỏi.</li>'}</ul></div>
        </div>
        ${summary?.standardConditionsUsed ? `<div class="muted tiny" style="margin-top:8px;color:#93c5fd;">ℹ️ Quy chuẩn khí: ${mathText(summary.standardConditionsUsed)}</div>` : ''}
      </div>

      ${equationsHtml ? `
      <div class="solution-section">
        <h4>⚗️ 2. Phương trình phản ứng hóa học</h4>
        ${equationsHtml}
      </div>` : ''}

      <div class="solution-section">
        <h4>📝 3. Các bước giải chi tiết</h4>
        ${stepsHtml}
      </div>

      <div class="solution-final-box">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#a7f3d0;margin-bottom:4px;">🎯 ĐÁP SỐ CUỐI CÙNG</div>
        <strong>${mathText(finalAnswer?.value || '—')}</strong>
        ${finalAnswer?.highlight ? `<p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">${mathText(finalAnswer.highlight)}</p>` : ''}
      </div>

      ${sanityCheck ? `
      <div class="solution-section" style="border-left-color:#f59e0b;">
        <h4>🔍 4. Biện luận & Kiểm tra tính hợp lý</h4>
        <p style="margin:0;font-size:13px;">${mathText(sanityCheck.limitingReactantAnalysis || sanityCheck.conservationVerification || sanityCheck.notes || 'Đã kiểm tra bảo toàn nguyên tố và khối lượng.')}</p>
      </div>` : ''}

      ${deepDive?.chemicalInsight ? `
      <div class="solution-section" style="border-left-color:#8b5cf6;">
        <h4>💡 5. Bản chất hóa học & Mở rộng</h4>
        <p style="margin:0;font-size:13px;color:#c4b5fd;">${mathText(deepDive.chemicalInsight)}</p>
        ${deepDive.similarProblem ? `<div style="margin-top:10px;padding:8px;background:rgba(139,92,246,0.1);border-radius:0;font-size:12px;color:#e9d5ff;"><strong>Bài tương tự luyện tập:</strong><br>${mathText(deepDive.similarProblem)}</div>` : ''}
      </div>` : ''}

      <p class="muted tiny" style="text-align:center;margin-top:20px;color:#64748b;">
        ⚠️ Lưu ý: Lời giải do AI hỗ trợ cho mục đích học tập và ôn luyện. Học sinh cần đối chiếu với tài liệu chính khóa và hướng dẫn của giáo viên.
      </p>
    </div>
  `;
}

