/**
 * physics-lab/core/formula-engine.js
 * Động cơ tính toán vật lí chuẩn xác theo SI cho 25 thí nghiệm Vật lí 12
 */

import { CONSTANTS } from "../utils/physics-constants.js";

export const FormulaEngine = {
  // Thí nghiệm 1: Nhiệt dung riêng
  calcSpecificHeat(powerW, timeS, massKg, deltaTC) {
    if (massKg <= 0 || deltaTC <= 0) return 0;
    const Q = powerW * timeS;
    return Q / (massKg * deltaTC);
  },

  // Thí nghiệm 2: Nhiệt nóng chảy riêng
  calcLatentHeatFusion(powerW, timeS, iceMassKg) {
    if (iceMassKg <= 0) return 0;
    return (powerW * timeS) / iceMassKg;
  },

  // Thí nghiệm 3: Nhiệt hóa hơi riêng
  calcLatentHeatVaporization(powerW, timeS, vaporMassKg) {
    if (vaporMassKg <= 0) return 0;
    return (powerW * timeS) / vaporMassKg;
  },

  // Thí nghiệm 6: Định luật I nhiệt động lực học
  calcInternalEnergyChange(heatQ, workA) {
    return heatQ + workA;
  },

  // Thí nghiệm 7: Định luật Boyle
  calcBoylePressure(nMol, tempK, volumeLiters) {
    if (volumeLiters <= 0) return 0;
    const volumeM3 = volumeLiters * 1e-3;
    const pressurePa = (nMol * CONSTANTS.R * tempK) / volumeM3;
    return pressurePa / 1000; // Trả về kPa
  },

  // Thí nghiệm 8: Định luật Charles
  calcCharlesVolume(v1Liters, t1K, t2K) {
    if (t1K <= 0) return 0;
    return v1Liters * (t2K / t1K);
  },

  // Thí nghiệm 9: Phương trình trạng thái khí lí tưởng
  calcIdealGasPressure(nMol, tempK, volumeLiters) {
    return this.calcBoylePressure(nMol, tempK, volumeLiters);
  },

  // Thí nghiệm 10: Tốc độ căn quân phương phân tử
  calcRmsSpeed(tempK, molarMassKgPerMol = 0.02897) {
    // Mặc định phân tử không khí N2/O2 ~ 0.029 kg/mol
    if (tempK <= 0) return 0;
    return Math.sqrt((3 * CONSTANTS.R * tempK) / molarMassKgPerMol);
  },

  // Thí nghiệm 11: Áp suất từ va chạm phân tử
  calcKineticPressure(densityKgM3, vRms) {
    return (1 / 3) * densityKgM3 * vRms * vRms;
  },

  // Thí nghiệm 14: Từ trường dòng điện thẳng
  calcStraightWireB(currentA, distanceM) {
    if (distanceM <= 0) return 0;
    return (2e-7 * currentA) / distanceM; // Tesla
  },

  // Thí nghiệm 15: Từ trường ống dây
  calcSolenoidB(currentA, turnsPerMeter) {
    return CONSTANTS.mu0 * turnsPerMeter * currentA; // Tesla
  },

  // Thí nghiệm 16: Lực từ Am-pe
  calcAmpereForce(currentA, bTesla, lengthM, angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    return currentA * bTesla * lengthM * Math.sin(angleRad); // Newton
  },

  // Thí nghiệm 17, 19: Suất điện động cảm ứng
  calcInducedEmf(nTurns, deltaPhiWb, deltaTS) {
    if (deltaTS <= 0) return 0;
    return -nTurns * (deltaPhiWb / deltaTS); // Volt
  },

  // Thí nghiệm 20: Máy biến áp
  calcTransformerU2(u1Volt, n1Turns, n2Turns) {
    if (n1Turns <= 0) return 0;
    return u1Volt * (n2Turns / n1Turns); // Volt
  },

  // Thí nghiệm 22: Độ hụt khối và năng lượng liên kết
  calcMassDefect(z, a, actualMassU) {
    const n = a - z;
    const totalMassNucleons = z * CONSTANTS.mp_u + n * CONSTANTS.mn_u;
    const deltaM_u = Math.max(0, totalMassNucleons - actualMassU);
    const bindingEnergyMeV = deltaM_u * CONSTANTS.u_to_MeV;
    const specificEnergy = a > 0 ? bindingEnergyMeV / a : 0;
    return {
      deltaM_u,
      bindingEnergyMeV,
      specificEnergy
    };
  },

  // Thí nghiệm 25: Phân rã phóng xạ
  calcDecayRemaining(n0, timeS, halfLifeS) {
    if (halfLifeS <= 0) return 0;
    return n0 * Math.pow(2, -timeS / halfLifeS);
  }
};

