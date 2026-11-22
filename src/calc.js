// PilotCalc core — deterministic aviation math only.
// No I/O, no randomness, no network. Every function returns numbers or null;
// callers decide how to present them. Formulas follow standard atmosphere /
// vector conventions used in FAA training material; see docs/公式与来源.md.
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const ok = (...vals) => vals.every((v) => Number.isFinite(v));

function norm360(d) {
  const x = num(d) % 360;
  return x < 0 ? x + 360 : x;
}
function norm180(d) {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
}

// ---------------- atmosphere ----------------
function isaTempC(altFt) {
  return 15 - 1.98 * (num(altFt) / 1000);
}

function standardAtmosphere(altFt) {
  const h = num(altFt);
  if (!Number.isFinite(h)) return null;
  const tC = h <= 36089 ? 15 - 1.98 * (h / 1000) : -56.5;
  const pInHg = h <= 36089
    ? 29.92126 * Math.pow(1 - 6.87535e-6 * h, 5.2561)
    : 1.94244 * Math.exp(-(h - 36089) / 27813.7);
  const theta = (273.15 + tC) / 288.15;
  const delta = pInHg / 29.92126;
  return { tempC: tC, pressureInHg: pInHg, pressureRatio: delta, densityRatio: delta / theta };
}

function pressureAltitude(indicatedFt, altimeterInHg) {
  if (!ok(num(indicatedFt), num(altimeterInHg))) return NaN;
  return num(indicatedFt) + (29.92 - num(altimeterInHg)) * 1000;
}

function densityAltitude(pressureAltFt, oatC) {
  if (!ok(num(pressureAltFt), num(oatC))) return NaN;
  const isa = isaTempC(pressureAltFt);
  return num(pressureAltFt) + 118.8 * (num(oatC) - isa);
}

function trueAltitude(indicatedFt, oatC, pressureAltFt) {
  const pa = Number.isFinite(num(pressureAltFt)) ? num(pressureAltFt) : num(indicatedFt);
  if (!ok(num(indicatedFt), num(oatC), pa)) return NaN;
  const isa = isaTempC(pa);
  return num(indicatedFt) + 4 * (num(indicatedFt) / 1000) * (num(oatC) - isa);
}

function speedOfSoundKt(oatC) {
  if (!ok(num(oatC))) return NaN;
  return 661.47 * Math.sqrt((273.15 + num(oatC)) / 288.15);
}

function machFromTas(tasKt, oatC) {
  const a = speedOfSoundKt(oatC);
  if (!ok(num(tasKt), a)) return NaN;
  return num(tasKt) / a;
}

function tasFromMach(mach, oatC) {
  const a = speedOfSoundKt(oatC);
  if (!ok(num(mach), a)) return NaN;
  return num(mach) * a;
}

function tasFromCas(casKt, pressureAltFt, oatC) {
  if (!ok(num(casKt), num(pressureAltFt), num(oatC))) return NaN;
  const atm = standardAtmosphere(pressureAltFt);
  const theta = (273.15 + num(oatC)) / 288.15;
  const rhoRatio = atm.pressureRatio / theta;
  return num(casKt) / Math.sqrt(rhoRatio);
}

// ---------------- wind ----------------
function windTriangle(trueCourse, tasKt, windFromDir, windSpeedKt) {
  if (!ok(num(trueCourse), num(tasKt), num(windFromDir), num(windSpeedKt)) || num(tasKt) <= 0) return null;
  const delta = norm180(num(windFromDir) - num(trueCourse));
  const ratio = num(windSpeedKt) / num(tasKt);
  if (Math.abs(ratio) > 1) return null; // wind stronger than TAS: not solvable
  const wca = Math.asin(ratio * Math.sin(delta * D2R)) * R2D;
  const trueHeading = norm360(num(trueCourse) + wca);
  const groundSpeed = num(tasKt) * Math.cos(wca * D2R) - num(windSpeedKt) * Math.cos(delta * D2R);
  return {
    wca,
    trueHeading,
    groundSpeed,
    headwind: -1 * num(windSpeedKt) * Math.cos(delta * D2R),
    crosswind: num(windSpeedKt) * Math.sin(delta * D2R),
  };
}

