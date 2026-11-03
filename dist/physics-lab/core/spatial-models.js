const protonMass = 1.67262192369e-27,
  charge = 1.602176634e-19;
export function spatialSample(kind, p, t) {
  if (!Number.isFinite(t) || t < 0) throw new Error("Thời gian không hợp lệ.");
  if (kind === "helix") {
    const B = Number(p.field) * 1e-3,
      v = Number(p.speed) * 1000,
      angle = (Number(p.angle) * Math.PI) / 180;
    if (!(B > 0 && v >= 0 && angle >= 0 && angle <= Math.PI / 2))
      throw new Error("Tham số từ trường/vận tốc/góc không hợp lệ.");
    const w = (charge * B) / protonMass,
      r = (v * Math.sin(angle)) / w;
    return {
      x: r * Math.sin(w * t),
      y: r * (Math.cos(w * t) - 1),
      z: v * Math.cos(angle) * t,
      radius: r,
      period: (2 * Math.PI) / w,
      speed: v,
    };
  }
  if (kind === "projectile") {
    const v = Number(p.speed),
      a = (Number(p.angle) * Math.PI) / 180,
      b = (Number(p.azimuth) * Math.PI) / 180,
      g = 9.81;
    if (!(v >= 0 && a >= 0 && a <= Math.PI / 2 && Number.isFinite(b)))
      throw new Error("Tham số ném xiên không hợp lệ.");
    return {
      x: v * Math.cos(a) * Math.cos(b) * t,
      y: Math.max(0, v * Math.sin(a) * t - (g * t * t) / 2),
      z: v * Math.cos(a) * Math.sin(b) * t,
      flightTime: (2 * v * Math.sin(a)) / g,
      range: (v * v * Math.sin(2 * a)) / g,
    };
  }
  if (kind === "field") {
    const current = Number(p.current),
      radius = Number(p.radius) / 100;
    if (!Number.isFinite(current) || !(radius > 0))
      throw new Error("Tham số dòng điện/khoảng cách không hợp lệ.");
    return {
      x: radius * Math.cos(t),
      y: 0,
      z: radius * Math.sin(t),
      magneticField: (2e-7 * current) / radius,
    };
  }
  throw new Error("Thí nghiệm chưa hỗ trợ.");
}
