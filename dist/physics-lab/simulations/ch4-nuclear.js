/**
 * physics-lab/simulations/ch4-nuclear.js
 * 5 Mô phỏng thí nghiệm Chương IV: Vật lí hạt nhân
 */

import { FormulaEngine } from "../core/formula-engine.js";

export const nuclearSimulations = {
  // ----------------------------------------------------
  // Thí nghiệm 21: Cấu tạo hạt nhân nguyên tử
  // ----------------------------------------------------
  "exp-21": {
    nucleons: [],
    init(renderer, graph) {
      this.generateNucleons(6, 6);
      graph.setConfig({
        title: "Dải đồng vị bền trên biểu đồ Segrè (N theo Z)",
        xLabel: "Z (Proton)",
        yLabel: "N (Neutron)",
        xRange: [0, 30],
        yRange: [0, 40],
        theoreticalFn: (Z) => Z * (1 + 0.006 * Math.pow(Z, 2 / 3))
      });
      graph.clearPoints();
    },
    generateNucleons(z, n) {
      this.nucleons = [];
      const total = z + n;
      for (let i = 0; i < total; i++) {
        const isProton = i < z;
        const radius = Math.sqrt(Math.random()) * 40;
        const angle = Math.random() * Math.PI * 2;
        this.nucleons.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          isProton
        });
      }
    },
    update(dt, time, params, graph) {
      const z = params.numProtons || 6;
      const n = params.numNeutrons || 6;
      if (this.nucleons.length !== z + n) {
        this.generateNucleons(z, n);
      }
      graph.setCurrentPoint(z, n);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const z = params.numProtons || 6;
      const n = params.numNeutrons || 6;

      ctx.save();
      ctx.translate(cx, cy);

      // Quầng tương tác lực hạt nhân mạnh
      ctx.beginPath();
      ctx.arc(0, 0, 65, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vẽ từng nucleon
      this.nucleons.forEach((nuc) => {
        ctx.beginPath();
        ctx.arc(nuc.x, nuc.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = nuc.isProton ? "#dc2626" : "#64748b";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px Montserrat";
        ctx.textAlign = "center";
        ctx.fillText(nuc.isProton ? "+" : "0", nuc.x, nuc.y + 3);
      });

      ctx.restore();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`HẠT NHÂN: Số khối A = ${z + n} (${z} Proton, ${n} Neutron)`, cx, cy + 95);
      ctx.fillText(`Điện tích hạt nhân: Q = +${z}e`, cx, cy + 115);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const z = params.numProtons || 6;
      const n = params.numNeutrons || 6;
      return [
        { label: "Số Proton (Z)", value: `${z}` },
        { label: "Số Neutron (N)", value: `${n}` },
        { label: "Số khối (A = Z + N)", value: `${z + n}` },
        { label: "Điện tích hạt nhân", value: `+${z}e (${(z * 1.6e-19).toExponential(2)} C)` }
      ];
    },
    cleanup() {
      this.nucleons = [];
    }
  },

  // ----------------------------------------------------
  // Thí nghiệm 22: Độ hụt khối và năng lượng liên kết
  // ----------------------------------------------------
  "exp-22": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Đường cong năng lượng liên kết riêng ε theo số khối A",
        xLabel: "A (Nucleon)",
        yLabel: "ε (MeV/nucl)",
        xRange: [1, 100],
        yRange: [0, 10],
        theoreticalFn: (A) => (A < 4 ? 2 : Math.min(8.8, 7.5 + Math.sin(A / 30) * 1.3))
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const z = params.targetZ || 8;
      const a = params.targetA || 16;
      const res = FormulaEngine.calcMassDefect(z, a, a * 0.992);
      graph.setCurrentPoint(a, res.specificEnergy);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const z = params.targetZ || 8;
      const a = params.targetA || 16;
      const res = FormulaEngine.calcMassDefect(z, a, a * 0.992);

      // Cân so sánh khối lượng
      ctx.fillStyle = "#334155";
      ctx.fillRect(cx - 100, cy + 60, 200, 12);
      ctx.fillRect(cx - 6, cy - 20, 12, 80);

      // Đĩa trái: Nucleon tự do
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(cx - 70, cy - 10, 24, 0, Math.PI * 2);
      ctx.fill();

      // Đĩa phải: Hạt nhân liên kết (nhẹ hơn)
      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.arc(cx + 70, cy - 25, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`ĐỘ HỤT KHỐI: Δm = ${res.deltaM_u.toFixed(4)} u`, cx, cy + 95);
      ctx.fillText(`NĂNG LƯỢNG LIÊN KẾT: E_lk = ${res.bindingEnergyMeV.toFixed(1)} MeV`, cx, cy + 115);
      ctx.fillText(`Năng lượng liên kết riêng ε = ${res.specificEnergy.toFixed(2)} MeV/nucleon`, cx, cy + 135);
      ctx.textAlign = "left";
    },
    getResults(params) {
      const z = params.targetZ || 8;
      const a = params.targetA || 16;
      const res = FormulaEngine.calcMassDefect(z, a, a * 0.992);
      return [
        { label: "Độ hụt khối (Δm)", value: `${res.deltaM_u.toFixed(4)} u` },
        { label: "Năng lượng liên kết (E_lk)", value: `${res.bindingEnergyMeV.toFixed(1)} MeV` },
        { label: "Năng lượng liên kết riêng (ε)", value: `${res.specificEnergy.toFixed(2)} MeV/nucleon` },
        { label: "Độ bền vững", value: res.specificEnergy > 8.0 ? "Hạt nhân RẤT BỀN VỮNG" : "Bền vững trung bình" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 23: Phản ứng phân hạch và nhiệt hạch
  // ----------------------------------------------------
  "exp-23": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Năng lượng tỏa ra từ phản ứng hạt nhân",
        xLabel: "Giai đoạn",
        yLabel: "E (MeV)",
        xRange: [0, 4],
        yRange: [0, 220]
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const mode = params.reactionType || 1;
      graph.setCurrentPoint(2, mode === 1 ? 200 : 17.6);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const mode = params.reactionType || 1; // 1: Phân hạch, 2: Nhiệt hạch

      if (mode === 1) {
        // Phân hạch U-235
        ctx.fillStyle = "#d97706";
        ctx.beginPath();
        ctx.arc(cx - 50, cy, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px Montserrat";
        ctx.textAlign = "center";
        ctx.fillText("²³⁵U", cx - 50, cy + 4);

        // Neutron bắn phá
        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.arc(cx - 130, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        renderer.drawArrow(cx - 120, cy, cx - 85, cy, "#0284c7", 2, 6);

        // Hai mảnh phân hạch văng ra
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(cx + 60, cy - 35, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText("Mảnh X", cx + 60, cy - 32);

        ctx.beginPath();
        ctx.arc(cx + 60, cy + 35, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText("Mảnh Y", cx + 60, cy + 38);

        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 13px Montserrat";
        ctx.fillText("PHẢN ỨNG PHÂN HẠCH TỎA NĂNG LƯỢNG ~200 MeV / 1 PHÂN HẠCH", cx, cy + 105);
      } else {
        // Nhiệt hạch D - T
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(cx - 60, cy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px Montserrat";
        ctx.textAlign = "center";
        ctx.fillText("²H (D)", cx - 60, cy + 4);

        ctx.fillStyle = "#d97706";
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText("³H (T)", cx, cy + 4);

        renderer.drawArrow(cx + 25, cy, cx + 70, cy, "#16a34a", 3, 8);

        // Sản phẩm Heli và neutron
        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.arc(cx + 100, cy - 20, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText("⁴He", cx + 100, cy - 16);

        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.arc(cx + 110, cy + 30, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText("n", cx + 110, cy + 33);

        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 13px Montserrat";
        ctx.fillText("PHẢN ỨNG NHIỆT HẠCH TỎA NĂNG LƯỢNG 17.6 MeV", cx, cy + 105);
      }
      ctx.textAlign = "left";
    },
    getResults(params) {
      const mode = params.reactionType || 1;
      return [
        { label: "Loại phản ứng", value: mode === 1 ? "Phân hạch hạt nhân (U-235)" : "Nhiệt hạch (D + T)" },
        { label: "Năng lượng tỏa ra", value: mode === 1 ? "~ 200 MeV" : "17.6 MeV" },
        { label: "Năng lượng tính trên 1 nucleon", value: mode === 1 ? "~ 0.85 MeV/u" : "~ 3.52 MeV/u (Gấp 4 lần phân hạch)" },
        { label: "Điều kiện xảy ra", value: mode === 1 ? "Neutron nhiệt chậm" : "Nhiệt độ cực cao ~ 100 triệu K" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 24: Hiện tượng phóng xạ và các dạng tia
  // ----------------------------------------------------
  "exp-24": {
    init(renderer, graph) {
      graph.setConfig({
        title: "Khả năng đâm xuyên qua các lớp vật liệu chắn",
        xLabel: "Vật liệu chắn",
        yLabel: "Cường độ tia còn lại",
        xRange: [0, 4],
        yRange: [0, 100]
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      const shield = params.absorberMaterial || 0;
      graph.setCurrentPoint(shield, shield === 0 ? 100 : shield === 1 ? 70 : shield === 2 ? 30 : 5);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const shield = params.absorberMaterial || 0; // 0: None, 1: Giấy, 2: Nhôm, 3: Chì

      // Khối nguồn phóng xạ
      ctx.fillStyle = "#334155";
      ctx.fillRect(cx - 140, cy - 60, 36, 120);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(cx - 122, cy, 10, 0, Math.PI * 2);
      ctx.fill();

      // Bản chắn vật liệu
      if (shield > 0) {
        ctx.fillStyle = shield === 1 ? "#fef08a" : shield === 2 ? "#cbd5e1" : "#475569";
        ctx.fillRect(cx - 20, cy - 70, 16, 140);
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 20, cy - 70, 16, 140);

        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 11px Montserrat";
        ctx.fillText(shield === 1 ? "TẤM GIẤY" : shield === 2 ? "LÁ NHÔM" : "TẤM CHÌ", cx - 35, cy - 80);
      }

      // Quỹ đạo tia Alpha (Bị chặn bởi giấy)
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy - 30);
      if (shield >= 1) ctx.lineTo(cx - 20, cy - 30);
      else ctx.lineTo(cx + 120, cy - 45);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.fillText("Tia α (He²⁺)", cx + 125, cy - 42);

      // Quỹ đạo tia Beta (Bị chặn bởi nhôm)
      ctx.strokeStyle = "#0284c7";
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy);
      if (shield >= 2) ctx.lineTo(cx - 20, cy);
      else ctx.lineTo(cx + 120, cy + 30);
      ctx.stroke();
      ctx.fillStyle = "#0284c7";
      ctx.fillText("Tia β (e⁻/e⁺)", cx + 125, cy + 32);

      // Quỹ đạo tia Gamma (Đi xuyên qua, suy giảm qua chì)
      ctx.strokeStyle = "#10b981";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy + 30);
      ctx.lineTo(cx + 120, cy + 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#10b981";
      ctx.fillText("Tia γ (Photon)", cx + 125, cy + 20);
    },
    getResults(params) {
      const shield = params.absorberMaterial || 0;
      return [
        { label: "Vật liệu chắn", value: shield === 0 ? "Không có" : shield === 1 ? "Tờ giấy mỏng" : shield === 2 ? "Lá nhôm vài mm" : "Tấm chì dày" },
        { label: "Tia bị chặn", value: shield === 1 ? "Tia α bị chặn" : shield === 2 ? "Tia α và β bị chặn" : shield === 3 ? "Tia α, β và phần lớn γ bị chặn" : "Cả 3 tia đi qua" },
        { label: "Tia có tính đâm xuyên mạnh nhất", value: "Tia Gamma (γ)" },
        { label: "Điện tích các tia", value: "α (+2e), β⁻ (-e), β⁺ (+e), γ (0)" }
      ];
    },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 25: Phân rã phóng xạ và chu kì bán rã
  // ----------------------------------------------------
  "exp-25": {
    nuclei: [],
    decayTime: 0,
    init(renderer, graph) {
      this.decayTime = 0;
      this.nuclei = [];
      for (let i = 0; i < 256; i++) {
        this.nuclei.push({ decayed: false });
      }
      graph.setConfig({
        title: "Đường cong phân rã phóng xạ N(t) = N₀ · 2^(-t/T)",
        xLabel: "t (s)",
        yLabel: "N (hạt)",
        xRange: [0, 24],
        yRange: [0, 256],
        theoreticalFn: (t) => 256 * Math.pow(2, -t / 8)
      });
      graph.clearPoints();
    },
    update(dt, time, params, graph) {
      this.decayTime += dt;
      const T = params.halfLifeSec || 8;
      const lambda = Math.LN2 / T;
      const decayProb = 1 - Math.exp(-lambda * dt);

      let remaining = 0;
      this.nuclei.forEach((n) => {
        if (!n.decayed) {
          if (Math.random() < decayProb) {
            n.decayed = true;
          } else {
            remaining++;
          }
        }
      });

      if (Math.random() < 0.2) {
        graph.addPoint(this.decayTime, remaining);
      }
      graph.setCurrentPoint(this.decayTime, remaining);
    },
    render(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const gridSize = 16;
      const startX = cx - (gridSize * 15) / 2;
      const startY = cy - (gridSize * 15) / 2 - 10;

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`MA TRẬN HẠT NHÂN PHÓNG XẠ (${this.nuclei.length} HẠT)`, cx, startY - 14);

      this.nuclei.forEach((n, idx) => {
        const col = idx % gridSize;
        const row = Math.floor(idx / gridSize);
        const x = startX + col * 15;
        const y = startY + row * 15;

        ctx.beginPath();
        ctx.arc(x + 6, y + 6, 5, 0, Math.PI * 2);
        ctx.fillStyle = n.decayed ? "rgba(148, 163, 184, 0.3)" : "#ef4444";
        ctx.fill();
      });

      ctx.textAlign = "left";
    },
    getResults(params) {
      const T = params.halfLifeSec || 8;
      const remaining = this.nuclei.filter((n) => !n.decayed).length;
      const theoretical = 256 * Math.pow(2, -this.decayTime / T);
      return [
        { label: "Số hạt chưa phân rã (N)", value: `${remaining} / 256` },
        { label: "Số hạt theo lý thuyết", value: `${Math.round(theoretical)} hạt` },
        { label: "Thời gian đã trôi qua (t)", value: `${this.decayTime.toFixed(1)} s` },
        { label: "Chu kì bán rã (T)", value: `${T} s` }
      ];
    },
    cleanup() {
      this.nuclei = [];
    }
  }
};

