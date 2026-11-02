/**
 * physics-lab/simulations/ch1-thermal.js
 * 6 Mô phỏng thí nghiệm Chương I: Vật lí nhiệt
 */

import { FormulaEngine } from "../core/formula-engine.js";

export const thermalSimulations = {
  // ----------------------------------------------------
  // Thí nghiệm 1: Xác định nhiệt dung riêng của một chất
  // ----------------------------------------------------
  "exp-01": {
    state: { temp: 25, time: 0 },
    init(renderer, graph, item) {
      this.state.temp = 25;
      this.state.time = 0;
      graph.setConfig({
        title: "Đồ thị tăng nhiệt độ T theo thời gian",
        xLabel: "t (s)",
        yLabel: "T (°C)",
        xRange: [0, 120],
        yRange: [20, 80],
        theoreticalFn: (t) => 25 + (150 / (0.3 * 4184)) * t
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      this.state.time += dt;
      const P = params.power || 150;
      const m = params.mass || 0.3;
      const T1 = params.tInitial || 25;
      const c = 4184; // Nước chuẩn: 4184 J/(kg.K)

      const deltaT = (P * this.state.time) / (m * c);
      this.state.temp = T1 + deltaT;

      if (Math.random() < 0.15) {
        graph.addPoint(this.state.time, this.state.temp);
      }
      graph.setCurrentPoint(this.state.time, this.state.temp);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const w = renderer.width;
      const h = renderer.height;
      const cx = w / 2;
      const cy = h / 2;

      // 1. Thân bình nhiệt lượng kế
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(cx - 110, cy - 80, 220, 180);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 110, cy - 80, 220, 180);

      // Ruột cốc cách nhiệt & chất lỏng
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(cx - 85, cy - 20, 170, 110);
      ctx.strokeRect(cx - 85, cy - 65, 170, 155);

      // Dây nung điện trở
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy - 50);
      ctx.lineTo(cx - 40, cy + 50);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(cx - 40 + i * 20, cy + (i % 2 === 0 ? 70 : 50));
      }
      ctx.lineTo(cx + 40, cy - 50);
      ctx.stroke();

      // Que khuấy
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 60, cy - 100);
      ctx.lineTo(cx - 60, cy + 60);
      ctx.arc(cx - 60, cy + 60, 15, 0, Math.PI);
      ctx.stroke();

      // Nhiệt kế điện tử
      renderer.drawDialMeter(cx + 60, cy - 90, 36, this.state.temp, 20, 90, "T =", "°C");

      // Chú thích
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 11px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText("BÌNH NHIỆT LƯỢNG KẾ & DÂY NUNG", cx, cy + 120);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const P = params.power || 150;
      const m = params.mass || 0.3;
      const T1 = params.tInitial || 25;
      const T2 = this.state.temp;
      const deltaT = T2 - T1;
      const c = deltaT > 0 ? (P * this.state.time) / (m * deltaT) : 4184;
      return [
        { label: "Nhiệt lượng cung cấp (Q)", value: `${(P * this.state.time).toFixed(0)} J` },
        { label: "Độ tăng nhiệt độ (ΔT)", value: `${deltaT.toFixed(2)} °C` },
        { label: "Nhiệt dung riêng tính được (c)", value: `${Math.round(c)} J/(kg·K)` },
        { label: "Nhiệt dung riêng chuẩn (H₂O)", value: "4184 J/(kg·K)" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 2: Xác định nhiệt nóng chảy riêng của nước đá
  // ----------------------------------------------------
  "exp-02": {
    state: { meltedMass: 0, time: 0, temp: 0 },
    init(renderer, graph) {
      this.state.meltedMass = 0;
      this.state.time = 0;
      this.state.temp = 0;
      graph.setConfig({
        title: "Nhiệt độ hỗn hợp nước đá theo thời gian",
        xLabel: "t (s)",
        yLabel: "T (°C)",
        xRange: [0, 100],
        yRange: [-5, 25],
        theoreticalFn: (t) => (t < 60 ? 0 : (t - 60) * 0.4)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      this.state.time += dt;
      const P = params.heaterPower || 100;
      const totalIce = (params.iceMass || 50) * 1e-3; // kg
      const lambda = 3.34e5; // J/kg

      // Khối lượng đá tan: m = Q / lambda = (P * t) / lambda
      const melted = (P * this.state.time) / lambda;
      this.state.meltedMass = Math.min(totalIce, melted);

      if (this.state.meltedMass >= totalIce) {
        // Sau khi đá tan hết, nhiệt độ mới bắt đầu tăng
        const extraTime = this.state.time - (totalIce * lambda) / P;
        this.state.temp = (P * extraTime) / (totalIce * 4184);
      } else {
        this.state.temp = 0.0;
      }

      if (Math.random() < 0.2) {
        graph.addPoint(this.state.time, this.state.temp);
      }
      graph.setCurrentPoint(this.state.time, this.state.temp);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const totalIce = (params.iceMass || 50) * 1e-3;
      const remainingIceRatio = Math.max(0, 1 - this.state.meltedMass / totalIce);

      // Cốc thủy tinh
      ctx.fillStyle = "rgba(186, 230, 253, 0.4)";
      ctx.fillRect(cx - 90, cy - 60, 180, 150);
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 90, cy - 60, 180, 150);

      // Nước tan
      const waterHeight = 130 * (1 - remainingIceRatio * 0.7);
      ctx.fillStyle = "rgba(56, 189, 248, 0.5)";
      ctx.fillRect(cx - 88, cy + 88 - waterHeight, 176, waterHeight);

      // Các khối nước đá vụn nổi
      if (remainingIceRatio > 0.02) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1.5;
        const count = Math.ceil(remainingIceRatio * 10);
        for (let i = 0; i < count; i++) {
          const ix = cx - 60 + (i % 4) * 35;
          const iy = cy + 20 - Math.floor(i / 4) * 30;
          const size = 20 * remainingIceRatio;
          ctx.fillRect(ix, iy, size, size);
          ctx.strokeRect(ix, iy, size, size);
        }
      }

      // Nhiệt kế cắm vào
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(cx + 50, cy - 100, 8, 160);
      ctx.beginPath();
      ctx.arc(cx + 54, cy + 65, 10, 0, Math.PI * 2);
      ctx.fill();

      // Đồng hồ đo nhiệt độ
      renderer.drawDialMeter(cx - 120, cy - 40, 32, this.state.temp, -5, 30, "T =", "°C");

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 11px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`NƯỚC ĐÁ ĐANG TAN Ở ${this.state.temp.toFixed(1)}°C (GIAI ĐOẠN CHUYỂN PHA)`, cx, cy + 115);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const P = params.heaterPower || 100;
      const totalIce = (params.iceMass || 50) * 1e-3;
      const lambdaCalc = this.state.meltedMass > 0 ? (P * this.state.time) / this.state.meltedMass : 3.34e5;
      return [
        { label: "Khối lượng đá đã tan (m)", value: `${(this.state.meltedMass * 1000).toFixed(1)} g` },
        { label: "Nhiệt độ hỗn hợp", value: `${this.state.temp.toFixed(1)} °C` },
        { label: "Nhiệt nóng chảy riêng λ", value: `${(lambdaCalc / 1e5).toFixed(2)} × 10⁵ J/kg` },
        { label: "Nhiệt nóng chảy chuẩn", value: "3.34 × 10⁵ J/kg" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 3: Xác định nhiệt hóa hơi riêng của nước
  // ----------------------------------------------------
  "exp-03": {
    state: { vaporizedMass: 0, time: 0 },
    init(renderer, graph) {
      this.state.vaporizedMass = 0;
      this.state.time = 0;
      graph.setConfig({
        title: "Khối lượng hơi nước thoát ra theo thời gian",
        xLabel: "t (s)",
        yLabel: "Δm (g)",
        xRange: [0, 80],
        yRange: [0, 25],
        theoreticalFn: (t) => (600 * t) / 2.26e6 * 1000
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      this.state.time += dt;
      const P = params.waterPower || 600;
      const L = 2.26e6; // J/kg
      this.state.vaporizedMass = ((P * this.state.time) / L) * 1000; // gram

      if (Math.random() < 0.2) {
        graph.addPoint(this.state.time, this.state.vaporizedMass);
      }
      graph.setCurrentPoint(this.state.time, this.state.vaporizedMass);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;

      // Ấm đun thủy tinh
      ctx.fillStyle = "rgba(224, 242, 254, 0.3)";
      ctx.fillRect(cx - 80, cy - 50, 160, 140);
      ctx.strokeStyle = "#0369a1";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 80, cy - 50, 160, 140);

      // Nước đang sôi (bọt khí bốc lên)
      ctx.fillStyle = "rgba(14, 165, 233, 0.4)";
      ctx.fillRect(cx - 78, cy - 20, 156, 108);

      // Bong bóng sôi
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 8; i++) {
        const bx = cx - 60 + Math.sin(this.state.time * 4 + i) * 50 + 20;
        const by = cy + 80 - ((this.state.time * 60 + i * 25) % 100);
        ctx.beginPath();
        ctx.arc(bx, by, 4 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }

      // Hơi nước bốc lên từ miệng bình
      ctx.fillStyle = "rgba(241, 245, 249, 0.6)";
      for (let i = 0; i < 5; i++) {
        const sx = cx - 30 + i * 15 + Math.sin(this.state.time * 3 + i) * 10;
        const sy = cy - 60 - ((this.state.time * 40 + i * 20) % 60);
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + i, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cân điện tử ở dưới đáy
      ctx.fillStyle = "#334155";
      ctx.fillRect(cx - 110, cy + 95, 220, 24);
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 13px JetBrains Mono";
      const remainingGrams = Math.max(0, (params.initialWater || 200) - this.state.vaporizedMass);
      ctx.fillText(`${remainingGrams.toFixed(1)} g`, cx - 30, cy + 112);
    },
    getResults(params) {
      const P = params.waterPower || 600;
      const deltaM_kg = this.state.vaporizedMass * 1e-3;
      const L_calc = deltaM_kg > 0 ? (P * this.state.time) / deltaM_kg : 2.26e6;
      return [
        { label: "Khối lượng nước bốc hơi (Δm)", value: `${this.state.vaporizedMass.toFixed(2)} g` },
        { label: "Nhiệt hóa hơi riêng L", value: `${(L_calc / 1e6).toFixed(2)} × 10⁶ J/kg` },
        { label: "Nhiệt hóa hơi chuẩn (100°C)", value: "2.26 × 10⁶ J/kg" },
        { label: "Nhiệt độ sôi", value: "100.0 °C" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 4: Mô phỏng nóng chảy và đông đặc (Mô hình hạt)
  // ----------------------------------------------------
  "exp-04": {
    particles: [],
    init(renderer, graph) {
      this.particles = [];
      const cols = 8;
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this.particles.push({
            origX: c * 26,
            origY: r * 26,
            x: c * 26,
            y: r * 26,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2
          });
        }
      }
      graph.setConfig({
        title: "Trật tự mạng tinh thể vi mô",
        xLabel: "Nhiệt độ T (K)",
        yLabel: "Biên độ dao động",
        xRange: [100, 500],
        yRange: [0, 20],
        theoreticalFn: (T) => Math.sqrt(T / 100) * 4
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const T = params.latticeTemp || 200;
      const isLiquid = T >= 273.15;
      const speed = Math.sqrt(T / 100) * 2;

      this.particles.forEach((p) => {
        if (!isLiquid) {
          // Thể rắn: dao động điều hòa quanh nút mạng
          p.x = p.origX + Math.sin(time * 8 + p.origX) * (T / 80);
          p.y = p.origY + Math.cos(time * 8 + p.origY) * (T / 80);
        } else {
          // Thể lỏng: trượt tự do va chạm
          p.x += p.vx * speed * dt * 30;
          p.y += p.vy * speed * dt * 30;
          if (p.x < 0 || p.x > 200) p.vx *= -1;
          if (p.y < 0 || p.y > 150) p.vy *= -1;
        }
      });

      graph.setCurrentPoint(T, Math.sqrt(T / 100) * 4);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const T = params.latticeTemp || 200;
      const isLiquid = T >= 273.15;

      // Khung bình chứa
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 120, cy - 90, 240, 180);

      ctx.save();
      ctx.translate(cx - 100, cy - 70);

      // Nối dây lò xo liên kết ở thể rắn
      if (!isLiquid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
        ctx.lineWidth = 1;
        this.particles.forEach((p, idx) => {
          if ((idx + 1) % 8 !== 0 && this.particles[idx + 1]) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(this.particles[idx + 1].x, this.particles[idx + 1].y);
            ctx.stroke();
          }
        });
      }

      // Vẽ các phân tử
      this.particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = isLiquid ? "#0284c7" : "#0d9488";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.restore();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(
        isLiquid ? "TRẠNG THÁI LỎNG (CÁC PHÂN TỬ TRƯỢT HỖN LOẠN)" : "TRẠNG THÁI RẮN (MẠNG TINH THỂ CỐ ĐỊNH DAO ĐỘNG)",
        cx,
        cy + 115
      );
      ctx.textAlign = "left";
    },
    getResults(params) {
      const T = params.latticeTemp || 200;
      return [
        { label: "Nhiệt độ hệ (T)", value: `${T} K` },
        { label: "Trạng thái pha", value: T >= 273.15 ? "Thể lỏng" : "Thể rắn" },
        { label: "Trật tự liên kết", value: T >= 273.15 ? "Hỗn loạn / Trượt tự do" : "Trật tự gần / Nút mạng" },
        { label: "Điểm nóng chảy", value: "273.15 K (0.0 °C)" }
      ];
    },
    cleanup() {
      this.particles = [];
    }
  },

  // ----------------------------------------------------
  // Thí nghiệm 5: Mô phỏng quá trình hóa hơi và ngưng tụ
  // ----------------------------------------------------
  "exp-05": {
    particles: [],
    init(renderer, graph) {
      this.particles = [];
      for (let i = 0; i < 70; i++) {
        this.particles.push({
          x: Math.random() * 220,
          y: 70 + Math.random() * 80, // Trong pha lỏng
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          isVapor: false
        });
      }
      graph.setConfig({
        title: "Áp suất hơi bão hòa theo nhiệt độ",
        xLabel: "T (°C)",
        yLabel: "p (kPa)",
        xRange: [20, 100],
        yRange: [0, 110],
        theoreticalFn: (T) => 2.33 * Math.exp(0.045 * (T - 20))
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const T = params.fluidTemp || 50;
      const escapeProb = 0.005 * (T / 30);
      const condenseProb = 0.01;

      this.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 10 || p.x > 210) p.vx *= -1;

        if (!p.isVapor) {
          // Trong pha lỏng (y > 60)
          if (p.y > 140) p.vy = -Math.abs(p.vy);
          if (p.y < 60) {
            if (Math.random() < escapeProb) {
              p.isVapor = true; // Bay hơi
              p.vy = -Math.abs(p.vy);
            } else {
              p.vy = Math.abs(p.vy);
            }
          }
        } else {
          // Trong pha hơi (y < 60)
          if (p.y < 10) p.vy = Math.abs(p.vy);
          if (p.y >= 60) {
            if (Math.random() < condenseProb) {
              p.isVapor = false; // Ngưng tụ
              p.vy = Math.abs(p.vy);
            } else {
              p.vy = -Math.abs(p.vy);
            }
          }
        }
      });

      const pSat = 2.33 * Math.exp(0.045 * (T - 20));
      graph.setCurrentPoint(T, pSat);
    },
    render(renderer) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;

      // Bình kín
      ctx.fillStyle = "rgba(186, 230, 253, 0.15)";
      ctx.fillRect(cx - 120, cy - 80, 240, 160);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 120, cy - 80, 240, 160);

      // Mặt thoáng chất lỏng
      ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
      ctx.fillRect(cx - 118, cy - 20, 236, 98);
      ctx.strokeStyle = "#0284c7";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 118, cy - 20);
      ctx.lineTo(cx + 118, cy - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.translate(cx - 110, cy - 80);

      this.particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.isVapor ? 3.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = p.isVapor ? "#ef4444" : "#0284c7";
        ctx.fill();
      });

      ctx.restore();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 11px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText("PHA HƠI (BAY HƠI ⇌ NGƯNG TỤ)", cx, cy - 45);
      ctx.fillText("PHA LỎNG", cx, cy + 50);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const T = params.fluidTemp || 50;
      const vaporCount = this.particles.filter((p) => p.isVapor).length;
      const pSat = 2.33 * Math.exp(0.045 * (T - 20));
      return [
        { label: "Nhiệt độ chất lỏng", value: `${T} °C` },
        { label: "Số phân tử pha hơi", value: `${vaporCount} phân tử` },
        { label: "Áp suất hơi bão hòa", value: `${pSat.toFixed(2)} kPa` },
        { label: "Trạng thái", value: "Cân bằng động" }
      ];
    },
    cleanup() {
      this.particles = [];
    }
  },

  // ----------------------------------------------------
  // Thí nghiệm 6: Sự thay đổi nội năng khi truyền nhiệt và sinh công
  // ----------------------------------------------------
  "exp-06": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Cân bằng năng lượng theo Định luật I",
        xLabel: "Q (J)",
        yLabel: "ΔU (J)",
        xRange: [-200, 300],
        yRange: [-200, 400],
        theoreticalFn: (Q) => Q + 50
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const Q = params.heatTransferred || 100;
      const A = params.workDone || 50;
      const deltaU = Q + A;
      graph.setCurrentPoint(Q, deltaU);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const Q = params.heatTransferred || 100;
      const A = params.workDone || 50;
      const deltaU = Q + A;

      // Xi-lanh và piston
      ctx.fillStyle = "rgba(203, 213, 225, 0.4)";
      ctx.fillRect(cx - 100, cy - 60, 200, 120);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 100, cy - 60, 200, 120);

      // Piston (vị trí phụ thuộc công A)
      const pistonOffset = (A / 150) * 30;
      ctx.fillStyle = "#64748b";
      ctx.fillRect(cx + 30 - pistonOffset, cy - 60, 16, 120);

      // Mũi tên công A
      if (A > 0) {
        renderer.drawArrow(cx + 120, cy, cx + 55 - pistonOffset, cy, "#16a34a", 3);
        ctx.fillText(`A = +${A}J (Nén)`, cx + 60, cy - 15);
      } else {
        renderer.drawArrow(cx + 45 - pistonOffset, cy, cx + 120, cy, "#dc2626", 3);
        ctx.fillText(`A = ${A}J (Giãn)`, cx + 60, cy - 15);
      }

      // Ngọn lửa cấp nhiệt Q ở dưới đáy
      if (Q > 0) {
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(cx - 30, cy + 75, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(`Q = +${Q}J (Cấp nhiệt)`, cx - 60, cy + 105);
      }

      // Thanh năng lượng hiển thị ΔU
      ctx.fillStyle = deltaU >= 0 ? "#16a34a" : "#dc2626";
      ctx.font = "bold 14px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`ΔU = A + Q = ${deltaU > 0 ? "+" : ""}${deltaU} Joule`, cx, cy - 80);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const Q = params.heatTransferred || 100;
      const A = params.workDone || 50;
      const deltaU = Q + A;
      return [
        { label: "Nhiệt lượng hệ nhận (Q)", value: `${Q > 0 ? "+" : ""}${Q} J` },
        { label: "Công hệ nhận (A)", value: `${A > 0 ? "+" : ""}${A} J` },
        { label: "Biến thiên nội năng (ΔU)", value: `${deltaU > 0 ? "+" : ""}${deltaU} J` },
        { label: "Kết luận nội năng", value: deltaU > 0 ? "Nội năng TĂNG" : deltaU < 0 ? "Nội năng GIẢM" : "Nội năng KHÔNG ĐỔI" }
      ];
    },
    cleanup() {}
  }
};

