/**
 * physics-lab/core/simulation-engine.js
 * Quản lý vòng đời hoạt ảnh (requestAnimationFrame), FPS, tạm dừng và điều chỉnh tốc độ
 */

export class SimulationEngine {
  constructor({ onUpdate, onRender }) {
    this.onUpdate = onUpdate || (() => {});
    this.onRender = onRender || (() => {});
    this.isRunning = false;
    this.speed = 1.0;
    this.elapsedTime = 0;
    this.lastTime = 0;
    this.fps = 60;
    this.rafId = null;
    this._loop = this._loop.bind(this);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
  }

  pause() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  reset() {
    this.pause();
    this.elapsedTime = 0;
    this.lastTime = performance.now();
  }

  setSpeed(speedMultiplier) {
    this.speed = Math.max(0.1, Math.min(5.0, Number(speedMultiplier) || 1.0));
  }

  step(customDt = 1 / 60) {
    this.elapsedTime += customDt;
    this.onUpdate(customDt, this.elapsedTime);
    this.onRender();
  }

  destroy() {
    this.pause();
    this.onUpdate = null;
    this.onRender = null;
  }

  _loop(currentTime) {
    if (!this.isRunning) return;

    const rawDelta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Giới hạn delta time để tránh bước nhảy lớn khi trình duyệt chuyển tab
    const clampedDelta = Math.min(rawDelta, 0.1);
    const scaledDelta = clampedDelta * this.speed;

    if (clampedDelta > 0) {
      this.fps = Math.round(1 / clampedDelta);
    }

    this.elapsedTime += scaledDelta;
    if (this.onUpdate) this.onUpdate(scaledDelta, this.elapsedTime);
    if (this.onRender) this.onRender();

    this.rafId = requestAnimationFrame(this._loop);
  }
}

