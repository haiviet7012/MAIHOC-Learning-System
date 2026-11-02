/**
 * physics-lab/simulations/ch3-magnetism.js
 * 9 Mô phỏng thí nghiệm 3D Tương tác Không gian 360° Chương III: Từ trường
 * Bộ sách Kết nối tri thức với cuộc sống - Vật lí 12
 */

import { FormulaEngine } from "../core/formula-engine.js";

// ============================================================================
// HỆ THỐNG DỰNG HÌNH 3D NATIVE (3D PERSPECTIVE ENGINE)
// ============================================================================

function create3DCamera(defaultRotX = 0.35, defaultRotY = -0.55, defaultDist = 420) {
  return {
    rotX: defaultRotX,
    rotY: defaultRotY,
    distance: defaultDist,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    reset() {
      this.rotX = defaultRotX;
      this.rotY = defaultRotY;
      this.distance = defaultDist;
      this.isDragging = false;
    },
    project(x, y, z, cx, cy, fov = 600) {
      const cosY = Math.cos(this.rotY);
      const sinY = Math.sin(this.rotY);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      const cosX = Math.cos(this.rotX);
      const sinX = Math.sin(this.rotX);
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      const dist = this.distance + z2;
      const scale = fov / Math.max(15, dist);
      return {
        x: cx + x1 * scale,
        y: cy + y2 * scale,
        z: z2,
        scale,
        visible: dist > 15
      };
    },
    onPointerDown(e, rect) {
      this.isDragging = true;
      this.lastMouseX = e.clientX - rect.left;
      this.lastMouseY = e.clientY - rect.top;
    },
    onPointerMove(e, rect) {
      if (!this.isDragging) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dx = mx - this.lastMouseX;
      const dy = my - this.lastMouseY;
      this.lastMouseX = mx;
      this.lastMouseY = my;
      this.rotY += dx * 0.01;
      this.rotX += dy * 0.01;
      this.rotX = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.rotX));
    },
    onPointerUp() {
      this.isDragging = false;
    }
  };
}

