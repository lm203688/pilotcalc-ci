// Golden-value tests. Sources: standard atmosphere tables (FAA Pilot's Handbook),
// vector examples worked by hand, and published E6B drift values.
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/calc');
const u = require('../src/units');

const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('pressure altitude: same setting keeps field elevation', () => {
  assert.equal(c.pressureAltitude(5000, 29.92), 5000);
  near(c.pressureAltitude(5000, 30.12), 4800, 0.001);
  assert.equal(c.pressureAltitude(0, 29.42), 500);
});

test('ISA temperature lapse and density altitude', () => {
  near(c.isaTempC(5000), 5.1, 0.01);
  near(c.isaTempC(10000), -4.8, 0.01);
  near(c.densityAltitude(5000, 25), 7364.12, 1);
  near(c.densityAltitude(0, 30), 1782, 1); // hot sea-level day: ISA+15
});

test('true altitude temperature correction', () => {
  near(c.trueAltitude(10000, 20, 10000), 10992, 2);
  near(c.trueAltitude(5000, 15, 5000), 5198, 1); // ISA at 5,000 ft is 5.1C, so +9.9C
});

test('standard atmosphere: 18,000 ft is about half sea-level pressure', () => {
  const atm = c.standardAtmosphere(18000);
  near(atm.pressureInHg, 14.95, 0.1);
  near(c.standardAtmosphere(5000).pressureInHg, 24.9, 0.05);
  assert.ok(atm.densityRatio > atm.pressureRatio); // density ratio = delta / theta, theta < 1
});

test('speed of sound and Mach conversions', () => {
  near(c.speedOfSoundKt(15), 661.47, 0.01);
  near(c.machFromTas(450, -50), 0.773, 0.005);
  near(c.tasFromMach(0.80, 15), 529.18, 0.5);
});

test('CAS to TAS grows with altitude and heat', () => {
  near(c.tasFromCas(120, 8000, -5), 134.3, 0.5);
  near(c.tasFromCas(120, 0, 15), 120, 0.3);
});

test('wind triangle: 30 kt crosswind from 270 on a 360 track', () => {
  const r = c.windTriangle(360, 120, 270, 30);
  near(r.wca, -14.477, 0.01);
  near(r.trueHeading, 345.52, 0.02);
  near(r.groundSpeed, 116.19, 0.05);
  near(r.crosswind, -30, 0.01);
});

test('wind triangle: pure headwind and tailwind', () => {
  near(c.windTriangle(0, 100, 0, 20).groundSpeed, 80, 0.01);
  near(c.windTriangle(0, 100, 180, 20).groundSpeed, 120, 0.01);
  assert.equal(c.windTriangle(0, 10, 0, 30), null); // wind > TAS is unsolvable
});

test('crosswind components carry a side', () => {
  const r = c.windComponents(360, 30, 20);
  near(r.headwind, 17.32, 0.02);
  near(r.crosswind, 10, 0.01);
  assert.equal(r.crosswindSide, 'right');
  const l = c.windComponents(360, 330, 20);
  assert.equal(l.crosswindSide, 'left');
  near(c.withGusts(r, 30).gustFactor, 12.679, 0.01);
});

test('climb gradient conversions agree both ways', () => {
  near(c.gradientPctToFtPerNm(3), 182.28, 0.02);
  near(c.gradientFtPerNmToPct(182.28), 3, 0.01);
  near(c.gradientRateFpm(182.28, 120), 364.56, 0.1);
});

test('top of descent: 8,000 ft at 318 ft/NM, 180 kt', () => {
  const r = c.topOfDescent(8000, 180, 318);
  near(r.distanceNm, 25.157, 0.01);
  near(r.timeMin, 8.386, 0.01);
  near(r.rateFpm, 954, 1);
  near(r.gradientPct, 5.233, 0.01);
});

test('descent angle and rate round-trip', () => {
  near(c.descentRateFromAngle(120, 3), 637, 2);
  near(c.descentAngleFromRate(120, 637), 3, 0.05);
});

