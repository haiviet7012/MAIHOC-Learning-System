/**
 * physics-lab/utils/formatters.js
 * Định dạng số khoa học, đơn vị đo lường và làm tròn chính xác theo chữ số có nghĩa
 */

export function formatScientific(num, precision = 3) {
  if (num === null || num === undefined || Number.isNaN(num)) return "—";
  if (num === 0) return "0";
  const abs = Math.abs(num);
  if (abs >= 1e4 || (abs < 0.001 && abs > 0)) {
    return num.toExponential(precision);
  }
  return Number(num.toFixed(precision)).toString();
}

export function formatUnit(value, unit, precision = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value.toFixed(precision))} ${unit}`.trim();
}

export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const remS = (s % 60).toFixed(1);
  return `${m > 0 ? `${m}m ` : ""}${remS}s`;
}