function windComponents(runwayHeading, windFromDir, windSpeedKt) {
  if (!ok(num(runwayHeading), num(windFromDir), num(windSpeedKt))) return null;
  const delta = norm180(num(windFromDir) - num(runwayHeading));
  const headwind = num(windSpeedKt) * Math.cos(delta * D2R);
  const crosswind = num(windSpeedKt) * Math.sin(delta * D2R);
  return {
    headwind,
    crosswind,
    crosswindSide: Math.abs(crosswind) < 0.05 ? 'none' : crosswind > 0 ? 'right' : 'left',
    gustFactor: null,
  };
}

function withGusts(components, gustKt) {
  if (!components || !Number.isFinite(num(gustKt))) return components;
  return { ...components, gustFactor: num(gustKt) - Math.abs(components.headwind) };
}

// ---------------- climb / descent --------------
function gradientPctToFtPerNm(pct) {
  if (!ok(num(pct))) return NaN;
  return num(pct) * 60.7612;
}
function gradientFtPerNmToPct(ftPerNm) {
  if (!ok(num(ftPerNm))) return NaN;
  return num(ftPerNm) / 60.7612;
}
function gradientRateFpm(ftPerNm, groundSpeedKt) {
  if (!ok(num(ftPerNm), num(groundSpeedKt))) return NaN;
  return num(ftPerNm) * num(groundSpeedKt) / 60;
}

function topOfDescent(altitudeToLoseFt, groundSpeedKt, gradientFtPerNm = 318) {
  if (!ok(num(altitudeToLoseFt), num(groundSpeedKt), num(gradientFtPerNm)) || num(gradientFtPerNm) <= 0) return null;
  const distanceNm = num(altitudeToLoseFt) / num(gradientFtPerNm);
  return {
    distanceNm,
    timeMin: num(groundSpeedKt) > 0 ? distanceNm / num(groundSpeedKt) * 60 : NaN,
    rateFpm: gradientRateFpm(gradientFtPerNm, groundSpeedKt),
    gradientPct: gradientFtPerNmToPct(gradientFtPerNm),
  };
}

function descentRateFromAngle(groundSpeedKt, angleDeg) {
  if (!ok(num(groundSpeedKt), num(angleDeg))) return NaN;
  return num(groundSpeedKt) * 6076.12 / 60 * Math.tan(num(angleDeg) * D2R);
}
function descentAngleFromRate(groundSpeedKt, fpm) {
  if (!ok(num(groundSpeedKt), num(fpm)) || num(groundSpeedKt) <= 0) return NaN;
  return Math.atan(num(fpm) / (num(groundSpeedKt) * 6076.12 / 60)) * R2D;
}

// ---------------- legs / fuel --------------
function legTimeMin(distanceNm, groundSpeedKt) {
  if (!ok(num(distanceNm), num(groundSpeedKt)) || num(groundSpeedKt) <= 0) return NaN;
  return num(distanceNm) / num(groundSpeedKt) * 60;
}
function legFuelGal(distanceNm, groundSpeedKt, burnGph) {
  const t = legTimeMin(distanceNm, groundSpeedKt);
  if (!ok(t, num(burnGph))) return NaN;
  return num(burnGph) * t / 60;
}
function enduranceMin(fuelGal, burnGph) {
  if (!ok(num(fuelGal), num(burnGph)) || num(burnGph) <= 0) return NaN;
  return num(fuelGal) / num(burnGph) * 60;
}
function reserveFuelGal(burnGph, reserveMin) {
  if (!ok(num(burnGph), num(reserveMin))) return NaN;
  return num(burnGph) * num(reserveMin) / 60;
}

// ---------------- course math --------------
function trueToMagnetic(trueCourse, variationEastDeg) {
  if (!ok(num(trueCourse), num(variationEastDeg))) return NaN;
  return norm360(num(trueCourse) - num(variationEastDeg));
}
function magneticToCompass(magneticCourse, deviationEastDeg) {
  if (!ok(num(magneticCourse), num(deviationEastDeg))) return NaN;
  return norm360(num(magneticCourse) - num(deviationEastDeg));
}
function compassToMagnetic(compassCourse, deviationEastDeg) {
  if (!ok(num(compassCourse), num(deviationEastDeg))) return NaN;
  return norm360(num(compassCourse) + num(deviationEastDeg));
}

