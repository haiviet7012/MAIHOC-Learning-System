/**
 * js/physics/index.js
 * Entrypoint của Phân hệ Thư viện Công thức Vật lý MAIHOC
 */

import { createPhysicsFormulaView } from "./formula-view.js?v=20261102v1";

export function mountPhysicsFormulasModule(container, options = {}) {
  return createPhysicsFormulaView(container, options);
}

