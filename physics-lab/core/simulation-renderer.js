/**
 * physics-lab/core/simulation-renderer.js
 * Quản lý vẽ đồ họa 2D Hi-DPI, khử răng cưa và các tiện ích vẽ linh kiện thí nghiệm
 */

export class SimulationRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.dpr = window.devicePixelRatio || 1;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  drawGrid(gridSize = 30, color = "rgba(148, 163, 184, 0.15)") {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = 0; x <= this.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = 0; y <= this.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawArrow(x1, y1, x2, y2, color = "#dc2626", lineWidth = 2, headLen = 10) {
    const ctx = this.ctx;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawDialMeter(cx, cy, radius, value, minVal, maxVal, label = "", unit = "") {
    const ctx = this.ctx;
    ctx.save();

    // Vỏ đồng hồ
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Vạch chia
    const startAngle = -Math.PI * 0.75;
    const endAngle = Math.PI * 0.75;
    const totalAngle = endAngle - startAngle;

    for (let i = 0; i <= 5; i++) {
      const a = startAngle + (i / 5) * totalAngle;
      const x1 = cx + Math.cos(a) * (radius - 8);
      const y1 = cy + Math.sin(a) * (radius - 8);
      const x2 = cx + Math.cos(a) * (radius - 2);
      const y2 = cy + Math.sin(a) * (radius - 2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Kim chỉ
    const clampedVal = Math.max(minVal, Math.min(maxVal, value));
    const ratio = (clampedVal - minVal) / (maxVal - minVal || 1);
    const needleAngle = startAngle + ratio * totalAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 6), cy + Math.sin(needleAngle) * (radius - 6));
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Trục kim
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    // Chú thích
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 9px Montserrat, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${label} ${value.toFixed(1)}${unit}`, cx, cy + radius * 0.65);

    ctx.restore();
  }
}

