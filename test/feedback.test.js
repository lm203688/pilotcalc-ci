// 闸门 7 自迭代闭环的自检：编号、诊断包字段、隐私边界、邮件正文。
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../src/feedback');

test('session carries version/build and starts empty', () => {
  const s = f.createSession({ version: '1.0.0', build: '1', device: 'iPhone17,2', os: 'iOS 27.1', locale: 'en-US' });
  assert.equal(s.locale, 'en-US');
  assert.deepEqual(s.actions, []);
});

test('action ring buffer keeps only the last 20 tool ids', () => {
  const s = f.createSession({});
  for (let i = 1; i <= 30; i++) f.recordAction(s, `tool_${i}`);
  assert.equal(s.actions.length, 20);
  assert.equal(s.actions[0], 'tool_11');
  assert.equal(s.actions[19], 'tool_30');
  f.recordAction(s, '');
  assert.equal(s.actions.length, 20);
});

test('bundle has fixed schema and no free-form payload beyond the note', () => {
  const s = f.createSession({ device: 'iPhone17,2', os: 'iOS 27.1' });
  f.recordAction(s, 'wind_triangle');
  f.recordAction(s, 'density_altitude');
  const b = f.buildBundle(s, { category: 'wrong_value', tool: 'density_altitude', note: 'Expected 7,300 ft.', errorCode: 'DA_RANGE' });
  assert.deepEqual(f.validateBundle(b), []);
  assert.equal(b.tool, 'density_altitude');
  assert.equal(b.error_code, 'DA_RANGE');
  assert.equal(b.last_actions.length, 2);
  assert.equal(b.category, 'wrong_value');
  // no input values, no photos, no coordinates
  assert.equal('inputs' in b, false);
  assert.equal('photos' in b, false);
  assert.equal('coords' in b, false);
});

test('unknown category falls back to other, note is capped', () => {
  const b = f.buildBundle(f.createSession({}), { category: 'whatever', note: 'x'.repeat(2000) });
  assert.equal(b.category, 'other');
  assert.equal(b.user_note.length, 1200);
});

test('ids increment per product prefix', () => {
  assert.equal(f.nextId([], 'PC'), 'PC-0001');
  assert.equal(f.nextId(['PC-0001', 'PC-0007'], 'PC'), 'PC-0008');
  assert.equal(f.nextId(['PF-0009'], 'PC'), 'PC-0001'); // different product prefix
});

test('text body is human readable and mentions privacy', () => {
  const b = f.buildBundle(f.createSession({}), { category: 'missing_tool', tool: 'holding_entry', note: 'Need holding entry.' });
  const t = f.toText({ ...b, id: 'PC-0003' });
  assert.match(t, /Feedback PC-0003/);
  assert.match(t, /Tool: holding_entry/);
  assert.match(t, /No inputs, photos or personal data/);
});

test('mailto encodes subject and body', () => {
  const b = f.buildBundle(f.createSession({}), { category: 'crash', tool: 'sun_times', note: 'Crash on launch of the tool.' });
  const url = f.toMailto(b, '463102527@qq.com');
  assert.ok(url.startsWith('mailto:463102527@qq.com?subject='));
  assert.ok(url.includes('%5BPilotCalc%5D'));
  assert.ok(url.includes('Crash%20on%20launch'));
});

test('validation rejects bad payloads', () => {
  assert.equal(f.validateBundle(null).length, 1);
  const bad = { app: 'PilotCalc', version: '1.0', build: '1', locale: 'en-US', category: 'x', created_at: 'now', last_actions: Array(25).fill('a') };
  const errs = f.validateBundle(bad);
  assert.ok(errs.length >= 2);
});
