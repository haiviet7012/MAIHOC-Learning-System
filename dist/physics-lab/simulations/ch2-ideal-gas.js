/**
 * physics-lab/simulations/ch2-ideal-gas.js
 * 5 Mô phỏng thí nghiệm Chương II: Khí lí tưởng
 */

import { FormulaEngine } from "../core/formula-engine.js";

export const idealGasSimulations = {
  // ----------------------------------------------------
  // Thí nghiệm 7: Khảo sát định luật Boyle
  // ----------------------------------------------------
  "exp-07": {
    particles: [],
    pistonDragging: false,
    volume: 2.0,
    init(renderer, graph, item) {
      this.volume = 2.0;
      this.pistonDragging = false;
      this.particles = [];
      for (let i = 0; i < 70; i++) {
        this.particles.push({
          x: 100 + Math.random() * 150,
          y: 70 + Math.random() * 160,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          radius: 3.5
        });
      }
      graph.setConfig({
        title: "Đường đẳng nhiệt p - V (Định luật Boyle)",
        xLabel: "V (Lít)",
        yLabel: "p (kPa)",
        xRange: [0.5, 4.0],
        yRange: [0, 500],
        theoreticalFn: (V) => (0.1 * 8.314 * 300) / (V * 1e-3) / 1000
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const V = this.volume;
      const T = params.tempK || 300;
      const n = params.molN || 0.1;
      const p_kPa = FormulaEngine.calcBoylePressure(n, T, V);

      const cylLeft = 80;
      const cylTop = 60;
      const cylHeight = 240;
      const minW = 100;
      const maxW = 420;
      const cylWidth = minW + ((V - 0.5) / 3.5) * (maxW - minW);

      const speedScale = Math.sqrt(T / 300) * 1.5;

      this.particles.forEach((p) => {
        p.x += p.vx * speedScale * dt * 60;
        p.y += p.vy * speedScale * dt * 60;

        if (p.x - p.radius < cylLeft) {
          p.x = cylLeft + p.radius;
          p.vx = Math.abs(p.vx);
        }
        if (p.x + p.radius > cylLeft + cylWidth) {
          p.x = cylLeft + cylWidth - p.radius;
          p.vx = -Math.abs(p.vx);
        }
        if (p.y - p.radius < cylTop) {
          p.y = cylTop + p.radius;
          p.vy = Math.abs(p.vy);
        }
        if (p.y + p.radius > cylTop + cylHeight) {
          p.y = cylTop + cylHeight - p.radius;
          p.vy = -Math.abs(p.vy);
        }
      });

      if (Math.random() < 0.1) {
        graph.addPoint(V, p_kPa);
      }
      graph.setCurrentPoint(V, p_kPa);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const V = this.volume;
      const T = params.tempK || 300;
      const n = params.molN || 0.1;
      const p_kPa = FormulaEngine.calcBoylePressure(n, T, V);

      const cylLeft = 80;
      const cylTop = 60;
      const cylHeight = 240;
      const minW = 100;
      const maxW = 420;
      const cylWidth = minW + ((V - 0.5) / 3.5) * (maxW - minW);

      // Xi-lanh thủy tinh
      ctx.fillStyle = "rgba(18, 59, 112, 0.04)";
      ctx.fillRect(cylLeft, cylTop, maxW + 40, cylHeight);
      ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
      ctx.fillRect(cylLeft, cylTop, cylWidth, cylHeight);

      // Viền xi-lanh
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cylLeft + maxW + 40, cylTop);
      ctx.lineTo(cylLeft, cylTop);
      ctx.lineTo(cylLeft, cylTop + cylHeight);
      ctx.lineTo(cylLeft + maxW + 40, cylTop + cylHeight);
      ctx.stroke();

      // Vạch chia thể tích
      ctx.fillStyle = "#64748b";
      ctx.font = "10px JetBrains Mono";
      for (let v = 0.5; v <= 4.0; v += 0.5) {
        const markX = cylLeft + minW + ((v - 0.5) / 3.5) * (maxW - minW);
        ctx.beginPath();
        ctx.moveTo(markX, cylTop + cylHeight);
        ctx.lineTo(markX, cylTop + cylHeight + 8);
        ctx.stroke();
        ctx.fillText(`${v}L`, markX - 8, cylTop + cylHeight + 20);
      }

      // Hạt phân tử khí
      this.particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#0284c7";
        ctx.fill();
        ctx.strokeStyle = "#0369a1";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Piston
      const pistonX = cylLeft + cylWidth;
      ctx.fillStyle = "#334155";
      ctx.fillRect(pistonX, cylTop, 16, cylHeight);

      // Cần piston
      ctx.fillStyle = "#64748b";
      ctx.fillRect(pistonX + 16, cylTop + cylHeight / 2 - 8, 80, 16);

      // Tay cầm
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.roundRect(pistonX + 96, cylTop + cylHeight / 2 - 30, 14, 60, [4]);
      ctx.fill();

      // Chú thích kéo piston
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px Montserrat";
      ctx.save();
      ctx.translate(pistonX + 105, cylTop + cylHeight / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText("KÉO PISTON", -24, 3);
      ctx.restore();

      // Áp kế (Dial Meter)
      renderer.drawDialMeter(cylLeft + cylWidth / 2, cylTop - 35, 26, p_kPa, 50, 500, "p =", " kPa");
    },
    getResults(params) {
      const V = this.volume;
      const T = params.tempK || 300;
      const n = params.molN || 0.1;
      const p_kPa = FormulaEngine.calcBoylePressure(n, T, V);
      return [
        { label: "Thể tích khí (V)", value: `${V.toFixed(2)} Lít` },
        { label: "Áp suất đo được (p)", value: `${p_kPa.toFixed(1)} kPa` },
        { label: "Tích số p · V", value: `${(p_kPa * V).toFixed(1)} kJ` },
        { label: "Nhiệt độ hệ (T)", value: `${T} K (Đẳng nhiệt)` }
      ];
    },
    onPointerDown(e, rect) {
      const mx = e.clientX - rect.left;
      const cylLeft = 80;
      const minW = 100;
      const maxW = 420;
      const cylWidth = minW + ((this.volume - 0.5) / 3.5) * (maxW - minW);
      const pistonHandleX = cylLeft + cylWidth + 96;
      if (Math.abs(mx - pistonHandleX) < 45) {
        this.pistonDragging = true;
      }
    },
    onPointerMove(e, rect) {
      if (!this.pistonDragging) return;
      const mx = e.clientX - rect.left;
      const cylLeft = 80;
      const minW = 100;
      const maxW = 420;
      const handleX = mx - 96;
      const currentW = Math.max(minW, Math.min(maxW, handleX - cylLeft));
      const newV = 0.5 + ((currentW - minW) / (maxW - minW)) * 3.5;
      this.volume = Math.round(newV * 20) / 20;
    },
    onPointerUp() {
      this.pistonDragging = false;
    },
    cleanup() {
      this.particles = [];
    }
  },

  // ----------------------------------------------------
  // Thí nghiệm 8: Khảo sát định luật Charles
  // ----------------------------------------------------
  "exp-08": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Đường đẳng áp V - T (Định luật Charles)",
        xLabel: "T (K)",
        yLabel: "V (Lít)",
        xRange: [0, 600],
        yRange: [0, 6],
        theoreticalFn: (T) => (2.0 / 300) * T
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const T = params.tempT || 300;
      const V = FormulaEngine.calcCharlesVolume(2.0, 300, T);
      if (Math.random() < 0.15) {
        graph.addPoint(T, V);
      }
      graph.setCurrentPoint(T, V);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const T = params.tempT || 300;
      const V = FormulaEngine.calcCharlesVolume(2.0, 300, T);

      // Bình khí thẳng đứng có piston tự do
      ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
      const cylW = 140;
      const maxH = 180;
      const gasH = (V / 4.0) * maxH;

      ctx.fillRect(cx - cylW / 2, cy + 80 - gasH, cylW, gasH);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - cylW / 2, cy - 100);
      ctx.lineTo(cx - cylW / 2, cy + 80);
      ctx.lineTo(cx + cylW / 2, cy + 80);
      ctx.lineTo(cx + cylW / 2, cy - 100);
      ctx.stroke();

      // Piston nằm trên mặt khí
      ctx.fillStyle = "#475569";
      ctx.fillRect(cx - cylW / 2 + 2, cy + 80 - gasH - 14, cylW - 4, 14);

      // Bếp gia nhiệt ở dưới đáy
      ctx.fillStyle = "#f97316";
      ctx.fillRect(cx - 60, cy + 90, 120, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Montserrat";
      ctx.fillText(`BẾP GIA NHIỆT: ${T} K`, cx - 50, cy + 103);

      // Nhiệt kế
      renderer.drawDialMeter(cx + 120, cy - 20, 32, T, 200, 600, "T =", " K");
    },
    getResults(params) {
      const T = params.tempT || 300;
      const V = FormulaEngine.calcCharlesVolume(2.0, 300, T);
      return [
        { label: "Nhiệt độ tuyệt đối (T)", value: `${T} K (${(T - 273.15).toFixed(1)} °C)` },
        { label: "Thể tích tương ứng (V)", value: `${V.toFixed(2)} Lít` },
        { label: "Tỉ số V / T", value: `${(V / T).toFixed(4)} L/K (Hằng số)` },
        { label: "Áp suất duy trì (p)", value: `${params.fixedPressure || 100} kPa (Đẳng áp)` }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 9: Phương trình trạng thái khí lí tưởng
  // ----------------------------------------------------
  "exp-09": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Tương quan (p · V) / T = n · R",
        xLabel: "V (L)",
        yLabel: "p (kPa)",
        xRange: [1, 5],
        yRange: [0, 500],
        theoreticalFn: (V) => (0.1 * 8.314 * 320) / (V * 1e-3) / 1000
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const V = params.stateV || 2.0;
      const T = params.stateT || 300;
      const n = params.stateN || 0.1;
      const p = FormulaEngine.calcIdealGasPressure(n, T, V);
      graph.setCurrentPoint(V, p);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const V = params.stateV || 2.0;
      const T = params.stateT || 300;
      const n = params.stateN || 0.1;
      const p = FormulaEngine.calcIdealGasPressure(n, T, V);

      // Bình cầu chứa khí
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
      ctx.fill();
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Đồng hồ đo p, V, T xung quanh
      renderer.drawDialMeter(cx - 120, cy - 60, 30, p, 50, 400, "p =", " kPa");
      renderer.drawDialMeter(cx + 120, cy - 60, 30, T, 200, 600, "T =", " K");

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`(p · V) / T = ${((p * 1000 * V * 1e-3) / T).toFixed(3)} J/K`, cx, cy + 110);
      ctx.fillText(`n · R = ${(n * 8.314).toFixed(3)} J/K  (KHỚP 100%)`, cx, cy + 130);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const V = params.stateV || 2.0;
      const T = params.stateT || 300;
      const n = params.stateN || 0.1;
      const p = FormulaEngine.calcIdealGasPressure(n, T, V);
      const pv_over_t = (p * 1000 * V * 1e-3) / T;
      return [
        { label: "Áp suất tính được (p)", value: `${p.toFixed(1)} kPa` },
        { label: "Thể tích khí (V)", value: `${V.toFixed(2)} L` },
        { label: "Nhiệt độ (T)", value: `${T} K` },
        { label: "Giá trị (p·V)/T", value: `${pv_over_t.toFixed(3)} J/K` }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 10: Chuyển động nhiệt phân tử khí
  // ----------------------------------------------------
  "exp-10": {
    particles: [],
    init(renderer, graph) {
      this.particles = [];
      for (let i = 0; i < 60; i++) {
        this.particles.push({
          x: Math.random() * 240,
          y: Math.random() * 180,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5
        });
      }
      graph.setConfig({
        title: "Vận tốc căn quân phương v_rms theo T",
        xLabel: "T (K)",
        yLabel: "v_rms (m/s)",
        xRange: [100, 800],
        yRange: [200, 900],
        theoreticalFn: (T) => FormulaEngine.calcRmsSpeed(T)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const T = params.tempSpeed || 300;
      const v_rms = FormulaEngine.calcRmsSpeed(T);
      const speedFactor = (v_rms / 500) * 1.5;

      this.particles.forEach((p) => {
        p.x += p.vx * speedFactor * dt * 40;
        p.y += p.vy * speedFactor * dt * 40;
        if (p.x < 10 || p.x > 230) p.vx *= -1;
        if (p.y < 10 || p.y > 170) p.vy *= -1;
      });

      graph.setCurrentPoint(T, v_rms);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const T = params.tempSpeed || 300;
      const v_rms = FormulaEngine.calcRmsSpeed(T);

      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 130, cy - 100, 260, 200);

      ctx.save();
      ctx.translate(cx - 120, cy - 90);
      this.particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();

        // Vector vận tốc nhỏ
        ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 3, p.y + p.vy * 3);
        ctx.stroke();
      });
      ctx.restore();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`T = ${T} K  ⟶  v_rms = ${Math.round(v_rms)} m/s`, cx, cy + 125);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const T = params.tempSpeed || 300;
      const v_rms = FormulaEngine.calcRmsSpeed(T);
      return [
        { label: "Nhiệt độ tuyệt đối (T)", value: `${T} K` },
        { label: "Vận tốc căn quân phương", value: `${Math.round(v_rms)} m/s` },
        { label: "Động năng tịnh tiến TB", value: `${((1.5 * 1.38e-23 * T) / 1e-21).toFixed(2)} × 10⁻²¹ J` },
        { label: "Phân tử khí chuẩn", value: "Không khí (μ = 29 g/mol)" }
      ];
    },
    cleanup() {
      this.particles = [];
    }
  },

  // ----------------------------------------------------
  // Thí nghiệm 11: Sự hình thành áp suất từ va chạm phân tử
  // ----------------------------------------------------
  "exp-11": {
    particles: [],
    collisionCount: 0,
    init(renderer, graph) {
      this.particles = [];
      this.collisionCount = 0;
      for (let i = 0; i < 50; i++) {
        this.particles.push({
          x: Math.random() * 200,
          y: Math.random() * 140,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4
        });
      }
      graph.setConfig({
        title: "Tần suất va chạm phân tử lên thành bình",
        xLabel: "Thời gian (s)",
        yLabel: "Số va chạm/s",
        xRange: [0, 50],
        yRange: [0, 500]
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const T = params.vTemp || 300;
      const factor = Math.sqrt(T / 300);

      this.particles.forEach((p) => {
        p.x += p.vx * factor;
        p.y += p.vy * factor;

        if (p.x < 5 || p.x > 195) {
          p.vx *= -1;
          this.collisionCount++;
        }
        if (p.y < 5 || p.y > 135) {
          p.vy *= -1;
          this.collisionCount++;
        }
      });

      if (Math.random() < 0.2) {
        graph.addPoint(time, (this.collisionCount / (time || 1)) * 5);
      }
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;

      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 105, cy - 75, 210, 150);

      ctx.save();
      ctx.translate(cx - 100, cy - 70);
      this.particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#0284c7";
        ctx.fill();
      });
      ctx.restore();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 12px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`TỔNG SỐ LẦN VA CHẠM THÀNH BÌNH: ${this.collisionCount}`, cx, cy + 105);
      ctx.fillText("Áp suất p = (2/3) · n₀ · E_đ hình thành từ xung lực các va chạm", cx, cy + 125);
      ctx.textAlign = "left";
    },
    getResults(params) {
      return [
        { label: "Tổng số cú va chạm", value: `${this.collisionCount}` },
        { label: "Nhiệt độ (T)", value: `${params.vTemp || 300} K` },
        { label: "Số lượng hạt (N)", value: `${params.particleCount || 70} hạt` },
        { label: "Bản chất áp suất", value: "Xung lượng 2mv_x truyền lên diện tích S" }
      ];
    },
    cleanup() {
      this.particles = [];
    }
  }
};

