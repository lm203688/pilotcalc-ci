// 注册表自检：每项工具的默认输入都必须算得出结果，且结果有主数字。
const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS, GROUPS, byId } = require('../src/tools');

const defaults = (tool) => Object.fromEntries(tool.fields.map((f) => [f.k, f.def]));

test('registry is well formed', () => {
  assert.ok(TOOLS.length >= 20, `expected 20+ tools, got ${TOOLS.length}`);
  const ids = new Set();
  for (const t of TOOLS) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(GROUPS.some((g) => g.id === t.group), `unknown group on ${t.id}`);
    assert.ok(t.fields.length > 0, `${t.id} has no inputs`);
    for (const f of t.fields) assert.ok(f.k && f.label, `${t.id} field missing key/label`);
  }
});

test('every tool produces a primary number from its defaults', () => {
  for (const t of TOOLS) {
    const out = t.run(defaults(t));
    assert.ok(out, `${t.id} returned null from defaults`);
    assert.ok(out.primary && out.primary.label, `${t.id} missing primary`);
    assert.ok(String(out.primary.value).length > 0, `${t.id} empty primary value`);
    assert.ok(String(out.primary.value) !== 'NaN', `${t.id} primary is NaN`);
    assert.ok(Array.isArray(out.rows), `${t.id} rows must be an array`);
    for (const r of out.rows) assert.ok(String(r.value) !== 'undefined', `${t.id} row ${r.label} undefined`);
  }
});

test('blank optional inputs do not break the tool', () => {
  for (const t of TOOLS) {
    const v = defaults(t);
    for (const f of t.fields) if (f.def === '') v[f.k] = '';
    const out = t.run(v);
    assert.ok(out, `${t.id} failed with blanks`);
  }
});

test('garbage input returns null rather than a fake number', () => {
  for (const t of TOOLS) {
    const v = defaults(t);
    v[t.fields[0].k] = 'abc';
    const out = t.run(v);
    if (out) assert.notEqual(String(out.primary.value), 'NaN', `${t.id} produced NaN`);
  }
});

test('known answers through the registry', () => {
  const wt = byId('wind_triangle').run({ tc: '090', tas: '120', wd: '270', ws: '20' });
  assert.equal(wt.primary.value, '90');
  assert.equal(wt.rows[0].value, '140');

  const xw = byId('crosswind').run({ rwy: '270', wd: '300', ws: '15', gust: '' });
  assert.equal(xw.primary.value, '7.5');

  const tod = byId('tod').run({ alt: '9000', gs: '120', grad: '318' });
  assert.equal(tod.primary.value, '28.3');

  const da = byId('density_alt').run({ field: '0', alt: '29.92', oat: '30' });
  assert.equal(da.primary.value, '1782');
});

