import test from "node:test";
import assert from "node:assert/strict";
import { EXPERIMENT_CATALOG } from "../physics-lab/config/experiment-catalog.config.js";
import { LAB_CONFIG } from "../physics-lab/config/lab.config.js";
import { ExperimentRegistry } from "../physics-lab/core/experiment-registry.js";
import { FormulaEngine } from "../physics-lab/core/formula-engine.js";

test("Physics Lab: Catalog contains exactly 25 experiments covering 4 chapters", () => {
  assert.equal(EXPERIMENT_CATALOG.length, 25, "Must have exactly 25 experiments");

  const ids = new Set(EXPERIMENT_CATALOG.map((e) => e.id));
  assert.equal(ids.size, 25, "All experiment IDs must be unique");

  const ch1 = EXPERIMENT_CATALOG.filter((e) => e.chapterId === "ch1");
  const ch2 = EXPERIMENT_CATALOG.filter((e) => e.chapterId === "ch2");
  const ch3 = EXPERIMENT_CATALOG.filter((e) => e.chapterId === "ch3");
  const ch4 = EXPERIMENT_CATALOG.filter((e) => e.chapterId === "ch4");

  assert.equal(ch1.length, 6, "Chương I (Vật lí nhiệt) must have 6 experiments");
  assert.equal(ch2.length, 5, "Chương II (Khí lí tưởng) must have 5 experiments");
  assert.equal(ch3.length, 9, "Chương III (Từ trường) must have 9 experiments");
  assert.equal(ch4.length, 5, "Chương IV (Vật lí hạt nhân) must have 5 experiments");
});

test("Physics Lab: Every experiment has a valid simulation handler and required methods", () => {
  EXPERIMENT_CATALOG.forEach((exp) => {
    const handler = ExperimentRegistry.getSimulationHandler(exp.id);
    assert.ok(handler, `Handler must exist for experiment ${exp.id}`);
    assert.equal(typeof handler.init, "function", `${exp.id} must implement init()`);
    assert.equal(typeof handler.update, "function", `${exp.id} must implement update()`);
    assert.equal(typeof handler.render, "function", `${exp.id} must implement render()`);
    assert.equal(typeof handler.getResults, "function", `${exp.id} must implement getResults()`);
    assert.equal(typeof handler.cleanup, "function", `${exp.id} must implement cleanup()`);
  });
});

test("Physics Lab: FormulaEngine calculations follow SI standards", () => {
  // 1. Boyle's law check
  const p1 = FormulaEngine.calcBoylePressure(0.1, 300, 2.0);
  const p2 = FormulaEngine.calcBoylePressure(0.1, 300, 1.0);
  assert.ok(Math.abs(p2 - p1 * 2) < 0.01, "Halving volume must double pressure in Boyle's law");

  // 2. Radioactive decay at half-life check
  const remaining = FormulaEngine.calcDecayRemaining(256, 8, 8);
  assert.equal(remaining, 128, "At t = T, remaining nuclei must be N0 / 2");

  // 3. Ampere force check
  const fMax = FormulaEngine.calcAmpereForce(2, 0.5, 0.1, 90);
  const fZero = FormulaEngine.calcAmpereForce(2, 0.5, 0.1, 0);
  assert.ok(Math.abs(fMax - 0.1) < 1e-6, "F = 2 * 0.5 * 0.1 * sin(90) = 0.1 N");
  assert.ok(Math.abs(fZero) < 1e-6, "F = 0 when wire is parallel to B field");

  // 4. Specific heat calculation check
  const c = FormulaEngine.calcSpecificHeat(150, 60, 0.3, 7.17);
  assert.ok(Math.abs(c - 4184) < 10, "Specific heat calculation matches standard water value");
});