function draw3DGrid(ctx, camera, cx, cy, size = 180, step = 30, yLevel = 60) {
  ctx.save();
  ctx.strokeStyle = "rgba(51, 65, 85, 0.2)";
  ctx.lineWidth = 1;
  for (let x = -size; x <= size; x += step) {
    const p1 = camera.project(x, yLevel, -size, cx, cy);
    const p2 = camera.project(x, yLevel, size, cx, cy);
    if (p1.visible && p2.visible) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
  for (let z = -size; z <= size; z += step) {
    const p1 = camera.project(-size, yLevel, z, cx, cy);
    const p2 = camera.project(size, yLevel, z, cx, cy);
    if (p1.visible && p2.visible) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function draw3DVector(ctx, camera, cx, cy, from, to, color, width = 3, label = "") {
  const p1 = camera.project(from.x, from.y, from.z, cx, cy);
  const p2 = camera.project(to.x, to.y, to.z, cx, cy);
  if (!p1.visible || !p2.visible) return;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  const headLen = Math.min(14, len * 0.35);
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  if (label) {
    ctx.font = "bold 12px Montserrat, sans-serif";
    ctx.fillText(label, p2.x + 8 * Math.cos(angle), p2.y + 8 * Math.sin(angle));
  }
  ctx.restore();
}

function draw3DIndicator(ctx, w, h, viewLabel = "Không gian 3D tương tác 360°") {
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1;
  const bw = 240, bh = 26;
  const bx = 16, by = 16;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
  }

  ctx.fillStyle = "#38bdf8";
  ctx.font = "11px Montserrat, sans-serif";
  ctx.fillText(`🎮 ${viewLabel} | Kéo chuột để xoay`, bx + 10, by + 17);
  ctx.restore();
}

// ============================================================================
// DANH SÁCH 9 MÔ PHỎNG THÍ NGHIỆM TỪ TRƯỜNG
// ============================================================================

export const magnetismSimulations = {
  // ----------------------------------------------------
  // Thí nghiệm 12: Khảo sát từ trường bằng kim nam châm 3D
  // ----------------------------------------------------
  "exp-12": {
    camera: create3DCamera(0.4, -0.6, 400),
    needlePosX: 90,
    needlePosZ: 40,
    angle: 0,
    totalB: 0,
    isDraggingNeedle: false,

    init(renderer, graph) {
      this.camera.reset();
      this.needlePosX = 90;
      this.needlePosZ = 40;
      this.isDraggingNeedle = false;
      graph.setConfig({
        title: "Cảm ứng từ B theo khoảng cách r đến tâm nam châm (1/r³)",
        xLabel: "r (cm)",
        yLabel: "B (mT)",
        xRange: [5, 30],
        yRange: [0, 60],
        theoreticalFn: (r) => (50 * Math.pow(10 / r, 3))
      });
      graph.clearPoints();
    },

    update(dt, time, params, graph) {
      const L = (params.magnetDist || 10) * 10;
      const b0 = params.magnetB0 || 50;

      if (params.needleDist !== undefined) {
        const targetR = params.needleDist * 10;
        const currentR = Math.hypot(this.needlePosX, this.needlePosZ) || 1;
        if (Math.abs(currentR - targetR) > 2) {
          const ratio = targetR / currentR;
          this.needlePosX *= ratio;
          this.needlePosZ *= ratio;
        }
      }

      const px = this.needlePosX;
      const pz = this.needlePosZ;

      const nX = L / 2, nZ = 0;
      const sX = -L / 2, sZ = 0;

      const rxN = px - nX, rzN = pz - nZ;
      const rN = Math.hypot(rxN, rzN) || 1;
      const bN = (b0 * 1000) / (rN * rN);
      const bxN = bN * (rxN / rN);
      const bzN = bN * (rzN / rN);

      const rxS = px - sX, rzS = pz - sZ;
      const rS = Math.hypot(rxS, rzS) || 1;
      const bS = (b0 * 1000) / (rS * rS);
      const bxS = -bS * (rxS / rS);
      const bzS = -bS * (rzS / rS);

      const totalBx = bxN + bxS;
      const totalBz = bzN + bzS;
      this.totalB = Math.hypot(totalBx, totalBz);
      this.angle = Math.atan2(totalBz, totalBx);

      const rCenterCm = Math.hypot(px, pz) / 10;
      if (Math.random() < 0.25) {
        graph.addPoint(rCenterCm, this.totalB);
      }
      graph.setCurrentPoint(rCenterCm, this.totalB);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const L = (params.magnetDist || 10) * 10;
      const W = 32, H = 22;

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 40);

      // Faint 3D magnetic field lines
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
      ctx.lineWidth = 1.2;
      for (let a = 40; a <= 150; a += 35) {
        ctx.beginPath();
        for (let th = 0; th <= Math.PI * 2; th += 0.15) {
          const fx = Math.cos(th) * (L / 2 + a);
          const fz = Math.sin(th) * (a * 0.8);
          const p = cam.project(fx, 0, fz, cx, cy);
          if (th === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // Draw 3D Bar Magnet
      this._draw3DBarMagnet(ctx, cam, cx, cy, L, W, H);

      // Draw 3D Compass
      const cpX = this.needlePosX;
      const cpZ = this.needlePosZ;
      const cpY = 0;
      const baseP = cam.project(cpX, 35, cpZ, cx, cy);
      const pivotP = cam.project(cpX, cpY, cpZ, cx, cy);

      // Brass base stand
      ctx.save();
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(baseP.x, baseP.y, 14 * baseP.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Vertical pivot rod
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(baseP.x, baseP.y);
      ctx.lineTo(pivotP.x, pivotP.y);
      ctx.stroke();

      // 3D Compass Housing Circle
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pivotP.x, pivotP.y, 22 * pivotP.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Compass Needle (diamond aligned with this.angle)
      const needleLen = 20;
      const tipNx = cpX + Math.cos(this.angle) * needleLen;
      const tipNz = cpZ + Math.sin(this.angle) * needleLen;
      const tipSx = cpX - Math.cos(this.angle) * needleLen;
      const tipSz = cpZ - Math.sin(this.angle) * needleLen;
      const sideWx = -Math.sin(this.angle) * 5;
      const sideWz = Math.cos(this.angle) * 5;

      const pN = cam.project(tipNx, cpY, tipNz, cx, cy);
      const pS = cam.project(tipSx, cpY, tipSz, cx, cy);
      const pSide1 = cam.project(cpX + sideWx, cpY, cpZ + sideWz, cx, cy);
      const pSide2 = cam.project(cpX - sideWx, cpY, cpZ - sideWz, cx, cy);

      // North half (Red)
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.moveTo(pivotP.x, pivotP.y);
      ctx.lineTo(pSide1.x, pSide1.y);
      ctx.lineTo(pN.x, pN.y);
      ctx.lineTo(pSide2.x, pSide2.y);
      ctx.closePath();
      ctx.fill();

      // South half (Blue)
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.moveTo(pivotP.x, pivotP.y);
      ctx.lineTo(pSide1.x, pSide1.y);
      ctx.lineTo(pS.x, pS.y);
      ctx.lineTo(pSide2.x, pSide2.y);
      ctx.closePath();
      ctx.fill();

      // Center pivot jewel
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(pivotP.x, pivotP.y, 3 * pivotP.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3D Vector B Arrow from compass
      const vecBx = cpX + Math.cos(this.angle) * 35;
      const vecBz = cpZ + Math.sin(this.angle) * 35;
      draw3DVector(ctx, cam, cx, cy, { x: cpX, y: cpY - 8, z: cpZ }, { x: vecBx, y: cpY - 8, z: vecBz }, "#facc15", 3, "B");

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 12: Kim nam châm 3D");
    },

    _draw3DBarMagnet(ctx, cam, cx, cy, L, W, H) {
      const halfL = L / 2;
      this._draw3DBox(ctx, cam, cx, cy, -halfL / 2, 0, 0, halfL, W, H, "#2563eb", "#3b82f6", "#1d4ed8", "S");
      this._draw3DBox(ctx, cam, cx, cy, halfL / 2, 0, 0, halfL, W, H, "#dc2626", "#ef4444", "#b91c1c", "N");
    },

    _draw3DBox(ctx, cam, cx, cy, cx3D, cy3D, cz3D, dx, dy, dz, colorFront, colorTop, colorSide, label = "") {
      const hx = dx / 2, hy = dy / 2, hz = dz / 2;
      const v = [
        { x: cx3D - hx, y: cy3D - hy, z: cz3D - hz },
        { x: cx3D + hx, y: cy3D - hy, z: cz3D - hz },
        { x: cx3D + hx, y: cy3D + hy, z: cz3D - hz },
        { x: cx3D - hx, y: cy3D + hy, z: cz3D - hz },
        { x: cx3D - hx, y: cy3D - hy, z: cz3D + hz },
        { x: cx3D + hx, y: cy3D - hy, z: cz3D + hz },
        { x: cx3D + hx, y: cy3D + hy, z: cz3D + hz },
        { x: cx3D - hx, y: cy3D + hy, z: cz3D + hz }
      ].map(pt => cam.project(pt.x, pt.y, pt.z, cx, cy));

      ctx.save();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";

      // Top face
      ctx.fillStyle = colorTop;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.lineTo(v[1].x, v[1].y);
      ctx.lineTo(v[5].x, v[5].y);
      ctx.lineTo(v[4].x, v[4].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Front face
      ctx.fillStyle = colorFront;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.lineTo(v[1].x, v[1].y);
      ctx.lineTo(v[2].x, v[2].y);
      ctx.lineTo(v[3].x, v[3].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Side face
      ctx.fillStyle = colorSide;
      ctx.beginPath();
      ctx.moveTo(v[1].x, v[1].y);
      ctx.lineTo(v[5].x, v[5].y);
      ctx.lineTo(v[6].x, v[6].y);
      ctx.lineTo(v[2].x, v[2].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (label) {
        const centerP = cam.project(cx3D, cy3D, cz3D - hz - 1, cx, cy);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Montserrat, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, centerP.x, centerP.y + 4);
      }
      ctx.restore();
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const w = renderer.width;
      const h = renderer.height;
      const magX = w / 2;
      const magY = h / 2;
      const L = (params.magnetDist || 10) * 10;
      const magH = 36;

      ctx.strokeStyle = "rgba(18, 59, 112, 0.12)";
      ctx.lineWidth = 1.2;
      for (let r = 40; r <= 160; r += 30) {
        ctx.beginPath();
        ctx.ellipse(magX, magY, L / 2 + r, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "#2563eb";
      ctx.fillRect(magX - L / 2, magY - magH / 2, L / 2, magH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px Montserrat";
      ctx.fillText("S", magX - L / 4 - 6, magY + 5);

      ctx.fillStyle = "#dc2626";
      ctx.fillRect(magX, magY - magH / 2, L / 2, magH);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("N", magX + L / 4 - 6, magY + 5);

      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.strokeRect(magX - L / 2, magY - magH / 2, L, magH);

      const cx = magX + this.needlePosX;
      const cy = magY + this.needlePosZ;
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
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-4, -4); ctx.lineTo(cR - 3, 0); ctx.lineTo(-4, 4);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(4, -4); ctx.lineTo(-(cR - 3), 0); ctx.lineTo(4, 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    getResults() {
      const rCenterCm = Math.hypot(this.needlePosX, this.needlePosZ) / 10;
      return [
        { label: "Cảm ứng từ đo được (B)", value: `${this.totalB.toFixed(2)} mT` },
        { label: "Khoảng cách đến tâm (r)", value: `${rCenterCm.toFixed(1)} cm` },
        { label: "Góc lệch kim (θ)", value: `${((this.angle * 180) / Math.PI).toFixed(1)}°` },
        { label: "Đặc điểm cực từ", value: "Cực Bắc kim chỉ chiều vector B" }
      ];
    },

    onPointerDown(e, rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const needleP = this.camera.project(this.needlePosX, 0, this.needlePosZ, cx, cy);
      if (Math.hypot(mx - needleP.x, my - needleP.y) < 35) {
        this.isDraggingNeedle = true;
      } else {
        this.camera.onPointerDown(e, rect);
      }
    },

    onPointerMove(e, rect) {
      if (this.isDraggingNeedle) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        this.needlePosX = (mx - cx) * 0.8;
        this.needlePosZ = (my - cy) * 0.8;
      } else {
        this.camera.onPointerMove(e, rect);
      }
    },

    onPointerUp() {
      this.isDraggingNeedle = false;
      this.camera.onPointerUp();
    },

    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 13: Từ phổ và đường sức từ 3D
  // ----------------------------------------------------
  "exp-13": {
    camera: create3DCamera(0.45, -0.5, 420),
    filings: null,

    init(renderer, graph) {
      this.camera.reset();
      this._generateFilings(500);
      graph.setConfig({
        title: "Mật độ đường sức từ theo khoảng cách r (1/r²)",
        xLabel: "Khoảng cách r (cm)",
        yLabel: "Mật độ B",
        xRange: [2, 20],
        yRange: [0, 100],
        theoreticalFn: (r) => 100 / (r * r * 0.1)
      });
      graph.clearPoints();
    },

    _generateFilings(count) {
      this.filings = [];
      for (let i = 0; i < count; i++) {
        const r = 25 + Math.random() * 140;
        const th = Math.random() * Math.PI * 2;
        this.filings.push({
          x: Math.cos(th) * r,
          z: Math.sin(th) * r,
          y: (Math.random() - 0.5) * 20
        });
      }
    },

    update(dt, time, params, graph) {
      const count = params.filingDensity || 500;
      if (!this.filings || this.filings.length !== count) {
        this._generateFilings(count);
      }
      graph.setCurrentPoint(5, 100 / 2.5);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const shape = params.magnetShape || 1;
      const showLines = (params.showFieldLines === undefined || params.showFieldLines === 1);

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 40);

      if (shape === 1) {
        this._draw3DBarMagnet(ctx, cam, cx, cy, 120, 30, 22);

        if (showLines) {
          ctx.save();
          ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
          ctx.lineWidth = 1.3;
          for (let phi = 0; phi < Math.PI; phi += Math.PI / 3) {
            for (let a = 30; a <= 110; a += 26) {
              ctx.beginPath();
              for (let t = 0; t <= Math.PI * 2; t += 0.15) {
                const rx = Math.cos(t) * (60 + a);
                const ry = Math.sin(t) * a * Math.sin(phi);
                const rz = Math.sin(t) * a * Math.cos(phi);
                const p = cam.project(rx, ry, rz, cx, cy);
                if (t === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
              }
              ctx.closePath();
              ctx.stroke();
            }
          }
          ctx.restore();
        }

        if (this.filings) {
          ctx.save();
          for (const f of this.filings) {
            const rxN = f.x - 60, rzN = f.z;
            const rxS = f.x + 60, rzS = f.z;
            const rN = Math.hypot(rxN, rzN) || 1;
            const rS = Math.hypot(rxS, rzS) || 1;
            const bx = rxN / (rN * rN * rN) - rxS / (rS * rS * rS);
            const bz = rzN / (rN * rN * rN) - rzS / (rS * rS * rS);
            const ang = Math.atan2(bz, bx);

            const p1 = cam.project(f.x - Math.cos(ang) * 4, f.y, f.z - Math.sin(ang) * 4, cx, cy);
            const p2 = cam.project(f.x + Math.cos(ang) * 4, f.y, f.z + Math.sin(ang) * 4, cx, cy);
            if (p1.visible && p2.visible) {
              ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      } else {
        this._draw3DHorseshoe(ctx, cam, cx, cy);
        ctx.save();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        for (let y = -20; y <= 20; y += 10) {
          draw3DVector(ctx, cam, cx, cy, { x: 35, y: y, z: 0 }, { x: -35, y: y, z: 0 }, "#38bdf8", 2);
        }
        ctx.restore();
      }

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 13: Từ phổ & Đường sức từ 3D");
    },

    _draw3DBarMagnet(ctx, cam, cx, cy, L, W, H) {
      const halfL = L / 2;
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, -halfL / 2, 0, 0, halfL, W, H, "#2563eb", "#3b82f6", "#1d4ed8", "S");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, halfL / 2, 0, 0, halfL, W, H, "#dc2626", "#ef4444", "#b91c1c", "N");
    },

    _draw3DHorseshoe(ctx, cam, cx, cy) {
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, -40, 20, 0, 24, 70, 24, "#2563eb", "#3b82f6", "#1d4ed8", "S");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 40, 20, 0, 24, 70, 24, "#dc2626", "#ef4444", "#b91c1c", "N");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, -25, 0, 104, 24, 24, "#991b1b", "#b91c1c", "#7f1d1d");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const shape = params.magnetShape || 1;

      if (shape === 1) {
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(cx - 80, cy - 15, 80, 30);
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(cx, cy - 15, 80, 30);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px Montserrat";
        ctx.fillText("S", cx - 45, cy + 5);
        ctx.fillText("N", cx + 35, cy + 5);

        ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
        ctx.lineWidth = 1.2;
        for (let a = 20; a <= 120; a += 20) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, 80 + a, a, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
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
      }
    },

    getResults(params) {
      return [
        { label: "Dạng nam châm", value: params.magnetShape === 2 ? "Nam châm chữ U 3D" : "Thanh nam châm thẳng 3D" },
        { label: "Vùng từ trường đều", value: params.magnetShape === 2 ? "Có (giữa hai cực chữ U)" : "Không (lưỡng cực)" },
        { label: "Quy ước chiều", value: "Ra cực Bắc (N), Vào cực Nam (S)" },
        { label: "Tính chất đường sức", value: "Đường cong khép kín không cắt nhau" }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 14: Từ trường dòng điện thẳng 3D
  // ----------------------------------------------------
  "exp-14": {
    camera: create3DCamera(0.35, -0.6, 430),
    pulseY: 0,

    init(renderer, graph) {
      this.camera.reset();
      this.pulseY = 0;
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
      const dir = params.currentDir || 1;
      this.pulseY = (this.pulseY + dir * dt * 80) % 180;
      const r = params.ringRadius || 5;
      graph.setCurrentPoint(r, FormulaEngine.calcStraightWireB(I, r * 1e-2) * 1e6);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const I = params.wireCurrent || 5;
      const dir = params.currentDir || 1;

      // Transparent Acrylic Table (y = 0)
      ctx.save();
      const pT1 = cam.project(-130, 0, -130, cx, cy);
      const pT2 = cam.project(130, 0, -130, cx, cy);
      const pT3 = cam.project(130, 0, 130, cx, cy);
      const pT4 = cam.project(-130, 0, 130, cx, cy);

      ctx.fillStyle = "rgba(30, 41, 59, 0.45)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pT1.x, pT1.y);
      ctx.lineTo(pT2.x, pT2.y);
      ctx.lineTo(pT3.x, pT3.y);
      ctx.lineTo(pT4.x, pT4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Concentric Circular Magnetic Rings on table
      const rings = [35, 65, 95, 125];
      ctx.save();
      for (const r of rings) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let th = 0; th <= Math.PI * 2; th += 0.1) {
          const px = Math.cos(th) * r;
          const pz = Math.sin(th) * r;
          const p = cam.project(px, 0, pz, cx, cy);
          if (th === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();

        for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
          const ax = Math.cos(a) * r;
          const az = Math.sin(a) * r;
          const tangX = -Math.sin(a) * 16 * dir;
          const tangZ = Math.cos(a) * 16 * dir;
          draw3DVector(ctx, cam, cx, cy, { x: ax, y: 0, z: az }, { x: ax + tangX, y: 0, z: az + tangZ }, "#38bdf8", 2);
        }
      }
      ctx.restore();

      // Vertical 3D Copper Rod
      const pTop = cam.project(0, -110, 0, cx, cy);
      const pBot = cam.project(0, 110, 0, cx, cy);
      ctx.save();
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(pTop.x, pTop.y);
      ctx.lineTo(pBot.x, pBot.y);
      ctx.stroke();

      const curFrom = dir === 1 ? { x: 0, y: 80, z: 0 } : { x: 0, y: -80, z: 0 };
      const curTo = dir === 1 ? { x: 0, y: -80, z: 0 } : { x: 0, y: 80, z: 0 };
      draw3DVector(ctx, cam, cx, cy, curFrom, curTo, "#ef4444", 4, `I = ${I}A`);
      ctx.restore();

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 14: Dòng điện thẳng 3D (Quy tắc nắm tay phải)");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const I = params.wireCurrent || 5;

      for (let r = 30; r <= 120; r += 25) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(2, 132, 199, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        renderer.drawArrow(cx, cy - r, cx - 12, cy - r, "#0284c7", 2, 6);
      }

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
      ctx.fillText(`DÒNG ĐIỆN THẲNG I = ${I}A`, cx, cy + 145);
      ctx.textAlign = "left";
    },

    getResults(params) {
      const I = params.wireCurrent || 5;
      const r = (params.ringRadius || 5) * 1e-2;
      const B = FormulaEngine.calcStraightWireB(I, r);
      return [
        { label: "Cường độ dòng điện (I)", value: `${I} A` },
        { label: "Bán kính khảo sát (r)", value: `${(r * 100).toFixed(1)} cm` },
        { label: "Cảm ứng từ (B)", value: `${(B * 1e6).toFixed(1)} μT` },
        { label: "Quy tắc xác định chiều", value: "Quy tắc nắm tay phải" }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 15: Từ trường ống dây Solenoid 3D
  // ----------------------------------------------------
  "exp-15": {
    camera: create3DCamera(0.35, -0.55, 430),

    init(renderer, graph) {
      this.camera.reset();
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
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const I = params.solCurrent || 3;
      const n = params.solTurns || 1000;
      const L = (params.solLength || 20) * 10;
      const R = 38;
      const turns = 20;

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 50);

      // 3D Helical Copper Windings
      ctx.save();
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      const totalSteps = turns * 24;
      for (let s = 0; s <= totalSteps; s++) {
        const u = s / totalSteps;
        const x = -L / 2 + u * L;
        const th = u * turns * Math.PI * 2;
        const y = Math.cos(th) * R;
        const z = Math.sin(th) * R;
        const p = cam.project(x, y, z, cx, cy);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();

      // Uniform parallel magnetic field inside solenoid
      ctx.save();
      for (let offset = -18; offset <= 18; offset += 9) {
        draw3DVector(ctx, cam, cx, cy, { x: -L / 2 + 15, y: offset, z: 0 }, { x: L / 2 - 15, y: offset, z: 0 }, "#06b6d4", 2.2);
      }
      ctx.restore();

      // Polarity end markers
      const pNorth = cam.project(L / 2 + 15, 0, 0, cx, cy);
      const pSouth = cam.project(-L / 2 - 15, 0, 0, cx, cy);
      ctx.save();
      ctx.font = "bold 13px Montserrat, sans-serif";
      ctx.fillStyle = "#dc2626";
      ctx.fillText("CỰC BẮC (N)", pNorth.x + 8, pNorth.y + 4);
      ctx.fillStyle = "#2563eb";
      ctx.fillText("CỰC NAM (S)", pSouth.x - 90, pSouth.y + 4);
      ctx.restore();

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 15: Ống dây Solenoid 3D");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const I = params.solCurrent || 3;
      const n = params.solTurns || 1000;
      const B_mT = FormulaEngine.calcSolenoidB(I, n) * 1000;
      const solW = 240, solH = 90;

      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - solW / 2, cy - solH / 2, solW, solH);

      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 3;
      for (let x = cx - solW / 2 + 15; x <= cx + solW / 2 - 15; x += 15) {
        ctx.beginPath();
        ctx.ellipse(x, cy, 6, solH / 2 - 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = "#0284c7";
      for (let y = cy - 20; y <= cy + 20; y += 20) {
        renderer.drawArrow(cx - solW / 2 + 20, y, cx + solW / 2 - 20, y, "#0284c7", 2, 8);
      }

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Montserrat";
      ctx.textAlign = "center";
      ctx.fillText(`TỪ TRƯỜNG ĐỀU TRONG ỐNG DÂY: B = ${B_mT.toFixed(2)} mT`, cx, cy + 85);
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

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 16: Lực từ Am-pe 3D (Quy tắc bàn tay trái)
  // ----------------------------------------------------
  "exp-16": {
    camera: create3DCamera(0.35, -0.5, 420),
    swingAngle: 0,

    init(renderer, graph) {
      this.camera.reset();
      this.swingAngle = 0;
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
      const alpha = params.ampereAngle !== undefined ? params.ampereAngle : 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);
      const targetSwing = (F / 0.5) * 35;
      this.swingAngle += (targetSwing - this.swingAngle) * Math.min(1, dt * 5);
      graph.setCurrentPoint(alpha, F);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const I = params.ampereI || 4;
      const B = params.ampereB || 0.5;
      const alpha = params.ampereAngle !== undefined ? params.ampereAngle : 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 80);

      // Lower North Pole (Red)
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, 50, 0, 110, 26, 70, "#dc2626", "#ef4444", "#b91c1c", "CỰC BẮC (N)");
      // Upper South Pole (Blue)
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, -50, 0, 110, 26, 70, "#2563eb", "#3b82f6", "#1d4ed8", "CỰC NAM (S)");

      ctx.save();
      for (let x = -30; x <= 30; x += 30) {
        draw3DVector(ctx, cam, cx, cy, { x: x, y: 35, z: 0 }, { x: x, y: -35, z: 0 }, "#38bdf8", 2);
      }
      ctx.restore();

      const rad = (this.swingAngle * Math.PI) / 180;
      const wireY = Math.cos(rad) * 45;
      const wireZ = Math.sin(rad) * 45;

      ctx.save();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      const pTop1 = cam.project(-45, -75, 0, cx, cy);
      const pTop2 = cam.project(45, -75, 0, cx, cy);
      const pWire1 = cam.project(-45, wireY, wireZ, cx, cy);
      const pWire2 = cam.project(45, wireY, wireZ, cx, cy);

      ctx.beginPath();
      ctx.moveTo(pTop1.x, pTop1.y); ctx.lineTo(pWire1.x, pWire1.y);
      ctx.moveTo(pTop2.x, pTop2.y); ctx.lineTo(pWire2.x, pWire2.y);
      ctx.stroke();

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pWire1.x, pWire1.y);
      ctx.lineTo(pWire2.x, pWire2.y);
      ctx.stroke();
      ctx.restore();

      const mid = { x: 0, y: wireY, z: wireZ };
      draw3DVector(ctx, cam, cx, cy, mid, { x: 45, y: wireY, z: wireZ }, "#eab308", 3, `I = ${I}A`);
      draw3DVector(ctx, cam, cx, cy, mid, { x: 0, y: wireY - 45, z: wireZ }, "#38bdf8", 3, `B = ${B}T`);
      draw3DVector(ctx, cam, cx, cy, mid, { x: 0, y: wireY, z: wireZ + 50 }, "#dc2626", 4, `F = ${F.toFixed(3)}N`);

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 16: Lực từ Am-pe 3D (Quy tắc bàn tay trái)");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const I = params.ampereI || 4;
      const B = params.ampereB || 0.5;
      const alpha = params.ampereAngle !== undefined ? params.ampereAngle : 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);

      ctx.fillStyle = "rgba(37, 99, 235, 0.2)";
      ctx.fillRect(cx - 100, cy - 80, 200, 160);

      ctx.fillStyle = "#2563eb";
      ctx.font = "12px JetBrains Mono";
      for (let x = cx - 80; x <= cx + 80; x += 40) {
        for (let y = cy - 60; y <= cy + 60; y += 40) {
          ctx.fillText("⊗ B", x, y);
        }
      }

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy); ctx.lineTo(cx + 70, cy); ctx.stroke();

      const forceLen = Math.min(70, F * 180);
      renderer.drawArrow(cx, cy, cx, cy - forceLen, "#dc2626", 4, 10);
    },

    getResults(params) {
      const I = params.ampereI || 4;
      const B = params.ampereB || 0.5;
      const alpha = params.ampereAngle !== undefined ? params.ampereAngle : 90;
      const F = FormulaEngine.calcAmpereForce(I, B, 0.2, alpha);
      return [
        { label: "Độ lớn lực Am-pe (F)", value: `${F.toFixed(3)} N` },
        { label: "Góc nghiêng (α)", value: `${alpha}°` },
        { label: "Góc lệch con lắc (θ)", value: `${this.swingAngle.toFixed(1)}°` },
        { label: "Quy tắc xác định chiều", value: "Quy tắc bàn tay trái" }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 17: Hiện tượng cảm ứng điện từ Faraday 3D
  // ----------------------------------------------------
  "exp-17": {
    camera: create3DCamera(0.35, -0.55, 430),
    magnetZ: 90,
    indEMF: 0,

    init(renderer, graph) {
      this.camera.reset();
      this.magnetZ = 90;
      this.indEMF = 0;
      graph.setConfig({
        title: "Suất điện động cảm ứng e_c(t) theo chuyển động nam châm",
        xLabel: "t (s)",
        yLabel: "e_c (V)",
        xRange: [0, 10],
        yRange: [-6, 6]
      });
      graph.clearPoints();
    },

    update(dt, time, params, graph) {
      const v = params.magnetSpeed || 1.0;
      const pole = params.magnetPole !== undefined ? params.magnetPole : 1;
      const isAuto = (params.autoOscillate === undefined || params.autoOscillate === 1);

      if (isAuto) {
        this.magnetZ = Math.sin(time * v * 2.5) * 80;
        const vel = Math.cos(time * v * 2.5) * 80 * v * 2.5;
        this.indEMF = -(vel / 100) * 3.5 * pole;
      }

      if (Math.random() < 0.25) {
        graph.addPoint(time % 10, this.indEMF);
      }
      graph.setCurrentPoint(time % 10, this.indEMF);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const pole = params.magnetPole !== undefined ? params.magnetPole : 1;

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 60);

      // Hollow Induction Coil
      ctx.save();
      const turns = 16;
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 3;
      for (let i = 0; i < turns; i++) {
        const cz = -40 + (i / turns) * 80;
        ctx.beginPath();
        for (let th = 0; th <= Math.PI * 2; th += 0.2) {
          const px = Math.cos(th) * 32;
          const py = Math.sin(th) * 32;
          const p = cam.project(px, py, cz, cx, cy);
          if (th === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      const mz = this.magnetZ;
      const colFront = pole === 1 ? "#dc2626" : "#2563eb";
      const colBack = pole === 1 ? "#2563eb" : "#dc2626";
      const labelFront = pole === 1 ? "N" : "S";
      const labelBack = pole === 1 ? "S" : "N";

      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, 0, mz - 25, 24, 24, 45, colBack, "#475569", "#334155", labelBack);
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, 0, mz + 25, 24, 24, 45, colFront, "#ef4444", "#b91c1c", labelFront);

      // Galvanometer G
      const meterP = cam.project(90, 45, 0, cx, cy);
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(meterP.x, meterP.y, 28 * meterP.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const deflAngle = -Math.PI / 2 + (this.indEMF / 6) * (Math.PI / 3);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(meterP.x, meterP.y);
      ctx.lineTo(meterP.x + Math.cos(deflAngle) * 22 * meterP.scale, meterP.y + Math.sin(deflAngle) * 22 * meterP.scale);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Montserrat, sans-serif";
      ctx.fillText("G", meterP.x - 4, meterP.y + 15 * meterP.scale);
      ctx.restore();

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 17: Cảm ứng điện từ Faraday 3D");
    },

    _render2D(renderer) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const magX = cx + this.magnetZ;

      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 30, cy - 50, 60, 100);

      ctx.fillStyle = "#2563eb";
      ctx.fillRect(magX - 60, cy - 15, 40, 30);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(magX - 20, cy - 15, 40, 30);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Montserrat";
      ctx.fillText("S", magX - 45, cy + 5);
      ctx.fillText("N", magX + 5, cy + 5);

      renderer.drawDialMeter(cx, cy + 100, 30, this.indEMF, -6, 6, "G =", " V");
    },

    getResults() {
      return [
        { label: "Suất điện động e_c", value: `${this.indEMF.toFixed(2)} V` },
        { label: "Vị trí nam châm (Z)", value: `${this.magnetZ.toFixed(1)} mm` },
        { label: "Nguyên nhân xuất hiện e_c", value: "Từ thông qua cuộn dây biến thiên" },
        { label: "Khi nam châm đứng yên", value: "e_c = 0 V (kim về số 0)" }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 18: Chiều dòng điện theo định luật Lenz 3D
  // ----------------------------------------------------
  "exp-18": {
    camera: create3DCamera(0.35, -0.55, 420),
    ringDeflection: 0,

    init(renderer, graph) {
      this.camera.reset();
      this.ringDeflection = 0;
      graph.setConfig({
        title: "Lực cản định luật Lenz chống lại sự chuyển động",
        xLabel: "Vị trí",
        yLabel: "Lực cản (N)",
        xRange: [0, 10],
        yRange: [-5, 5]
      });
      graph.clearPoints();
    },

    update(dt, time, params, graph) {
      const mode = params.motionState || 0;
      const ringType = params.ringType || 1;
      const targetDefl = ringType === 2 ? 0 : (mode === 0 ? 25 : -20);
      this.ringDeflection += (targetDefl - this.ringDeflection) * Math.min(1, dt * 5);
      graph.setCurrentPoint(5, mode === 0 ? 3.5 : -3.5);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const mode = params.motionState || 0;
      const ringType = params.ringType || 1;

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 60);

      const pTop = cam.project(40, -85, 0, cx, cy);

      const rad = (this.ringDeflection * Math.PI) / 180;
      const ringZ = Math.sin(rad) * 65;
      const ringY = Math.cos(rad) * 65 - 85;

      ctx.save();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.2;
      const pRingTop = cam.project(40, ringY - 25, ringZ, cx, cy);
      ctx.beginPath();
      ctx.moveTo(pTop.x, pTop.y);
      ctx.lineTo(pRingTop.x, pRingTop.y);
      ctx.stroke();

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 5;
      ctx.beginPath();
      const endAngle = ringType === 2 ? Math.PI * 1.85 : Math.PI * 2;
      for (let th = 0; th <= endAngle; th += 0.15) {
        const px = 40;
        const py = ringY + Math.cos(th) * 28;
        const pz = ringZ + Math.sin(th) * 28;
        const p = cam.project(px, py, pz, cx, cy);
        if (th === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();

      const magX = mode === 0 ? -30 : -80;
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, magX - 30, ringY, ringZ, 45, 24, 24, "#2563eb", "#3b82f6", "#1d4ed8", "S");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, magX + 15, ringY, ringZ, 45, 24, 24, "#dc2626", "#ef4444", "#b91c1c", "N");

      if (ringType === 1) {
        if (mode === 0) {
          draw3DVector(ctx, cam, cx, cy, { x: 40, y: ringY, z: ringZ }, { x: 80, y: ringY, z: ringZ }, "#dc2626", 4, "LỰC ĐẨY");
        } else {
          draw3DVector(ctx, cam, cx, cy, { x: 40, y: ringY, z: ringZ }, { x: 0, y: ringY, z: ringZ }, "#2563eb", 4, "LỰC HÚT");
        }
      }

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 18: Định luật Lenz 3D (Lại gần thì đẩy, ra xa thì hút)");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const mode = params.motionState || 0;

      ctx.beginPath();
      ctx.arc(cx + 40, cy, 50, 0, Math.PI * 2);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 6;
      ctx.stroke();

      const magX = mode === 0 ? cx - 70 : cx - 110;
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(magX - 40, cy - 15, 40, 30);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(magX, cy - 15, 40, 30);

      if (mode === 0) {
        renderer.drawArrow(cx + 40, cy, cx + 65, cy, "#dc2626", 3);
        ctx.fillStyle = "#dc2626";
        ctx.fillText("ĐẨY NHAU (Chống lại sự lại gần)", cx - 60, cy + 90);
      } else {
        renderer.drawArrow(cx + 40, cy, cx + 15, cy, "#2563eb", 3);
        ctx.fillStyle = "#2563eb";
        ctx.fillText("HÚT NHAU (Chống lại sự ra xa)", cx - 60, cy + 90);
      }
    },

    getResults(params) {
      const mode = params.motionState || 0;
      const ringType = params.ringType || 1;
      return [
        { label: "Chế độ chuyển động", value: mode === 0 ? "Nam châm lại gần" : "Nam châm ra xa" },
        { label: "Loại vòng nhôm", value: ringType === 1 ? "Vòng nhôm kín" : "Vòng xẻ rãnh (mạch hở)" },
        { label: "Tương tác từ", value: ringType === 2 ? "Không có lực (i = 0)" : (mode === 0 ? "Lực ĐẨY (cùng cực)" : "Lực HÚT (trái cực)") },
        { label: "Bản chất định luật Lenz", value: "Bảo toàn năng lượng" }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 19: Suất điện động cảm ứng 3D Tương Tác
  // ----------------------------------------------------
  "exp-19": {
    angle: 0,
    time: 0,
    camera: create3DCamera(0.35, -0.65, 420),

    init(renderer, graph) {
      this.angle = 0;
      this.time = 0;
      this.camera.reset();
      graph.setConfig({
        title: "Dao động ký kép: Φ(t) [xanh] & e(t) [đỏ] (Lệch pha π/2)",
        xLabel: "t (s)",
        yLabel: "Biên độ",
        xRange: [0, 4],
        yRange: [-1.2, 1.2],
        theoreticalFn: (t) => Math.sin(4.0 * t)
      });
      graph.clearPoints();
    },

    update(dt, time, params, graph) {
      const omega = params.rotSpeed || 4.0;
      this.time += dt;
      this.angle += omega * dt;
      const e_norm = Math.sin(this.angle);

      if (Math.random() < 0.25) {
        graph.addPoint(this.time % 4, e_norm);
      }
      graph.setCurrentPoint(this.time % 4, e_norm);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const omega = params.rotSpeed || 4.0;
      const B = params.magB || 0.5;
      const N = params.coilTurnsN || 100;
      const E0 = N * B * 0.02 * omega;
      const eNow = E0 * Math.sin(this.angle);

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 70);

      // Magnetic Poles (Left: N Red, Right: S Blue)
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, -135, 0, 0, 45, 90, 110, "#dc2626", "#ef4444", "#b91c1c", "N");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 135, 0, 0, 45, 90, 110, "#2563eb", "#3b82f6", "#1d4ed8", "S");

      // Magnetic field lines (B horizontal from N to S)
      ctx.save();
      for (let y = -25; y <= 25; y += 25) {
        for (let z = -25; z <= 25; z += 25) {
          draw3DVector(ctx, cam, cx, cy, { x: -110, y: y, z: z }, { x: 110, y: y, z: z }, "rgba(56, 189, 248, 0.4)", 1.5);
        }
      }
      ctx.restore();

      // Rotating Coil in 3D
      const wCoil = 50, hCoil = 80;
      const cosA = Math.cos(this.angle);
      const sinA = Math.sin(this.angle);

      const p1 = cam.project(-wCoil * cosA, -hCoil / 2, -wCoil * sinA, cx, cy);
      const p2 = cam.project(wCoil * cosA, -hCoil / 2, wCoil * sinA, cx, cy);
      const p3 = cam.project(wCoil * cosA, hCoil / 2, wCoil * sinA, cx, cy);
      const p4 = cam.project(-wCoil * cosA, hCoil / 2, -wCoil * sinA, cx, cy);

      ctx.save();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 4;
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Normal vector n
      const nx = -sinA * 55, nz = cosA * 55;
      draw3DVector(ctx, cam, cx, cy, { x: 0, y: 0, z: 0 }, { x: nx, y: 0, z: nz }, "#10b981", 3, "n");

      // Glowing load bulb
      const lampP = cam.project(0, 110, 0, cx, cy);
      const glow = Math.min(1, Math.abs(eNow / E0));
      ctx.fillStyle = `rgba(250, 204, 21, ${0.3 + glow * 0.7})`;
      ctx.beginPath();
      ctx.arc(lampP.x, lampP.y, 14 * lampP.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 19: Suất điện động cảm ứng xoay chiều 3D");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cosA = Math.cos(this.angle);

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 50 * cosA, cy - 60, 100 * cosA, 120);
    },

    getResults(params) {
      const omega = params.rotSpeed || 4.0;
      const B = params.magB || 0.5;
      const N = params.coilTurnsN || 100;
      const S = 0.02;
      const E0 = N * B * S * omega;
      const Phi0 = N * B * S;
      const phiNow = Phi0 * Math.cos(this.angle);
      const eNow = E0 * Math.sin(this.angle);
      const alphaDeg = ((this.angle * 180 / Math.PI) % 360).toFixed(1);

      return [
        { label: "Góc quay α(t)", value: `${alphaDeg}°` },
        { label: "Từ thông tức thời Φ(t)", value: `${phiNow.toFixed(4)} Wb` },
        { label: "Suất điện động e(t)", value: `${eNow.toFixed(2)} V` },
        { label: "Biên độ cực đại E₀", value: `${E0.toFixed(2)} V` }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  },

  // ----------------------------------------------------
  // Thí nghiệm 20: Máy biến áp 3D (Transformer)
  // ----------------------------------------------------
  "exp-20": {
    camera: create3DCamera(0.35, -0.55, 440),
    fluxPhase: 0,

    init(renderer, graph) {
      this.camera.reset();
      this.fluxPhase = 0;
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

      this.fluxPhase += dt * 50 * Math.PI * 2;
      const tMs = (time * 1000) % 40;
      const val = u1 * Math.sin((2 * Math.PI * 50 * tMs) / 1000);
      graph.setCurrentPoint(tMs, val);
    },

    render(renderer, params) {
      const is3D = (params.viewMode3D === undefined || params.viewMode3D === 1);
      if (is3D) {
        this._render3D(renderer, params);
      } else {
        this._render2D(renderer, params);
      }
    },

    _render3D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const cam = this.camera;
      const u1 = params.inputU1 || 220;
      const n1 = params.primaryN1 || 1000;
      const n2 = params.secondaryN2 || 500;
      const u2 = FormulaEngine.calcTransformerU2(u1, n1, n2);

      draw3DGrid(ctx, cam, cx, cy, 180, 30, 80);

      // 3D Laminated Rectangular Steel Core (Khung thép khép kín)
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, -75, 0, 0, 30, 140, 30, "#64748b", "#94a3b8", "#475569");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 75, 0, 0, 30, 140, 30, "#64748b", "#94a3b8", "#475569");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, -60, 0, 180, 30, 30, "#64748b", "#94a3b8", "#475569");
      magnetismSimulations["exp-12"]._draw3DBox(ctx, cam, cx, cy, 0, 60, 0, 180, 30, 30, "#64748b", "#94a3b8", "#475569");

      // Primary Windings N1 (Red, Left limb)
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 4;
      const turns1 = Math.min(18, Math.max(8, Math.round(n1 / 100)));
      for (let i = 0; i < turns1; i++) {
        const wy = -35 + (i / turns1) * 70;
        const p1 = cam.project(-92, wy, -18, cx, cy);
        const p2 = cam.project(-58, wy, -18, cx, cy);
        const p3 = cam.project(-58, wy, 18, cx, cy);
        const p4 = cam.project(-92, wy, 18, cx, cy);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // Secondary Windings N2 (Blue, Right limb)
      ctx.save();
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 4;
      const turns2 = Math.min(18, Math.max(6, Math.round(n2 / 100)));
      for (let i = 0; i < turns2; i++) {
        const wy = -35 + (i / turns2) * 70;
        const p1 = cam.project(58, wy, -18, cx, cy);
        const p2 = cam.project(92, wy, -18, cx, cy);
        const p3 = cam.project(92, wy, 18, cx, cy);
        const p4 = cam.project(58, wy, 18, cx, cy);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // Circulating Magnetic Flux in Steel Core
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -this.fluxPhase * 15;
      const pf1 = cam.project(-75, -60, 0, cx, cy);
      const pf2 = cam.project(75, -60, 0, cx, cy);
      const pf3 = cam.project(75, 60, 0, cx, cy);
      const pf4 = cam.project(-75, 60, 0, cx, cy);
      ctx.beginPath();
      ctx.moveTo(pf1.x, pf1.y); ctx.lineTo(pf2.x, pf2.y);
      ctx.lineTo(pf3.x, pf3.y); ctx.lineTo(pf4.x, pf4.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Labels
      const pL1 = cam.project(-75, 95, 0, cx, cy);
      const pL2 = cam.project(75, 95, 0, cx, cy);
      ctx.save();
      ctx.font = "bold 12px Montserrat, sans-serif";
      ctx.fillStyle = "#ef4444";
      ctx.fillText(`U₁ = ${u1}V (N₁ = ${n1})`, pL1.x - 60, pL1.y);
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`U₂ = ${u2.toFixed(1)}V (N₂ = ${n2})`, pL2.x - 30, pL2.y);
      ctx.restore();

      draw3DIndicator(ctx, renderer.width, renderer.height, "Thí nghiệm 20: Máy biến áp 3D");
    },

    _render2D(renderer, params) {
      const ctx = renderer.ctx;
      const cx = renderer.width / 2;
      const cy = renderer.height / 2;
      const u1 = params.inputU1 || 220;
      const n1 = params.primaryN1 || 1000;
      const n2 = params.secondaryN2 || 500;
      const u2 = FormulaEngine.calcTransformerU2(u1, n1, n2);

      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(cx - 100, cy - 60, 200, 120);
      ctx.clearRect(cx - 50, cy - 30, 100, 60);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 100, cy - 60, 200, 120);
      ctx.strokeRect(cx - 50, cy - 30, 100, 60);

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      for (let y = cy - 40; y <= cy + 40; y += 12) {
        ctx.strokeRect(cx - 105, y, 10, 8);
      }

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
        { label: "Chế độ máy", value: n2 > n1 ? "Máy TĂNG ÁP" : (n2 < n1 ? "Máy HẠ ÁP" : "Máy CÁCH LY") }
      ];
    },

    onPointerDown(e, rect) { this.camera.onPointerDown(e, rect); },
    onPointerMove(e, rect) { this.camera.onPointerMove(e, rect); },
    onPointerUp() { this.camera.onPointerUp(); },
    cleanup() {}
  }
};
