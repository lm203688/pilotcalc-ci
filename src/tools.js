// Tool registry: the single source of truth for the whole 1.0 UI.
// Each entry declares inputs and one pure run() over calc.js. No UI code per tool.
const c = require('./calc');
const { convert } = require('./units');

const n = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const f1 = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const whole = (v) => (Number.isFinite(v) ? Math.round(v).toString() : '—');

function row(label, value, unit) { return { label, value, unit }; }

const TOOLS = [
  {
    id: 'wind_triangle', group: 'plan', title: 'Wind triangle', tag: 'Heading & groundspeed',
    formula: 'F-08 / F-09',
    fields: [
      { k: 'tc', label: 'True course', unit: '°', def: '090' },
      { k: 'tas', label: 'True airspeed', unit: 'kt', def: '120' },
      { k: 'wd', label: 'Wind from', unit: '°', def: '270' },
      { k: 'ws', label: 'Wind speed', unit: 'kt', def: '20' },
    ],
    run: (v) => {
      const r = c.windTriangle(n(v.tc), n(v.tas), n(v.wd), n(v.ws));
      if (!r) return null;
      const side = r.crosswind >= 0 ? 'right' : 'left';
      const hw = r.headwind >= 0 ? 'headwind' : 'tailwind';
      return {
        primary: { label: 'True heading', value: whole(r.trueHeading), unit: '°' },
        rows: [
          row('Groundspeed', whole(r.groundSpeed), 'kt'),
          row('Wind correction', `${f1(r.wca)}°`, side),
          row(Math.abs(r.headwind).toFixed(0) + ' kt', hw === 'headwind' ? 'headwind' : 'tailwind'),
          row('Crosswind', Math.abs(r.crosswind).toFixed(0), `kt ${side}`),
        ],
        note: 'Wind from a direction, not "toward". Right correction is positive.',
      };
    },
  },
  {
    id: 'crosswind', group: 'plan', title: 'Crosswind & gusts', tag: 'Takeoff / landing',
    formula: 'F-10',
    fields: [
      { k: 'rwy', label: 'Runway heading', unit: '°', def: '270' },
      { k: 'wd', label: 'Wind from', unit: '°', def: '300' },
      { k: 'ws', label: 'Wind speed', unit: 'kt', def: '15' },
      { k: 'gust', label: 'Gust (optional)', unit: 'kt', def: '' },
    ],
    run: (v) => {
      const r = c.windComponents(n(v.rwy), n(v.wd), n(v.ws));
      if (!r) return null;
      const g = Number.isFinite(n(v.gust)) && n(v.gust) > 0 ? c.withGusts(r, n(v.gust)) : null;
      const hwText = `${Math.abs(r.headwind).toFixed(0)} kt ${r.headwind >= 0 ? 'headwind' : 'tailwind'}`;
      return {
        primary: { label: `Crosswind ${r.crosswindSide}`, value: f1(Math.abs(r.crosswind), 1), unit: 'kt' },
        rows: [
          row('Head/tail', hwText),
          g ? row('Gust crosswind', f1(Math.abs(g.gustFactor), 1), `kt ${g.crosswindSide}`) : row('Gust', 'add gust for margin'),
        ],
        note: 'Compare against your POH crosswind limit, not the steady value alone.',
      };
    },
  },
  {
    id: 'density_alt', group: 'plan', title: 'Density altitude', tag: 'Performance',
    formula: 'F-01 / F-03',
    fields: [
      { k: 'field', label: 'Field elevation', unit: 'ft', def: '0' },
      { k: 'alt', label: 'Altimeter', unit: 'inHg', def: '29.92' },
      { k: 'oat', label: 'OAT', unit: '°C', def: '30' },
    ],
    run: (v) => {
      const pa = c.pressureAltitude(n(v.field), n(v.alt));
      const da = c.densityAltitude(pa, n(v.oat));
      if (!Number.isFinite(pa) || !Number.isFinite(da)) return null;
      return {
        primary: { label: 'Density altitude', value: whole(da), unit: 'ft' },
        rows: [row('Pressure altitude', whole(pa), 'ft'), row('ISA temperature', f1(c.isaTempC(pa)), '°C')],
        note: 'Approximation (+118.8 ft per °C above ISA). Check your POH chart for the official number.',
        warn: da > 8000 ? 'Above 8,000 ft: lean for density altitude and expect longer takeoff rolls.' : null,
      };
    },
  },
  {
    id: 'pressure_alt', group: 'plan', title: 'Pressure altitude', tag: 'Altitude',
    formula: 'F-01',
    fields: [
      { k: 'ind', label: 'Indicated altitude', unit: 'ft', def: '5000' },
      { k: 'alt', label: 'Altimeter', unit: 'inHg', def: '30.12' },
    ],
    run: (v) => {
      const pa = c.pressureAltitude(n(v.ind), n(v.alt));
      if (!Number.isFinite(pa)) return null;
      return {
        primary: { label: 'Pressure altitude', value: whole(pa), unit: 'ft' },
        rows: [row('Altimeter setting', n(v.alt).toFixed(2), 'inHg')],
        note: '1,000 ft per 1 inHg from 29.92.',
      };
    },
  },
  {
    id: 'true_alt', group: 'plan', title: 'True altitude', tag: 'Cold weather',
    formula: 'F-04',
    fields: [
      { k: 'ind', label: 'Indicated altitude', unit: 'ft', def: '5000' },
      { k: 'pa', label: 'Pressure altitude', unit: 'ft', def: '5000' },
      { k: 'oat', label: 'OAT', unit: '°C', def: '-10' },
    ],
    run: (v) => {
      const ta = c.trueAltitude(n(v.ind), n(v.oat), n(v.pa));
      if (!Number.isFinite(ta)) return null;
      return {
        primary: { label: 'True altitude', value: whole(ta), unit: 'ft' },
        rows: [row('ISA at that level', f1(c.isaTempC(n(v.pa))), '°C')],
        note: 'Colder than ISA means you are lower than the altimeter says.',
        warn: ta < n(v.ind) - 200 ? 'Significant cold-weather correction: terrain clearance is less than indicated.' : null,
      };
    },
  },
  {
    id: 'cas_tas', group: 'plan', title: 'CAS → TAS', tag: 'Airspeed',
    formula: 'F-07',
    fields: [
      { k: 'cas', label: 'Calibrated airspeed', unit: 'kt', def: '110' },
      { k: 'pa', label: 'Pressure altitude', unit: 'ft', def: '8000' },
      { k: 'oat', label: 'OAT', unit: '°C', def: '10' },
    ],
    run: (v) => {
      const tas = c.tasFromCas(n(v.cas), n(v.pa), n(v.oat));
      if (!Number.isFinite(tas)) return null;
      return {
        primary: { label: 'True airspeed', value: whole(tas), unit: 'kt' },
        rows: [row('Density ratio', f1(c.standardAtmosphere(n(v.pa)).densityRatio, 3))],
        note: 'Low-subsonic approximation; no compressibility correction.',
      };
    },
  },
  {
    id: 'mach', group: 'plan', title: 'TAS ↔ Mach', tag: 'High altitude',
    formula: 'F-06',
    fields: [
      { k: 'mode', label: 'Solve for', type: 'select', options: ['TAS from Mach', 'Mach from TAS'], def: 'TAS from Mach' },
      { k: 'v', label: 'Value', unit: 'Mach or kt', def: '0.78' },
      { k: 'oat', label: 'OAT', unit: '°C', def: '-35' },
    ],
    run: (v) => {
      const isMach = v.mode === 'TAS from Mach';
      const out = isMach ? c.tasFromMach(n(v.v), n(v.oat)) : c.machFromTas(n(v.v), n(v.oat));
      if (!Number.isFinite(out)) return null;
      return {
        primary: isMach
          ? { label: 'True airspeed', value: whole(out), unit: 'kt' }
          : { label: 'Mach', value: out.toFixed(3), unit: 'M' },
        rows: [row('Speed of sound', whole(c.speedOfSoundKt(n(v.oat))), 'kt'), row('OAT', n(v.oat).toFixed(0), '°C')],
        note: 'Sound speed depends only on temperature.',
      };
    },
  },
  {
    id: 'tod', group: 'plan', title: 'Top of descent', tag: 'Descent planning',
    formula: 'F-14',
    fields: [
      { k: 'alt', label: 'Altitude to lose', unit: 'ft', def: '9000' },
      { k: 'gs', label: 'Groundspeed', unit: 'kt', def: '120' },
      { k: 'grad', label: 'Descent gradient', unit: 'ft/NM', def: '318' },
    ],
    run: (v) => {
      const g = Number.isFinite(n(v.grad)) && n(v.grad) > 0 ? n(v.grad) : 318;
      const r = c.topOfDescent(n(v.alt), n(v.gs), g);
      if (!r) return null;
      return {
        primary: { label: 'Start descent', value: f1(r.distanceNm), unit: 'NM out' },
        rows: [
          row('Descent rate', whole(r.rateFpm), 'fpm'),
          row('Time', whole(r.timeMin), 'min'),
          row('Gradient', f1(r.gradientPct), '%'),
        ],
        note: '318 ft/NM is the 3:1 rule, slightly conservative vs a 3° glidepath.',
      };
    },
  },
  {
    id: 'descent', group: 'plan', title: 'Descent rate ↔ angle', tag: 'Stabilized approach',
    formula: 'F-13',
    fields: [
      { k: 'mode', label: 'Solve for', type: 'select', options: ['Rate from angle', 'Angle from rate'], def: 'Rate from angle' },
      { k: 'gs', label: 'Groundspeed', unit: 'kt', def: '120' },
      { k: 'v', label: 'Angle (°) or rate (fpm)', def: '3' },
    ],
    run: (v) => {
      const rate = v.mode === 'Rate from angle';
      const out = rate ? c.descentRateFromAngle(n(v.gs), n(v.v)) : c.descentAngleFromRate(n(v.gs), n(v.v));
      if (!Number.isFinite(out)) return null;
      return {
        primary: rate ? { label: 'Descent rate', value: whole(out), unit: 'fpm' } : { label: 'Descent angle', value: f1(out, 2), unit: '°' },
        rows: [row('Groundspeed', whole(n(v.gs)), 'kt')],
        note: '3° at 120 kt is about 637 fpm.',
      };
    },
  },
  {
    id: 'gradient', group: 'plan', title: 'Climb gradient', tag: 'Obstacle departure',
    formula: 'F-12',
    fields: [
      { k: 'mode', label: 'Convert', type: 'select', options: ['% → ft/NM', 'ft/NM → %'], def: '% → ft/NM' },
      { k: 'v', label: 'Value', def: '5' },
      { k: 'gs', label: 'Groundspeed (optional)', unit: 'kt', def: '90' },
    ],
    run: (v) => {
      const toFt = v.mode === '% → ft/NM';
      const out = toFt ? c.gradientPctToFtPerNm(n(v.v)) : c.gradientFtPerNmToPct(n(v.v));
      if (!Number.isFinite(out)) return null;
      const fpm = toFt && Number.isFinite(n(v.gs)) ? c.gradientRateFpm(out, n(v.gs)) : null;
      return {
        primary: toFt ? { label: 'Gradient', value: whole(out), unit: 'ft/NM' } : { label: 'Gradient', value: f1(out, 2), unit: '%' },
        rows: fpm ? [row('Required climb rate', whole(fpm), 'fpm')] : [],
        note: '1 NM = 6,076.12 ft.',
      };
    },
  },
  {
    id: 'leg', group: 'nav', title: 'Leg time & fuel', tag: 'Flight planning',
    formula: 'F-15',
    fields: [
      { k: 'dist', label: 'Distance', unit: 'NM', def: '120' },
      { k: 'gs', label: 'Groundspeed', unit: 'kt', def: '115' },
      { k: 'gph', label: 'Fuel burn', unit: 'gal/h', def: '9.5' },
      { k: 'res', label: 'Reserve', unit: 'min', def: '45' },
    ],
    run: (v) => {
      const t = c.legTimeMin(n(v.dist), n(v.gs));
      if (!Number.isFinite(t)) return null;
      const fuel = c.legFuelGal(n(v.dist), n(v.gs), n(v.gph));
      const reserve = c.reserveFuelGal(n(v.gph), n(v.res));
      return {
        primary: { label: 'Leg time', value: whole(t), unit: 'min' },
        rows: [
          row('Fuel for leg', f1(fuel, 2), 'gal'),
          row('Reserve', f1(reserve, 2), 'gal'),
          row('Fuel to plan', f1(fuel + reserve, 2), 'gal'),
        ],
        note: 'Add taxi, climb and alternate per your own procedure.',
      };
    },
  },
  {
    id: 'endurance', group: 'nav', title: 'Endurance', tag: 'Fuel available',
    formula: 'F-15',
    fields: [
      { k: 'fuel', label: 'Usable fuel', unit: 'gal', def: '38' },
      { k: 'gph', label: 'Fuel burn', unit: 'gal/h', def: '9.5' },
      { k: 'gs', label: 'Groundspeed', unit: 'kt', def: '115' },
    ],
    run: (v) => {
      const mins = c.enduranceMin(n(v.fuel), n(v.gph));
      if (!Number.isFinite(mins)) return null;
      return {
        primary: { label: 'Endurance', value: whole(mins), unit: 'min' },
        rows: [
          row('Still-air range', whole((mins / 60) * n(v.gs)), 'NM'),
          row('Hours', f1(mins / 60, 2), 'h'),
        ],
        note: 'Zero reserve. Subtract your legal reserve before planning.',
      };
    },
  },
  {
    id: 'heading', group: 'nav', title: 'True ↔ magnetic ↔ compass', tag: 'Heading conversion',
    formula: 'F-11',
    fields: [
      { k: 'tc', label: 'True course', unit: '°', def: '090' },
      { k: 'var', label: 'Variation (east +)', unit: '°', def: '12' },
      { k: 'dev', label: 'Deviation (east +)', unit: '°', def: '2' },
    ],
    run: (v) => {
      const mh = c.trueToMagnetic(n(v.tc), n(v.var));
      const ch = c.magneticToCompass(mh, n(v.dev));
      if (!Number.isFinite(mh) || !Number.isFinite(ch)) return null;
      return {
        primary: { label: 'Compass heading', value: whole(ch), unit: '°' },
        rows: [row('Magnetic', whole(mh), '°'), row('True', whole(c.norm360(n(v.tc))), '°')],
        note: 'East is least: subtract east variation from true to get magnetic.',
      };
    },
  },
  {
    id: 'vor', group: 'nav', title: 'VOR radial intercept', tag: '45° method',
    formula: 'F-11',
    fields: [
      { k: 'cur', label: 'Current radial from station', unit: '°', def: '090' },
      { k: 'want', label: 'Desired radial', unit: '°', def: '120' },
    ],
    run: (v) => {
      const r = c.radialInterceptHeading(n(v.cur), n(v.want));
      if (!r) return null;
      return {
        primary: { label: 'Intercept heading', value: whole(r.interceptHeading), unit: '°' },
        rows: [
          row('Turn', whole(r.turnDegrees), `° ${r.side}`),
          row('Then track', whole(c.norm360(n(v.want) + 180)), '° inbound'),
        ],
        note: '45° cut. Confirm station passage and turn inbound on the desired radial.',
      };
    },
  },
  {
    id: 'cloud_base', group: 'wx', title: 'Cloud base', tag: 'Temperature / dewpoint',
    formula: 'F-16',
    fields: [
      { k: 't', label: 'Temperature', unit: '°C', def: '22' },
      { k: 'td', label: 'Dew point', unit: '°C', def: '10' },
      { k: 'field', label: 'Field elevation (optional)', unit: 'ft', def: '' },
    ],
    run: (v) => {
      const base = c.cloudBaseFt(n(v.t), n(v.td), 'C');
      if (!Number.isFinite(base)) return null;
      const agl = base;
      const msl = Number.isFinite(n(v.field)) ? base + n(v.field) : null;
      return {
        primary: { label: 'Cloud base AGL', value: whole(agl), unit: 'ft' },
        rows: msl !== null ? [row('MSL', whole(msl), 'ft')] : [],
        note: 'Rule of thumb: 400 ft per °C spread. Not a substitute for a METAR/TAF.',
      };
    },
  },
  {
    id: 'sun', group: 'wx', title: 'Sunrise & sunset', tag: 'Daylight / night currency',
    formula: 'F-17',
    fields: [
      { k: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', def: '2026-11-22' },
      { k: 'lat', label: 'Latitude (+N)', def: '37.62' },
      { k: 'lon', label: 'Longitude (+E)', def: '-122.38' },
    ],
    run: (v) => {
      const t = c.sunTimes(v.date, n(v.lat), n(v.lon));
      if (!t) return null;
      const fmt = (m) => {
        if (m === null || m === undefined || !Number.isFinite(m)) return '—';
        const total = ((Math.round(m) % 1440) + 1440) % 1440;
        return `${String(Math.floor(total / 60)).padStart(2, '0')}${String(total % 60).padStart(2, '0')}Z`;
      };
      return {
        primary: { label: 'Sunset', value: fmt(t.sunsetUTC), unit: 'UTC' },
        rows: [row('Sunrise', fmt(t.sunriseUTC), 'UTC'), row('Solar noon', fmt(t.solarNoonUTC), 'UTC')],
        note: 'Times are UTC. Convert to local, and add your own personal night definition.',
      };
    },
  },
  {
    id: 'wb', group: 'perf', title: 'Weight & balance', tag: 'Loading',
    formula: 'F-18',
    fields: [
      { k: 'empty', label: 'Empty weight', unit: 'lb', def: '1650' },
      { k: 'emptyArm', label: 'Empty arm', unit: 'in', def: '40.0' },
      { k: 'front', label: 'Front seats', unit: 'lb', def: '340' },
      { k: 'frontArm', label: 'Front arm', unit: 'in', def: '37.0' },
      { k: 'fuel', label: 'Fuel', unit: 'gal', def: '40' },
      { k: 'fuelArm', label: 'Fuel arm', unit: 'in', def: '48.0' },
      { k: 'bag', label: 'Baggage', unit: 'lb', def: '30' },
      { k: 'bagArm', label: 'Baggage arm', unit: 'in', def: '95.0' },
      { k: 'max', label: 'Max gross', unit: 'lb', def: '2550' },
      { k: 'minCg', label: 'CG limit fwd', unit: 'in', def: '35.0' },
      { k: 'maxCg', label: 'CG limit aft', unit: 'in', def: '47.3' },
    ],
    run: (v) => {
      const fuelLb = n(v.fuel) * 6; // 100LL at 6 lb/gal
      const items = [
        { weight: n(v.empty), arm: n(v.emptyArm) },
        { weight: n(v.front), arm: n(v.frontArm) },
        { weight: fuelLb, arm: n(v.fuelArm) },
        { weight: n(v.bag), arm: n(v.bagArm) },
      ];
      const envelope = [
        { x: n(v.minCg), y: 1500 }, { x: n(v.maxCg), y: 1500 },
        { x: n(v.maxCg), y: n(v.max) }, { x: n(v.minCg), y: n(v.max) },
      ];
      const r = c.weightBalance(items, envelope, { maxWeight: n(v.max) });
      if (!r) return null;
      return {
        primary: { label: 'CG', value: f1(r.cg, 2), unit: 'in aft of datum' },
        rows: [
          row('Gross weight', whole(r.weight), 'lb'),
          row('Total moment', whole(r.moment), 'lb·in'),
          row('Fuel weight', whole(fuelLb), 'lb'),
          row('Envelope', r.inEnvelope === null ? 'no limits entered' : r.inEnvelope ? 'inside' : 'OUTSIDE'),
        ],
        note: 'Box envelope from the four limits you entered. Always check the real POH envelope.',
        warn: r.overWeight ? 'Over max gross weight.' : r.inEnvelope === false ? 'CG outside the box you entered.' : null,
      };
    },
  },
  {
    id: 'poh', group: 'perf', title: 'POH correction', tag: 'Apply your chart factors',
    formula: 'F-19',
    fields: [
      { k: 'base', label: 'Chart value (standard day)', def: '1200' },
      { k: 'c1', label: 'Correction per unit', def: '-0.02' },
      { k: 'q1', label: 'Condition value (e.g. ft above 2,000)', def: '2000' },
      { k: 'c2', label: 'Correction #2 per unit', def: '0.10' },
      { k: 'q2', label: 'Condition #2 (e.g. °C above ISA)', def: '10' },
    ],
    run: (v) => {
      const r = c.applyPohCorrections(n(v.base), [
        { reason: 'factor 1', perUnit: n(v.c1), value: n(v.q1) },
        { reason: 'factor 2', perUnit: n(v.c2), value: n(v.q2) },
      ].filter((x) => Number.isFinite(x.perUnit) && Number.isFinite(x.value)));
      if (!r) return null;
      return {
        primary: { label: 'Corrected value', value: f1(r.value, 1), unit: '' },
        rows: r.applied.map((a) => row(a.reason, `${a.delta >= 0 ? '+' : ''}${f1(a.delta, 2)}`)),
        note: 'Only your POH numbers go in. This app has no aircraft tables.',
      };
    },
  },
  {
    id: 'isa', group: 'tools', title: 'Standard atmosphere', tag: 'Reference',
    formula: 'F-02 / F-05',
    fields: [{ k: 'alt', label: 'Altitude', unit: 'ft', def: '10000' }],
    run: (v) => {
      const a = c.standardAtmosphere(n(v.alt));
      if (!a) return null;
      return {
        primary: { label: 'ISA temperature', value: f1(c.isaTempC(n(v.alt)), 1), unit: '°C' },
        rows: [
          row('Pressure ratio δ', f1(a.pressureRatio, 4)),
          row('Density ratio σ', f1(a.densityRatio, 4)),
          row('Sound speed', whole(c.speedOfSoundKt(c.isaTempC(n(v.alt)))), 'kt'),
        ],
        note: 'Troposphere model to 36,089 ft.',
      };
    },
  },
  {
    id: 'convert', group: 'tools', title: 'Unit converter', tag: 'Speed / height / fuel',
    formula: '—',
    fields: [
      { k: 'kind', label: 'Quantity', type: 'select', def: 'Speed', options: ['Speed', 'Distance', 'Pressure', 'Weight', 'Volume', 'Temperature'] },
      { k: 'from', label: 'From', type: 'text', def: 'kt' },
      { k: 'to', label: 'To', type: 'text', def: 'mph' },
      { k: 'v', label: 'Value', def: '100' },
    ],
    run: (v) => {
      const out = convert(v.kind, v.from, v.to, n(v.v));
      if (!Number.isFinite(out)) return null;
      return {
        primary: { label: `${n(v.v)} ${v.from} =`, value: f1(out, out < 10 ? 3 : 2), unit: v.to },
        rows: [],
        note: 'Units: kt, mph, km/h, ft, m, NM, SM, km, inHg, hPa, lb, kg, gal, L, °C, °F.',
      };
    },
  },
];

const GROUPS = [
  { id: 'plan', title: 'Plan', sub: 'Heading, wind, altitude, descent' },
  { id: 'wx', title: 'Weather & light', sub: 'Cloud base, sun times' },
  { id: 'perf', title: 'Performance', sub: 'Weight, balance, POH factors' },
  { id: 'nav', title: 'Navigate', sub: 'Legs, fuel, headings, VOR' },
  { id: 'tools', title: 'Reference', sub: 'ISA, unit conversion' },
];

const byId = (id) => TOOLS.find((t) => t.id === id) || null;

module.exports = { TOOLS, GROUPS, byId };