test('leg time / fuel / endurance', () => {
  near(c.legTimeMin(120, 180), 40, 0.01);
  near(c.legFuelGal(120, 180, 10), 6.667, 0.01);
  near(c.enduranceMin(40, 10), 240, 0.01);
  near(c.reserveFuelGal(10, 45), 7.5, 0.01);
});

test('true/magnetic/compass course conversions', () => {
  assert.equal(c.trueToMagnetic(90, 10), 80);
  assert.equal(c.magneticToCompass(80, 5), 75);
  assert.equal(c.compassToMagnetic(75, 5), 80);
  assert.equal(c.trueToMagnetic(5, 10), 355); // wraps correctly
});

test('VOR radial intercept suggests a 45 degree cut', () => {
  const r = c.radialInterceptHeading(180, 210);
  assert.equal(r.interceptHeading, 255);
  assert.equal(r.side, 'right');
  assert.equal(r.turnDegrees, 30);
  const l = c.radialInterceptHeading(180, 150);
  assert.equal(l.interceptHeading, 105);
  assert.equal(l.side, 'left');
});

test('cloud base from temperature/dew point spread', () => {
  assert.equal(c.cloudBaseFt(25, 15), 4000);
  near(c.cloudBaseFt(77, 59, 'F'), 4000, 0.01);
  assert.ok(Number.isNaN(c.cloudBaseFt(10, 12)));
});

test('sunrise/sunset for 40N 75W on the June solstice (UTC)', () => {
  const r = c.sunTimes('2026-06-21', 40, -75);
  near(r.sunriseUTC, 9 * 60 + 31, 10);   // ~05:31 EDT
  near(r.sunsetUTC, 0 * 60 + 31, 10);    // ~00:31 UTC next day = 20:31 EDT
  assert.equal(c.sunTimes('2026-06-21', 78, 15).polar, 'day'); // polar day in Svalbard
});

test('weight and balance: C172-style load, cg and envelope', () => {
  const r = c.weightBalance([
    { label: 'Empty', weight: 1650, arm: 40.0 },
    { label: 'Fuel', weight: 300, arm: 48.0 },
    { label: 'Pilot', weight: 170, arm: 37.0 },
    { label: 'Baggage', weight: 30, arm: 95.0 },
  ], [
    { x: 35, y: 1500 }, { x: 47.3, y: 1500 }, { x: 47.3, y: 2550 }, { x: 35, y: 2550 },
  ], { maxWeight: 2550 });
  near(r.weight, 2150, 0.01);
  near(r.moment, 89540, 0.01);
  near(r.cg, 41.646, 0.01);
  assert.equal(r.inEnvelope, true);
  assert.equal(r.overWeight, false);
});

test('weight and balance rejects out-of-envelope cg', () => {
  const r = c.weightBalance([
    { weight: 500, arm: 30.0 }, { weight: 1500, arm: 55.0 },
  ], [{ x: 35, y: 1500 }, { x: 45, y: 1500 }, { x: 45, y: 2550 }, { x: 35, y: 2550 }], { maxWeight: 2550 });
  assert.equal(r.inEnvelope, false);
  assert.equal(r.overWeight, false);
});

test('POH corrections are applied only from caller-supplied factors', () => {
  const r = c.applyPohCorrections(1200, [
    { reason: 'pressure altitude', value: 2, perUnit: 120 },
    { reason: 'temperature', value: 10, perUnit: 15 },
  ]);
  near(r.value, 1200 + 240 + 150, 0.01);
  assert.equal(r.applied.length, 2);
});

test('unit conversions round-trip', () => {
  near(u.ktToMph(100), 115.078, 0.001);
  near(u.mphToKt(u.ktToMph(100)), 100, 0.001);
  near(u.inHgToHpa(29.92), 1013.21, 0.05);
  near(u.galToL(10), 37.854, 0.01);
  near(u.lbToKg(100), 45.359, 0.01);
});

