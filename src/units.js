// Pure unit conversions. No I/O, no state — every function is deterministic.
const FT_PER_M = 3.28084;
const NM_PER_KM = 0.539957;
const LB_PER_KG = 2.20462;
const GAL_PER_L = 0.264172;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

module.exports = {
  ktToMph: (kt) => num(kt) * 1.15078,
  mphToKt: (mph) => num(mph) / 1.15078,
  ktToKmh: (kt) => num(kt) * 1.852,
  kmhToKt: (kmh) => num(kmh) / 1.852,
  ftToM: (ft) => num(ft) / FT_PER_M,
  mToFt: (m) => num(m) * FT_PER_M,
  nmToSm: (nm) => num(nm) * 1.15078,
  smToNm: (sm) => num(sm) / 1.15078,
  nmToKm: (nm) => num(nm) * 1.852,
  kmToNm: (km) => num(km) / 1.852,
  inHgToHpa: (inHg) => num(inHg) * 33.8639,
  hpaToInHg: (hpa) => num(hpa) / 33.8639,
  lbToKg: (lb) => num(lb) / LB_PER_KG,
  kgToLb: (kg) => num(kg) * LB_PER_KG,
  galToL: (gal) => num(gal) / GAL_PER_L,
  lToGal: (l) => num(l) * GAL_PER_L,
  galToLb: (gal, lbPerGal = 6.0) => num(gal) * lbPerGal,
  lbToGal: (lb, lbPerGal = 6.0) => num(lb) / lbPerGal,
  cToF: (c) => num(c) * 9 / 5 + 32,
  fToC: (f) => (num(f) - 32) * 5 / 9,
  convert: convert,
  unitList: unitList,
};

// Factor to a per-quantity base unit. Base units: kt, NM, inHg, lb, gal, °C.
const TABLES = {
  Speed: { kt: 1, mph: 1 / 1.15078, 'km/h': 1 / 1.852, 'm/s': 1 / 1.94384 },
  Distance: { NM: 1, SM: 1 / 1.15078, km: 1 / 1.852, ft: 1 / 6076.12, m: 1 / 1852 },
  Pressure: { inHg: 1, hPa: 1 / 33.8639 },
  Weight: { lb: 1, kg: 1 / LB_PER_KG },
  Volume: { gal: 1, L: GAL_PER_L },
};

function unitList(kind) {
  if (kind === 'Temperature') return ['°C', '°F'];
  const t = TABLES[kind];
  return t ? Object.keys(t) : [];
}

function convert(kind, from, to, value) {
  const v = num(value);
  if (!Number.isFinite(v)) return NaN;
  if (kind === 'Temperature') {
    if (from === '°C' && to === '°F') return module.exports.cToF(v);
    if (from === '°F' && to === '°C') return module.exports.fToC(v);
    return from === to ? v : NaN;
  }
  const t = TABLES[kind];
  if (!t || !t[from] || !t[to]) return NaN;
  return (v * t[from]) / t[to];
}