function radialInterceptHeading(currentRadialFromStation, desiredRadial) {
  if (!ok(num(currentRadialFromStation), num(desiredRadial))) return null;
  const delta = norm180(num(desiredRadial) - num(currentRadialFromStation));
  // turn toward the desired radial, intercept at 45 degrees
  const side = delta > 0 ? 1 : -1;
  const interceptHeading = norm360(num(desiredRadial) + side * 45);
  return { interceptHeading, turnDegrees: Math.abs(delta), side: side > 0 ? 'right' : 'left' };
}

// ---------------- weather / sun --------------
function cloudBaseFt(tempC, dewPointC, unit = 'C') {
  if (!ok(num(tempC), num(dewPointC))) return NaN;
  const spread = unit === 'F' ? (num(tempC) - num(dewPointC)) * 5 / 9 : num(tempC) - num(dewPointC);
  if (spread < 0) return NaN;
  return spread * 400;
}

function sunTimes(dateISO, latDeg, lonDeg, zenithDeg = 90.833) {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime()) || !ok(num(latDeg), num(lonDeg))) return null;
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1 + 0.5);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const latR = num(latDeg) * D2R;
  const cosHa = Math.cos(num(zenithDeg) * D2R) / (Math.cos(latR) * Math.cos(decl)) - Math.tan(latR) * Math.tan(decl);
  if (cosHa > 1) return { polar: 'night' };
  if (cosHa < -1) return { polar: 'day' };
  const haDeg = Math.acos(cosHa) * R2D;
  const sunriseMin = 720 - 4 * (num(lonDeg) + haDeg) - eqTime;
  const sunsetMin = 720 - 4 * (num(lonDeg) - haDeg) - eqTime;
  return {
    sunriseUTC: ((sunriseMin % 1440) + 1440) % 1440,
    sunsetUTC: ((sunsetMin % 1440) + 1440) % 1440,
    solarNoonUTC: ((720 - 4 * num(lonDeg) - eqTime) % 1440 + 1440) % 1440,
  };
}

// ---------------- weight & balance ----------
function weightBalance(items, envelope, limits = {}) {
  if (!Array.isArray(items) || !items.length) return null;
  let weight = 0;
  let moment = 0;
  for (const it of items) {
    if (!ok(num(it.weight), num(it.arm))) return null;
    weight += num(it.weight);
    moment += num(it.weight) * num(it.arm);
  }
  if (weight <= 0) return null;
  const cg = moment / weight;
  const maxWeight = Number.isFinite(num(limits.maxWeight)) ? num(limits.maxWeight) : null;
  const overWeight = maxWeight !== null ? weight > maxWeight : null;
  const inEnvelope = Array.isArray(envelope) && envelope.length >= 3
    ? pointInPolygon({ x: cg, y: weight }, envelope)
    : null;
  return { weight, moment, cg, inEnvelope, overWeight, maxWeight };
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x; const yi = poly[i].y;
    const xj = poly[j].x; const yj = poly[j].y;
    const hit = (yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

// Generic POH table correction: caller supplies the POH factors, we never invent them.
function applyPohCorrections(baseValue, corrections) {
  if (!ok(num(baseValue))) return null;
  let value = num(baseValue);
  const applied = [];
  for (const c of corrections || []) {
    if (!Number.isFinite(num(c.value)) || !Number.isFinite(num(c.perUnit))) continue;
    const delta = num(c.value) * num(c.perUnit);
    value += delta;
    applied.push({ reason: c.reason || 'correction', delta });
  }
  return { value, applied };
}

module.exports = {
  norm360, norm180, isaTempC, standardAtmosphere, pressureAltitude, densityAltitude, trueAltitude,
  speedOfSoundKt, machFromTas, tasFromMach, tasFromCas,
  windTriangle, windComponents, withGusts,
  gradientPctToFtPerNm, gradientFtPerNmToPct, gradientRateFpm,
  topOfDescent, descentRateFromAngle, descentAngleFromRate,
  legTimeMin, legFuelGal, enduranceMin, reserveFuelGal,
  trueToMagnetic, magneticToCompass, compassToMagnetic, radialInterceptHeading,
  cloudBaseFt, sunTimes,
  weightBalance, pointInPolygon, applyPohCorrections,
};
