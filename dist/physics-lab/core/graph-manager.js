/**
 * physics-lab/core/graph-manager.js
 * Quản lý vẽ đồ thị thực nghiệm và đường cong lý thuyết thời gian thực trên Canvas 2D
 */

export class GraphManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = window.devicePixelRatio || 1;
    this.points = [];
    this.theoreticalFn = null;
    this.xRange = [0, 10];
    this.yRange = [0, 10];
    this.xLabel = "X";
    this.yLabel = "Y";
    this.currentPoint = null;
    this.title = "Đồ thị thực nghiệm";
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);
  }

  setConfig({ title, xLabel, yLabel, xRange, yRange, theoreticalFn }) {
    if (title) this.title = title;
    if (xLabel) this.xLabel = xLabel;
    if (yLabel) this.yLabel = yLabel;
    if (xRange) this.xRange = xRange;
    if (yRange) this.yRange = yRange;
    this.theoreticalFn = theoreticalFn || null;
  }

  addPoint(x, y) {
    if (this.points.length > 150) this.points.shift();
    this.points.push({ x, y });
  }

  setCurrentPoint(x, y) {
    this.currentPoint = { x, y };
  }

  clearPoints() {
    this.points = [];
    this.currentPoint = null;
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.clearRect(0, 0, w, h);

    const padL = 42;
    const padB = 28;
    const padT = 16;
    const padR = 18;
    const gw = w - padL - padR;
    const gh = h - padB - padT;

    if (gw <= 0 || gh <= 0) return;

    const [xMin, xMax] = this.xRange;
    const [yMin, yMax] = this.yRange;
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;

    const mapX = (val) => padL + ((val - xMin) / xSpan) * gw;
    const mapY = (val) => (h - padB) - ((val - yMin) / ySpan) * gh;

    // Lưới tọa độ
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const gx = padL + (i / 4) * gw;
      ctx.moveTo(gx, padT);
      ctx.lineTo(gx, h - padB);

      const gy = padT + (i / 4) * gh;
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
    }
    ctx.stroke();

    // Hai trục tọa độ chính
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - padR, h - padB);
    ctx.stroke();

    // Nhãn trục
    ctx.fillStyle = "#64748b";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText(this.xLabel, w - padR - 22, h - padB + 20);
    ctx.fillText(this.yLabel, padL - 10, padT - 4);

    // Vạch số Min/Max
    ctx.fillText(xMin.toFixed(1), padL - 6, h - padB + 14);
    ctx.fillText(xMax.toFixed(1), w - padR - 14, h - padB + 14);
    ctx.fillText(yMin.toFixed(1), padL - 28, h - padB + 4);
    ctx.fillText(yMax.toFixed(1), padL - 28, padT + 8);

    // Đường cong lý thuyết
    if (typeof this.theoreticalFn === "function") {
      ctx.save();
      ctx.strokeStyle = "rgba(2, 132, 199, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const xVal = xMin + (i / steps) * xSpan;
        const yVal = this.theoreticalFn(xVal);
        const gx = mapX(xVal);
        const gy = mapY(yVal);
        if (i === 0) ctx.moveTo(gx, gy);
        else ctx.lineTo(gx, gy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Các điểm đo thực nghiệm
    ctx.save();
    ctx.fillStyle = "#dc2626";
    this.points.forEach((pt) => {
      const gx = mapX(pt.x);
      const gy = mapY(pt.y);
      if (gx >= padL && gx <= w - padR && gy >= padT && gy <= h - padB) {
        ctx.beginPath();
        ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

    // Điểm làm việc trực tiếp hiện tại
    if (this.currentPoint) {
      const gx = mapX(this.currentPoint.x);
      const gy = mapY(this.currentPoint.y);
      if (gx >= padL && gx <= w - padR && gy >= padT && gy <= h - padB) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(gx, gy, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = "#16a34a";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

