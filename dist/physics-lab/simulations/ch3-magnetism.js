/**
 * physics-lab/simulations/ch3-magnetism.js
 * 9 Mô phỏng thí nghiệm Chương III: Từ trường
 */

import { FormulaEngine } from "../core/formula-engine.js";

export const magnetismSimulations = {
  // ----------------------------------------------------
  // Thí nghiệm 12: Khảo sát từ trường bằng kim nam châm
  // ----------------------------------------------------
  "exp-12": {
    needleX: 280,
    needleY: 100,
    isDragging: false,
    angle: 0,
    totalB: 0,
    init(renderer, graph) {
      this.needleX = 280;
      this.needleY = 100;
      this.isDragging = false;
      graph.setConfig({
        title: "Cảm ứng từ B theo khoảng cách r đến tâm nam châm",
        xLabel: "r (cm)",
        yLabel: "B (mT)",
        xRange: [5, 30],
        yRange: [0, 60],
        theoreticalFn: (r) => (50 * Math.pow(10 / r, 3))
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph, renderer) {
      const w = renderer.width;
      const h = renderer.height;
      const magX = w / 2;
      const magY = h / 2;
      const L = (params.magnetDist || 10) * 10;
      const b0 = params.magnetB0 || 50;

      const nX = magX + L / 2;
      const nY = magY;
      const sX = magX - L / 2;
      const sY = magY;

      const px = this.needleX;
      const py = this.needleY;

      const rxN = px - nX;
      const ryN = py - nY;
      const rN = Math.hypot(rxN, ryN) || 1;
      const bN = (b0 * 1000) / (rN * rN);
      const bxN = bN * (rxN / rN);
      const byN = bN * (ryN / rN);

      const rxS = px - sX;
      const ryS = py - sY;
      const rS = Math.hypot(rxS, ryS) || 1;
      const bS = (b0 * 1000) / (rS * rS);
      const bxS = -bS * (rxS / rS);
      const byS = -bS * (ryS / rS);

      const totalBx = bxN + bxS;
      const totalBy = byN + byS;
      this.totalB = Math.hypot(totalBx, totalBy);
      this.angle = Math.atan2(totalBy, totalBx);

      const rCenterCm = Math.hypot(px - magX, py - magY) / 10;
      if (Math.random() < 0.2) {
        graph.addPoint(rCenterCm, this.totalB);
      }
      graph.setCurrentPoint(rCenterCm, this.totalB);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const w = renderer.width;
      const h = renderer.height;
      const magX = w / 2;
      const magY = h / 2;
      const L = (params.magnetDist || 10) * 10;
      const magH = 36;

      // 1. Đường sức từ mô phỏng mờ
      ctx.strokeStyle = "rgba(18, 59, 112, 0.12)";
      ctx.lineWidth = 1.2;
      for (let r = 40; r <= 160; r += 30) {
        ctx.beginPath();
        ctx.ellipse(magX, magY, L / 2 + r, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2. Thanh nam châm thẳng
      // Cực Nam (S) - Xanh lam
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(magX - L / 2, magY - magH / 2, L / 2, magH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px Montserrat";
      ctx.fillText("S", magX - L / 4 - 6, magY + 5);

      // Cực Bắc (N) - Đỏ
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(magX, magY - magH / 2, L / 2, magH);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("N", magX + L / 4 - 6, magY + 5);

      // Viền nam châm
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.strokeRect(magX - L / 2, magY - magH / 2, L, magH);

      // 3. Kim la bàn tại (needleX, needleY)
      const cx = this.needleX;
      const cy = this.needleY;
      const ang = this.angle;
      const cR = 24;

      ctx.beginPath();
      ctx.arc(cx, cy, cR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);

      // Cực Bắc kim (Đỏ)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(cR - 3, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fillStyle = "#dc2626";
      ctx.fill();

      // Cực Nam kim (Xanh)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(4, -4);
      ctx.lineTo(-(cR - 3), 0);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fillStyle = "#2563eb";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#475569";
      ctx.font = "10px Montserrat";
      ctx.fillText("Kéo kim la bàn để đo từ trường", cx - 75, cy + cR + 16);
    },
    getResults(params) {
      return [
        { label: "Cảm ứng từ đo được (B)", value: `${this.totalB.toFixed(2)} mT` },
        { label: "Góc lệch kim (θ)", value: `${((this.angle * 180) / Math.PI).toFixed(1)}°` },
        { label: "Tọa độ kim thử (X, Y)", value: `${Math.round(this.needleX)}, ${Math.round(this.needleY)}` },
        { label: "Đặc điểm cực từ", value: "Cực Bắc kim chỉ chiều vector B" }
      ];
    },
    onPointerDown(e, rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (Math.hypot(mx - this.needleX, my - this.needleY) < 35) {
        this.isDragging = true;
      }
    },
    onPointerMove(e, rect) {
      if (!this.isDragging) return;
      this.needleX = e.clientX - rect.left;
      this.needleY = e.clientY - rect.top;
    },
    onPointerUp() {
      this.isDragging = false;
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 13: Từ phổ và đường sức từ của nam châm
  // ----------------------------------------------------
  "exp-13": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Mật độ đường sức từ theo khoảng cách",
        xLabel: "Khoảng cách r",
        yLabel: "Mật độ B",
        xRange: [1, 10],
        yRange: [0, 100],
        theoreticalFn: (r) => 100 / (r * r)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      graph.setCurrentPoint(3, 100 / 9);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const shape = params.magnetShape || 1; // 1: Thẳng, 2: Chữ U

      if (shape === 1) {
        // Nam châm thẳng
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(cx - 80, cy - 15, 80, 30);
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(cx, cy - 15, 80, 30);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px Montserrat";
        ctx.fillText("S", cx - 45, cy + 5);
        ctx.fillText("N", cx + 35, cy + 5);

        // Các đường cong khép kín mạt sắt
        ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
        ctx.lineWidth = 1.2;
        for (let a = 20; a <= 120; a += 20) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, 80 + a, a, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Nam châm chữ U
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 26;
        ctx.beginPath();
        ctx.arc(cx, cy - 30, 60, 0, Math.PI, true);
        ctx.lineTo(cx - 60, cy + 40);
        ctx.moveTo(cx + 60, cy - 30);
        ctx.lineTo(cx + 60, cy + 40);
        ctx.stroke();

        ctx.fillStyle = "#2563eb";
        ctx.fillRect(cx - 73, cy + 10, 26, 30);
        ctx.fillStyle = "#ffffff";
        ctx.fillText("S", cx - 65, cy + 30);
        ctx.fillText("N", cx + 55, cy + 30);

        // Từ trường đều giữa 2 cực chữ U
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 2;
        for (let y = cy - 20; y <= cy + 40; y += 15) {
          renderer.drawArrow(cx + 45, y, cx - 45, y, "#0284c7", 1.5, 6);
        }
      }
    },
    getResults(params) {
      return [
        { label: "Dạng nam châm", value: params.magnetShape === 2 ? "Nam châm chữ U" : "Thanh nam châm thẳng" },
        { label: "Vùng từ trường đều", value: params.magnetShape === 2 ? "Có (giữa hai cực chữ U)" : "Không" },
        { label: "Quy ước chiều", value: "Ra cực Bắc (N), Vào cực Nam (S)" },
        { label: "Tính chất đường sức", value: "Đường cong khép kín không cắt nhau" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 14: Từ trường dòng điện thẳng
  // ----------------------------------------------------
  "exp-14": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Cảm ứng từ B theo khoảng cách r (1/r)",
        xLabel: "r (cm)",
        yLabel: "B (μT)",
        xRange: [1, 20],
        yRange: [0, 100],
        theoreticalFn: (r) => FormulaEngine.calcStraightWireB(5, r * 1e-2) * 1e6
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const I = params.wireCurrent || 5;
      graph.setCurrentPoint(5, FormulaEngine.calcStraightWireB(I, 5 * 1e-2) * 1e6);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const I = params.wireCurrent || 5;

      // Đường tròn đồng tâm
      for (let r = 30; r <= 120; r += 25) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(2, 132, 199, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Mũi tên chiều đường sức từ (Quy tắc bàn tay phải)
        renderer.drawArrow(cx, cy - r, cx - 12, cy - r, "#0284c7", 2, 6);
      }

      // Mặt cắt dây dẫn thẳng (Dòng điện đi ra khỏi mặt phẳng màn hình: Dấu chấm)
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 12px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`DÒNG ĐIỆN THẲNG I = ${I}A (HƯỚNG RA NGOÀI •)`, cx, cy + 145);
      ctx.fillText("Đường sức từ là các đường tròn đồng tâm (Quy tắc nắm tay phải)", cx, cy + 165);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const I = params.wireCurrent || 5;
      const B_at_5cm = FormulaEngine.calcStraightWireB(I, 0.05);
      return [
        { label: "Cường độ dòng điện (I)", value: `${I} A` },
        { label: "Cảm ứng từ tại r = 5cm", value: `${(B_at_5cm * 1e6).toFixed(1)} μT` },
        { label: "Quy luật suy giảm", value: "Tỉ lệ nghịch với khoảng cách r (1/r)" },
        { label: "Chiều đường sức", value: "Ngược chiều kim đồng hồ" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 15: Từ trường ống dây (Solenoid)
  // ----------------------------------------------------
  "exp-15": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Cảm ứng từ B trong lòng ống dây theo dòng điện I",
        xLabel: "I (A)",
        yLabel: "B (mT)",
        xRange: [0, 8],
        yRange: [0, 10],
        theoreticalFn: (I) => FormulaEngine.calcSolenoidB(I, 1000) * 1000
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const I = params.solCurrent || 3;
      const n = params.solTurns || 1000;
      const B = FormulaEngine.calcSolenoidB(I, n) * 1000;
      graph.setCurrentPoint(I, B);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const I = params.solCurrent || 3;
      const n = params.solTurns || 1000;
      const B_mT = FormulaEngine.calcSolenoidB(I, n) * 1000;

      // Ống dây hình trụ
      const solW = 240;
      const solH = 90;
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - solW / 2, cy - solH / 2, solW, solH);

      // Các vòng dây quấn
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 3;
      for (let x = cx - solW / 2 + 15; x <= cx + solW / 2 - 15; x += 15) {
        ctx.beginPath();
        ctx.ellipse(x, cy, 6, solH / 2 - 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Từ trường đều bên trong lòng ống (các mũi tên song song)
      ctx.strokeStyle = "#0284c7";
      for (let y = cy - 20; y <= cy + 20; y += 20) {
        renderer.drawArrow(cx - solW / 2 + 20, y, cx + solW / 2 - 20, y, "#0284c7", 2, 8);
      }

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`TỪ TRƯỜNG ĐỀU TRONG ỐNG DÂY: B = ${B_mT.toFixed(2)} mT`, cx, cy + 85);
      ctx.fillText(`Cực Nam (S) ← ỐNG DÂY → Cực Bắc (N)`, cx, cy + 105);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const I = params.solCurrent || 3;
      const n = params.solTurns || 1000;
      const B_mT = FormulaEngine.calcSolenoidB(I, n) * 1000;
      return [
        { label: "Cảm ứng từ trong lòng ống (B)", value: `${B_mT.toFixed(2)} mT` },
        { label: "Cường độ dòng điện (I)", value: `${I} A` },
        { label: "Mật độ vòng dây (n)", value: `${n} vòng/m` },
        { label: "Đặc tính từ trường", value: "Từ trường đều" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 16: Lực từ Am-pe
  // ----------------------------------------------------
  "exp-16": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Lực từ F theo góc nghiêng α (F = IBL·sinα)",
        xLabel: "α (độ)",
        yLabel: "F (N)",
        xRange: [0, 90],
        yRange: [0, 0.5],
        theoreticalFn: (alpha) => FormulaEngine.calcAmpereForce(4, 0.5, 0.2, alpha)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const I = params.ampereI || 4;
      const B = params.ampereB || 0.5;
      const alpha = params.ampereAngle || 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);
      graph.setCurrentPoint(alpha, F);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const I = params.ampereI || 4;
      const B = params.ampereB || 0.5;
      const alpha = params.ampereAngle || 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);

      // Cực nam châm tạo từ trường đều
      ctx.fillStyle = "rgba(37, 99, 235, 0.2)";
      ctx.fillRect(cx - 100, cy - 80, 200, 160);

      // Vector B hướng vào trong (Dấu nhân)
      ctx.fillStyle = "#2563eb";
      ctx.font = "12px JetBrains Mono";
      for (let x = cx - 80; x <= cx + 80; x += 40) {
        for (let y = cy - 60; y <= cy + 60; y += 40) {
          ctx.fillText("⊗ B", x, y);
        }
      }

      // Đoạn dây dẫn mang dòng điện I
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy);
      ctx.lineTo(cx + 70, cy);
      ctx.stroke();

      // Mũi tên dòng điện I
      renderer.drawArrow(cx - 30, cy, cx + 30, cy, "#d97706", 3, 8);
      ctx.fillText(`I = ${I}A`, cx - 15, cy - 10);

      // Vector lực từ F hướng lên trên (theo quy tắc bàn tay trái)
      const forceLen = Math.min(70, F * 180);
      renderer.drawArrow(cx, cy, cx, cy - forceLen, "#dc2626", 4, 10);
      ctx.fillStyle = "#dc2626";
      ctx.font = "bold 12px Montserrat";
      ctx.fillText(`Lực từ F = ${F.toFixed(3)} N`, cx + 10, cy - forceLen / 2);
    },
    getResults(params) {
      const I = params.ampereI || 4;
      const B = params.ampereB || 0.5;
      const alpha = params.ampereAngle || 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);
      return [
        { label: "Độ lớn lực Am-pe (F)", value: `${F.toFixed(3)} N` },
        { label: "Góc nghiêng (α)", value: `${alpha}°` },
        { label: "Cảm ứng từ (B)", value: `${B} T` },
        { label: "Quy tắc xác định chiều", value: "Quy tắc bàn tay trái" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 17: Hiện tượng cảm ứng điện từ
  // ----------------------------------------------------
  "exp-17": {
    magnetPos: 0,
    init(renderer, graph) {
      this.magnetPos = 0;
      graph.setConfig({
        title: "Dòng điện cảm ứng i(t) khi nam châm dao động",
        xLabel: "t (s)",
        yLabel: "i (mA)",
        xRange: [0, 20],
        yRange: [-10, 10]
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const v = params.magnetSpeed || 0.8;
      this.magnetPos = Math.sin(time * v * 3) * 60;
      const i_mA = Math.cos(time * v * 3) * 8 * v;

      if (Math.random() < 0.2) {
        graph.addPoint(time % 20, i_mA);
      }
      graph.setCurrentPoint(time % 20, i_mA);
    },
    render(renderer) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const magX = cx + this.magnetPos;

      // Cuộn dây đứng yên
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 30, cy - 50, 60, 100);

      // Thanh nam châm chuyển động qua lại
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(magX - 60, cy - 15, 40, 30);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(magX - 20, cy - 15, 40, 30);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Montserrat";
      ctx.fillText("S", magX - 45, cy + 5);
      ctx.fillText("N", magX + 5, cy + 5);

      // Kim điện kế G lệch theo dòng điện
      const i_mA = (magX - cx) * 0.15;
      renderer.drawDialMeter(cx, cy + 100, 30, i_mA, -10, 10, "G =", " mA");
    },
    getResults() {
      return [
        { label: "Dòng điện cảm ứng (i)", value: "Biến thiên đổi chiều theo chuyển động" },
        { label: "Nguyên nhân xuất hiện i", value: "Từ thông Φ qua cuộn dây biến thiên" },
        { label: "Khi nam châm đứng yên", value: "i = 0 mA" },
        { label: "Tần số biến thiên", value: "Tỉ lệ thuận với tốc độ di chuyển nam châm" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 18: Định luật Lenz
  // ----------------------------------------------------
  "exp-18": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Lực cản định luật Lenz chống lại nguyên nhân sinh ra nó",
        xLabel: "Vị trí",
        yLabel: "Lực cản",
        xRange: [0, 10],
        yRange: [-5, 5]
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const mode = params.motionState || 0; // 0: Lại gần, 1: Ra xa
      graph.setCurrentPoint(5, mode === 0 ? 3 : -3);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const mode = params.motionState || 0;

      // Vòng nhôm treo
      ctx.beginPath();
      ctx.arc(cx + 40, cy, 50, 0, Math.PI * 2);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Nam châm
      const magX = mode === 0 ? cx - 70 : cx - 110;
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(magX - 40, cy - 15, 40, 30);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(magX, cy - 15, 40, 30);

      // Mũi tên tương tác
      if (mode === 0) {
        renderer.drawArrow(magX + 50, cy, magX + 75, cy, "#16a34a", 3);
        renderer.drawArrow(cx + 40, cy, cx + 65, cy, "#dc2626", 3);
        ctx.fillStyle = "#dc2626";
        ctx.fillText("ĐẨY NHAU (Chống lại sự lại gần)", cx - 60, cy + 90);
      } else {
        renderer.drawArrow(magX, cy, magX - 25, cy, "#16a34a", 3);
        renderer.drawArrow(cx + 40, cy, cx + 15, cy, "#2563eb", 3);
        ctx.fillStyle = "#2563eb";
        ctx.fillText("HÚT NHAU (Chống lại sự ra xa)", cx - 60, cy + 90);
      }
    },
    getResults(params) {
      const mode = params.motionState || 0;
      return [
        { label: "Chế độ chuyển động", value: mode === 0 ? "Nam châm lại gần" : "Nam châm ra xa" },
        { label: "Biến thiên từ thông", value: mode === 0 ? "Từ thông TĂNG" : "Từ thông GIẢM" },
        { label: "Tương tác từ", value: mode === 0 ? "Lực ĐẨY (xuất hiện cực cùng tên)" : "Lực HÚT (xuất hiện cực trái tên)" },
        { label: "Bản chất định luật Lenz", value: "Bảo toàn năng lượng" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 19: Suất điện động cảm ứng
  // ----------------------------------------------------
  "exp-19": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Suất điện động xoay chiều e_c(t) = E₀ · sin(ωt)",
        xLabel: "t (s)",
        yLabel: "e (V)",
        xRange: [0, 4],
        yRange: [-30, 30],
        theoreticalFn: (t) => 25 * Math.sin(30 * t)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const omega = params.rotSpeed || 30;
      const E0 = (omega / 30) * 25;
      const e_val = E0 * Math.sin(omega * time);
      if (Math.random() < 0.25) {
        graph.addPoint(time % 4, e_val);
      }
      graph.setCurrentPoint(time % 4, e_val);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const omega = params.rotSpeed || 30;

      // Khung dây quay trong từ trường
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 70, cy - 50, 140, 100);

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`TỐC ĐỘ GÓC: ω = ${omega} rad/s`, cx, cy + 90);
      ctx.fillText("Suất điện động đạt cực đại khi mặt phẳng khung dây song song với B", cx, cy + 110);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const omega = params.rotSpeed || 30;
      const E0 = (omega / 30) * 25;
      return [
        { label: "Tốc độ góc (ω)", value: `${omega} rad/s` },
        { label: "Biên độ suất điện động (E₀)", value: `${E0.toFixed(1)} V` },
        { label: "Tần số dao động (f)", value: `${(omega / (2 * Math.PI)).toFixed(1)} Hz` },
        { label: "Độ lệch pha với từ thông", value: "Vuông pha (π/2 rad)" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 20: Máy biến áp
  // ----------------------------------------------------
  "exp-20": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Dạng sóng điện áp xoay chiều u₁(t) và u₂(t)",
        xLabel: "t (ms)",
        yLabel: "u (V)",
        xRange: [0, 40],
        yRange: [-350, 350],
        theoreticalFn: (t) => 220 * Math.sin((2 * Math.PI * 50 * t) / 1000)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const u1 = params.inputU1 || 220;
      const n1 = params.primaryN1 || 1000;
      const n2 = params.secondaryN2 || 500;
      const u2 = FormulaEngine.calcTransformerU2(u1, n1, n2);
      const tMs = (time * 1000) % 40;
      const val = u1 * Math.sin((2 * Math.PI * 50 * tMs) / 1000);
      graph.setCurrentPoint(tMs, val);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const u1 = params.inputU1 || 220;
      const n1 = params.primaryN1 || 1000;
      const n2 = params.secondaryN2 || 500;
      const u2 = FormulaEngine.calcTransformerU2(u1, n1, n2);

      // Lõi thép hình chữ nhật khép kín
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(cx - 100, cy - 60, 200, 120);
      ctx.clearRect(cx - 50, cy - 30, 100, 60);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 100, cy - 60, 200, 120);
      ctx.strokeRect(cx - 50, cy - 30, 100, 60);

      // Cuộn sơ cấp N1 (trái)
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      for (let y = cy - 40; y <= cy + 40; y += 12) {
        ctx.strokeRect(cx - 105, y, 10, 8);
      }

      // Cuộn thứ cấp N2 (phải)
      ctx.strokeStyle = "#0284c7";
      for (let y = cy - 30; y <= cy + 30; y += 16) {
        ctx.strokeRect(cx + 95, y, 10, 10);
      }

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 12px Montserrat";
      ctx.fillText(`U₁ = ${u1}V (N₁ = ${n1})`, cx - 110, cy + 90);
      ctx.fillText(`U₂ = ${u2.toFixed(1)}V (N₂ = ${n2})`, cx + 20, cy + 90);
    },
    getResults(params) {
      const u1 = params.inputU1 || 220;
      const n1 = params.primaryN1 || 1000;
      const n2 = params.secondaryN2 || 500;
      const u2 = FormulaEngine.calcTransformerU2(u1, n1, n2);
      return [
        { label: "Điện áp vào (U₁)", value: `${u1} V` },
        { label: "Điện áp ra (U₂)", value: `${u2.toFixed(1)} V` },
        { label: "Tỉ số biến áp (k)", value: `${(n1 / n2).toFixed(2)}` },
        { label: "Chế độ máy", value: n2 > n1 ? "Máy TĂNG ÁP" : "Máy HẠ ÁP" }
      ];
    },
    cleanup() {}
  }
};

