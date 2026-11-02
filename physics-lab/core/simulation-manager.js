/**
 * physics-lab/core/simulation-manager.js
 * Quản lý vòng đời thí nghiệm hiện tại, chuyển đổi mượt mà giữa 25 bài và dọn dẹp bộ nhớ
 */

import { ExperimentRegistry } from "./experiment-registry.js";
import { SimulationEngine } from "./simulation-engine.js";

export class SimulationManager {
  constructor({ renderer, graphManager, onStateChange, onResultsUpdate }) {
    this.renderer = renderer;
    this.graph = graphManager;
    this.onStateChange = onStateChange || (() => {});
    this.onResultsUpdate = onResultsUpdate || (() => {});

    this.activeMetadata = null;
    this.activeHandler = null;
    this.currentParams = {};

    this.engine = new SimulationEngine({
      onUpdate: (dt, time) => this._onEngineUpdate(dt, time),
      onRender: () => this._onEngineRender()
    });
  }

  loadExperiment(expId) {
    // 1. Dọn dẹp thí nghiệm cũ triệt để (Ngăn chặn Memory Leak)
    if (this.activeHandler && typeof this.activeHandler.cleanup === "function") {
      try {
        this.activeHandler.cleanup();
      } catch (err) {
        console.error("Lỗi khi cleanup thí nghiệm cũ:", err);
      }
    }

    this.engine.reset();
    this.renderer.clear();
    this.graph.clearPoints();

    // 2. Tải metadata và handler mới
    const metadata = ExperimentRegistry.getMetadataById(expId);
    if (!metadata) {
      console.error(`Không tìm thấy metadata cho: ${expId}`);
      return false;
    }

    const handler = ExperimentRegistry.getSimulationHandler(expId);
    if (!handler) {
      console.error(`Không tìm thấy handler cho: ${expId}`);
      return false;
    }

    this.activeMetadata = metadata;
    this.activeHandler = handler;

    // 3. Khởi tạo giá trị tham số mặc định
    this.currentParams = {};
    if (Array.isArray(metadata.params)) {
      metadata.params.forEach((p) => {
        this.currentParams[p.id] = p.defaultValue;
      });
    }

    // 4. Khởi tạo mô phỏng
    if (typeof handler.init === "function") {
      handler.init(this.renderer, this.graph, metadata);
    }

    // 5. Cập nhật giao diện
    this.onStateChange(this.activeMetadata, this.currentParams);
    this._refreshResults();

    // 6. Bắt đầu chạy engine
    this.engine.start();
    return true;
  }

  setParam(paramId, value) {
    this.currentParams[paramId] = Number(value);
    if (this.activeHandler && typeof this.activeHandler.onParamChange === "function") {
      this.activeHandler.onParamChange(paramId, Number(value));
    }
    this._refreshResults();
  }

  setSpeed(multiplier) {
    this.engine.setSpeed(multiplier);
  }

  play() {
    this.engine.start();
  }

  pause() {
    this.engine.pause();
  }

  reset() {
    if (this.activeMetadata) {
      this.loadExperiment(this.activeMetadata.id);
    }
  }

  handlePointerDown(e, rect) {
    if (this.activeHandler && typeof this.activeHandler.onPointerDown === "function") {
      this.activeHandler.onPointerDown(e, rect);
    }
  }

  handlePointerMove(e, rect) {
    if (this.activeHandler && typeof this.activeHandler.onPointerMove === "function") {
      this.activeHandler.onPointerMove(e, rect);
    }
  }

  handlePointerUp(e) {
    if (this.activeHandler && typeof this.activeHandler.onPointerUp === "function") {
      this.activeHandler.onPointerUp(e);
    }
  }

  _onEngineUpdate(dt, time) {
    if (this.activeHandler && typeof this.activeHandler.update === "function") {
      this.activeHandler.update(dt, time, this.currentParams, this.graph, this.renderer);
    }
    this._refreshResults();
  }

  _onEngineRender() {
    this.renderer.clear();
    this.renderer.drawGrid(40);
    if (this.activeHandler && typeof this.activeHandler.render === "function") {
      this.activeHandler.render(this.renderer, this.currentParams);
    }
    this.graph.render();
  }

  _refreshResults() {
    if (this.activeHandler && typeof this.activeHandler.getResults === "function") {
      const results = this.activeHandler.getResults(this.currentParams);
      this.onResultsUpdate(results);
    }
  }
}

