/**
 * physics-lab/utils/physics-constants.js
 * Các hằng số vật lí chuẩn quốc tế (SI) phục vụ tính toán chính xác
 */

export const CONSTANTS = Object.freeze({
  // Hằng số khí lí tưởng R [J/(mol·K)]
  R: 8.314462618,

  // Hằng số Boltzmann kB [J/K]
  kB: 1.380649e-23,

  // Số Avogadro NA [1/mol]
  NA: 6.02214076e23,

  // Điện tích nguyên tố e [C]
  e: 1.602176634e-19,

  // Tốc độ ánh sáng trong chân không c [m/s]
  c: 299792458,

  // Khối lượng nguyên tử u [kg]
  u: 1.66053906660e-27,

  // Năng lượng tương đương của 1u theo MeV
  u_to_MeV: 931.5,

  // Khối lượng proton mp [u] và [kg]
  mp_u: 1.007276,
  mp_kg: 1.67262192369e-27,

  // Khối lượng neutron mn [u] và [kg]
  mn_u: 1.008665,
  mn_kg: 1.67492749804e-27,

  // Khối lượng electron me [u] và [kg]
  me_u: 0.00054858,
  me_kg: 9.1093837e-31,

  // Độ từ thẩm của chân không μ0 [T·m/A hoặc H/m]
  mu0: 4 * Math.PI * 1e-7,

  // Hằng số điện môi chân không ε0 [F/m]
  eps0: 8.8541878128e-12,

  // Gia tốc trọng trường chuẩn g [m/s²]
  g: 9.80665,

  // Áp suất khí quyển tiêu chuẩn 1 atm [Pa]
  atm_to_Pa: 101325,

  // Độ không tuyệt đối theo Celsius [°C]
  abs_zero_C: -273.15
});

