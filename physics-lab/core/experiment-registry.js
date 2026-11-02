/**
 * physics-lab/core/experiment-registry.js
 * Đăng ký và quản lý tất cả 25 mô phỏng thí nghiệm từ 4 chương
 */

import { EXPERIMENT_CATALOG } from "../config/experiment-catalog.config.js";
import { thermalSimulations } from "../simulations/ch1-thermal.js";
import { idealGasSimulations } from "../simulations/ch2-ideal-gas.js";
import { magnetismSimulations } from "../simulations/ch3-magnetism.js";
import { nuclearSimulations } from "../simulations/ch4-nuclear.js";

const simulationsMap = {
  ...thermalSimulations,
  ...idealGasSimulations,
  ...magnetismSimulations,
  ...nuclearSimulations
};

export class ExperimentRegistry {
  static getAllMetadata() {
    return EXPERIMENT_CATALOG;
  }

  static getMetadataById(expId) {
    return EXPERIMENT_CATALOG.find((e) => e.id === expId) || null;
  }

  static getSimulationHandler(expId) {
    const handler = simulationsMap[expId];
    if (!handler) {
      console.warn(`Simulation handler not found for experiment: ${expId}`);
      return null;
    }
    return handler;
  }

  static getExperimentsByChapter(chapterId) {
    return EXPERIMENT_CATALOG.filter((e) => e.chapterId === chapterId);
  }
}

