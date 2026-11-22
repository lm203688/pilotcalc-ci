// Feedback loop primitives (闸门 7). Pure functions, no network, no storage.
// Nothing here uploads anything: the app builds a bundle, shows it to the user,
// and hands it to their own mail client / share sheet.
const MAX_ACTIONS = 20;
const CATEGORIES = ['wrong_value', 'crash', 'missing_tool', 'hard_to_use', 'new_request', 'other'];

function createSession(meta = {}) {
  return {
    app: meta.app || 'PilotCalc',
    version: meta.version || '1.0.0',
    build: meta.build || '1',
    device: meta.device || '',
    os: meta.os || '',
    locale: meta.locale || 'en-US',
    startedAt: new Date().toISOString(),
    actions: [],
    errorCode: null,
  };
}

// Ring buffer of tool ids only — never inputs, never free text, never photos.
function recordAction(session, toolId) {
  if (!session || typeof toolId !== 'string' || !toolId) return session;
  session.actions.push(toolId);
  if (session.actions.length > MAX_ACTIONS) session.actions.shift();
  return session;
}

function buildBundle(session, input = {}) {
  if (!session) throw new Error('session required');
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  return {
    app: session.app,
    version: session.version,
    build: session.build,
    device: session.device,
    os: session.os,
    locale: session.locale,
    tool: typeof input.tool === 'string' ? input.tool : null,
    last_actions: session.actions.slice(-MAX_ACTIONS),
    error_code: input.errorCode || session.errorCode || null,
    category,
    user_note: typeof input.note === 'string' ? input.note.slice(0, 1200) : '',
    created_at: new Date().toISOString(),
  };
}

function nextId(existing = [], prefix = 'PC') {
  let max = 0;
  for (const id of existing) {
    const m = /^([A-Z]+)-(\d{4})$/.exec(String(id));
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function validateBundle(b) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['bundle must be an object'];
  for (const k of ['app', 'version', 'build', 'locale', 'category', 'created_at']) {
    if (!b[k]) errors.push(`missing ${k}`);
  }
  if (!CATEGORIES.includes(b.category)) errors.push('unknown category');
  if (Array.isArray(b.last_actions)) {
    if (b.last_actions.length > MAX_ACTIONS) errors.push('too many actions');
    if (b.last_actions.some((a) => typeof a !== 'string')) errors.push('actions must be ids');
  } else errors.push('last_actions must be an array');
  if (typeof b.user_note === 'string' && b.user_note.length > 1200) errors.push('note too long');
  return errors;
}

// Plain-text body: readable in any mail client, and editable by the user before sending.
function toText(b) {
  return [
    `Feedback ${b.id || ''}`.trim(),
    `App: ${b.app} ${b.version} (build ${b.build})`,
    `Device: ${b.device} | OS: ${b.os} | Locale: ${b.locale}`,
    `Category: ${b.category}`,
    `Tool: ${b.tool || 'n/a'}`,
    `Error code: ${b.error_code || 'n/a'}`,
    `Recent tools: ${(b.last_actions || []).join(' > ') || 'n/a'}`,
    '',
    'What happened:',
    b.user_note || '(describe what you expected and what you saw)',
    '',
    '— No inputs, photos or personal data are included. You can edit this before sending.',
  ].join('\n');
}

function toMailto(b, address, tag = 'PilotCalc') {
  const subject = `[${tag}] ${b.category} · ${b.tool || 'general'} · ${b.version}`;
  const body = toText(b);
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

module.exports = {
  MAX_ACTIONS, CATEGORIES,
  createSession, recordAction, buildBundle, nextId, validateBundle, toText, toMailto,
};
