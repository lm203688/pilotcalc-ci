import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView,
  Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOOLS, GROUPS, byId } from './src/tools';
import { convert, unitList } from './src/units';
import * as fb from './src/feedback';

const C = {
  bg: '#0E1216', card: '#161C22', cardEdge: '#232C34', text: '#F2F5F7', muted: '#8C99A6',
  accent: '#F5B841', accentInk: '#1A1407', good: '#5FD08A', bad: '#F07A6A',
};
const FEEDBACK_EMAIL = '463102527@qq.com';
const APP_ID = 'PilotCalc';
const DISCLAIMER = 'Advisory only. Not for primary navigation. Verify against your POH and approved sources.';

const LOG_KEY = 'pilotcalc.log.v1';
const DRAFT_KEY = 'pilotcalc.feedback.v1';

// ---------------------------------------------------------------- shared UI

function Header({ title, sub, onBack, right }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={s.backBtn}>
          <Text style={s.backTxt}>‹ Back</Text>
        </Pressable>
      ) : (
        <View style={s.brandDot} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={s.headerSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipTxt, active && s.chipTxtActive]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- home

function Home({ go }) {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <Header title="PilotCalc" sub="E6B flight computer · offline" />
      <Card style={s.hero}>
        <Text style={s.heroKicker}>24 tools. One screen each.</Text>
        <Text style={s.heroTxt}>
          Plan a leg, check performance, load the airplane. Every number shows the formula it came from.
        </Text>
      </Card>

      {GROUPS.map((g) => (
        <View key={g.id} style={{ marginTop: 22 }}>
          <Text style={s.groupTitle}>{g.title}</Text>
          <Text style={s.groupSub}>{g.sub}</Text>
          <Card style={{ marginTop: 10, padding: 0 }}>
            {TOOLS.filter((t) => t.group === g.id).map((t, i, arr) => (
              <Pressable
                key={t.id}
                onPress={() => go({ name: 'tool', id: t.id })}
                style={({ pressed }) => [s.row, i < arr.length - 1 && s.rowEdge, pressed && s.rowPressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t.title}</Text>
                  <Text style={s.rowTag}>{t.tag}</Text>
                </View>
                <Text style={s.chev}>›</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      <View style={s.bottomRow}>
        <Pressable onPress={() => go({ name: 'log' })} style={s.pillBtn}><Text style={s.pillTxt}>Flight log</Text></Pressable>
        <Pressable onPress={() => go({ name: 'settings' })} style={s.pillBtn}><Text style={s.pillTxt}>Settings</Text></Pressable>
      </View>
      <Text style={s.disclaimer}>{DISCLAIMER}</Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- tool

function Field({ field, value, onChange }) {
  if (field.type === 'select') {
    return (
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>{field.label}</Text>
        <View style={s.chipRow}>
          {field.options.map((o) => (
            <Chip key={o} label={o} active={value === o} onPress={() => onChange(o)} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{field.label}</Text>
      <View style={s.inputRow}>
        <TextInput
          value={String(value)}
          onChangeText={onChange}
          keyboardType={field.type === 'text' ? 'default' : 'numbers-and-punctuation'}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="—"
          placeholderTextColor={C.muted}
          style={s.input}
        />
        {field.unit ? <Text style={s.unit}>{field.unit}</Text> : null}
      </View>
    </View>
  );
}

function ToolScreen({ id, go, session }) {
  const tool = byId(id) || TOOLS[0];
  const [values, setValues] = useState(() => Object.fromEntries(tool.fields.map((f) => [f.k, f.def])));

  useEffect(() => {
    setValues(Object.fromEntries(tool.fields.map((f) => [f.k, f.def])));
    fb.recordAction(session, tool.id);
  }, [tool.id]);

  const result = useMemo(() => {
    try { return tool.run(values); } catch (e) { return null; }
  }, [values, tool]);

  const setField = (k, v) => {
    if (k === 'kind') {
      const units = unitList(v);
      setValues((p) => ({ ...p, kind: v, from: units[0], to: units[1] || units[0] }));
      return;
    }
    setValues((p) => ({ ...p, [k]: v }));
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Header title={tool.title} sub={tool.tag} onBack={() => go({ name: 'home' })} />
        <Card style={{ marginTop: 10 }}>
          {tool.fields.map((f) => (
            <Field key={f.k} field={f} value={values[f.k]} onChange={(v) => setField(f.k, v)} />
          ))}
        </Card>

        {result ? (
          <Card style={[s.resultCard, result.warn && s.resultWarn]}>
            <Text style={s.resultLabel}>{result.primary.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={s.resultValue}>{result.primary.value}</Text>
              {result.primary.unit ? <Text style={s.resultUnit}>{result.primary.unit}</Text> : null}
            </View>
            {result.rows.map((r) => (
              <View key={r.label} style={s.kv}>
                <Text style={s.kvKey}>{r.label}</Text>
                <Text style={s.kvVal}>
                  {r.value}{r.unit ? ` ${r.unit}` : ''}
                </Text>
              </View>
            ))}
            {result.warn ? <Text style={s.warnTxt}>{result.warn}</Text> : null}
            {result.note ? <Text style={s.note}>{result.note}</Text> : null}
          </Card>
        ) : (
          <Card style={s.resultCard}>
            <Text style={s.note}>Enter a value for each field. Nothing is sent anywhere.</Text>
          </Card>
        )}

        <View style={s.toolFootRow}>
          <Pressable style={s.pillBtn} onPress={() => setValues(Object.fromEntries(tool.fields.map((f) => [f.k, f.def])))}>
            <Text style={s.pillTxt}>Reset</Text>
          </Pressable>
          <Pressable style={s.pillBtn} onPress={() => go({ name: 'feedback', toolId: tool.id })}>
            <Text style={s.pillTxt}>Report a wrong number</Text>
          </Pressable>
        </View>

        <Text style={s.formula}>Formula {tool.formula} · see Sources</Text>
        <Text style={s.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------- flight log

function LogScreen({ go, log, setLog }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), route: '', dist: '', gs: '', fuel: '' });
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    setLog(next);
    try { await AsyncStorage.setItem(LOG_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const add = async () => {
    if (!form.route.trim()) { Alert.alert('Add a route', 'Use a short label such as KPAO–KMRY.'); return; }
    const dist = Number(form.dist);
    const gs = Number(form.gs);
    const entry = {
      id: String(Date.now()),
      date: form.date || new Date().toISOString().slice(0, 10),
      route: form.route.trim().toUpperCase(),
      dist: Number.isFinite(dist) ? dist : null,
      gs: Number.isFinite(gs) ? gs : null,
      time: Number.isFinite(dist) && Number.isFinite(gs) && gs > 0 ? (dist / gs) * 60 : null,
      fuel: Number.isFinite(Number(form.fuel)) && form.fuel !== '' ? Number(form.fuel) : null,
    };
    await save([entry, ...log].slice(0, 200));
    setForm({ ...form, route: '', dist: '', gs: '', fuel: '' });
  };

  const exportCsv = async () => {
    if (!log.length) { Alert.alert('Nothing to export', 'Add a leg first.'); return; }
    const head = 'date,route,distance_nm,groundspeed_kt,time_min,fuel_gal';
    const rows = log.map((e) => [e.date, e.route, e.dist ?? '', e.gs ?? '', e.time ? e.time.toFixed(1) : '', e.fuel ?? ''].join(','));
    setBusy(true);
    try {
      await Share.share({ message: [head, ...rows].join('\n'), title: 'PilotCalc flight log' });
    } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Header title="Flight log" sub={`${log.length} leg${log.length === 1 ? '' : 's'} on this device`} onBack={() => go({ name: 'home' })} />
      <Card style={{ marginTop: 10 }}>
        <Text style={s.fieldLabel}>Route</Text>
        <View style={s.inputRow}><TextInput value={form.route} onChangeText={(t) => setForm({ ...form, route: t })} placeholder="KPAO–KMRY" placeholderTextColor={C.muted} style={s.input} autoCapitalize="characters" /></View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Distance NM</Text>
            <View style={s.inputRow}><TextInput value={form.dist} onChangeText={(t) => setForm({ ...form, dist: t })} keyboardType="numbers-and-punctuation" style={s.input} /></View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>GS kt</Text>
            <View style={s.inputRow}><TextInput value={form.gs} onChangeText={(t) => setForm({ ...form, gs: t })} keyboardType="numbers-and-punctuation" style={s.input} /></View>
          </View>
        </View>
        <Pressable style={s.primaryBtn} onPress={add}><Text style={s.primaryTxt}>Add leg</Text></Pressable>
      </Card>

      {log.length ? (
        <Card style={{ marginTop: 14, padding: 0 }}>
          {log.map((e, i) => (
            <View key={e.id} style={[s.kv, { paddingHorizontal: 14, paddingVertical: 12 }, i < log.length - 1 && s.rowEdge]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{e.route}</Text>
                <Text style={s.rowTag}>{e.date}{e.dist ? ` · ${e.dist} NM` : ''}{e.gs ? ` · ${e.gs} kt` : ''}</Text>
              </View>
              <Text style={s.kvVal}>{e.time ? `${Math.round(e.time)} min` : '—'}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <Text style={[s.note, { marginTop: 16 }]}>No legs yet. Entries stay on this device; export sends text to wherever you choose.</Text>
      )}

      <View style={s.toolFootRow}>
        <Pressable style={s.pillBtn} onPress={exportCsv}><Text style={s.pillTxt}>{busy ? 'Preparing…' : 'Export CSV'}</Text></Pressable>
        {log.length ? <Pressable style={s.pillBtn} onPress={() => Alert.alert('Clear log', 'Delete all legs on this device?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => save([]) }])}><Text style={s.pillTxt}>Clear</Text></Pressable> : null}
      </View>
      <Text style={s.disclaimer}>Flight log is a personal record, not an official logbook.</Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- feedback

function FeedbackScreen({ go, session, toolId, drafts, setDrafts }) {
  const [category, setCategory] = useState(toolId ? 'wrong_value' : 'new_request');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(false);

  const bundle = useMemo(() => {
    const b = fb.buildBundle(session, { category, tool: toolId || null, note });
    return { ...b, id: fb.nextId(drafts.map((d) => d.id), 'PC') };
  }, [category, note, toolId, drafts, session]);

  const keepDraft = async () => {
    const next = [{ ...bundle }, ...drafts].slice(0, 50);
    setDrafts(next);
    try { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const send = async () => {
    await keepDraft();
    const url = fb.toMailto(bundle, FEEDBACK_EMAIL);
    const ok = await Linking.canOpenURL('mailto:' + FEEDBACK_EMAIL).catch(() => false);
    if (ok) { Linking.openURL(url).catch(() => Alert.alert('No mail app', 'Copy the report below instead.')); }
    else { Alert.alert('No mail app found', 'Use Copy report and send it from any device.'); }
  };

  const copy = async () => {
    await keepDraft();
    await Share.share({ message: fb.toText(bundle), title: `${bundle.id} PilotCalc feedback` });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Header title={toolId ? 'Report a wrong number' : 'Send feedback'} sub={`${bundle.id} · goes to the developer`} onBack={() => go(toolId ? { name: 'tool', id: toolId } : { name: 'settings' })} />
        <Card style={{ marginTop: 10 }}>
          <Text style={s.fieldLabel}>What kind</Text>
          <View style={s.chipRow}>
            {[['wrong_value', 'Wrong value'], ['crash', 'Crash'], ['missing_tool', 'Missing tool'], ['hard_to_use', 'Hard to use'], ['new_request', 'Idea'], ['other', 'Other']].map(([k, l]) => (
              <Chip key={k} label={l} active={category === k} onPress={() => setCategory(k)} />
            ))}
          </View>
          <Text style={[s.fieldLabel, { marginTop: 16 }]}>What happened</Text>
          <View style={[s.inputRow, { minHeight: 96, alignItems: 'flex-start' }]}>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={1200}
              placeholder="Numbers I entered, what I expected, what I got."
              placeholderTextColor={C.muted}
              style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
            />
          </View>
          <Text style={s.note}>Do not type personal details. Inputs are not attached automatically.</Text>
        </Card>

        <Pressable style={[s.pillBtn, { marginTop: 12 }]} onPress={() => setPreview((p) => !p)}>
          <Text style={s.pillTxt}>{preview ? 'Hide report' : 'Preview report'}</Text>
        </Pressable>
        {preview ? <Card style={{ marginTop: 10 }}><Text style={s.mono}>{fb.toText(bundle)}</Text></Card> : null}

        <Pressable style={[s.primaryBtn, { marginTop: 14 }]} onPress={send}><Text style={s.primaryTxt}>Send with mail</Text></Pressable>
        <Pressable style={[s.pillBtn, { marginTop: 10, alignSelf: 'stretch' }]} onPress={copy}><Text style={s.pillTxt}>Copy / share report</Text></Pressable>
        <Text style={s.disclaimer}>Nothing is uploaded from the app. Your mail client shows the full text before sending.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------- settings

function Settings({ go }) {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Header title="Settings" sub="No account, no sync, no analytics" onBack={() => go({ name: 'home' })} />
      <Card style={{ marginTop: 10, padding: 0 }}>
        {[
          ['Send feedback', 'Wrong numbers, crashes, anything confusing', () => go({ name: 'feedback' })],
          ['Request a tool', 'Tell us which calculation you need', () => go({ name: 'feedback' })],
          ['Sources & formulas', 'Where every number comes from', () => go({ name: 'sources' })],
          ['Privacy', 'What is stored and what is not', () => go({ name: 'privacy' })],
        ].map(([t, sub, onPress], i, arr) => (
          <Pressable key={t} onPress={onPress} style={[s.row, i < arr.length - 1 && s.rowEdge]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{t}</Text>
              <Text style={s.rowTag}>{sub}</Text>
            </View>
            <Text style={s.chev}>›</Text>
          </Pressable>
        ))}
      </Card>
      <Text style={[s.note, { marginTop: 18 }]}>PilotCalc 1.0.0 · 24 tools · iPhone · offline</Text>
      <Text style={s.disclaimer}>{DISCLAIMER}</Text>
    </ScrollView>
  );
}

function Sources({ go }) {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Header title="Sources & formulas" sub="Same rules the code is tested against" onBack={() => go({ name: 'settings' })} />
      <Card style={{ marginTop: 10 }}>
        {[
          ['F-01', 'Pressure altitude = indicated + (29.92 − altimeter) × 1,000'],
          ['F-03', 'Density altitude = PA + 118.8 × (OAT − ISA)'],
          ['F-04', 'True altitude = indicated + 4 × (PA/1,000) × (OAT − ISA)'],
          ['F-05', 'ISA pressure/density ratios from the 1976 standard atmosphere'],
          ['F-06', 'Speed of sound = 661.47 × √(T/288.15) kt'],
          ['F-08', 'WCA = asin((wind/TAS) × sin(wind dir − course))'],
          ['F-10', 'Crosswind = wind × sin(wind − runway); headwind = wind × cos(…)'],
          ['F-13', 'Descent rate = GS × 6,076 × tan(angle) / 60'],
          ['F-14', 'Top of descent = altitude to lose ÷ gradient (318 ft/NM default)'],
          ['F-16', 'Cloud base ≈ (T − Td) × 400 ft'],
          ['F-17', 'Sun times use the NOAA solar position algorithm'],
          ['F-18', 'CG = Σ(weight × arm) ÷ Σ(weight); point-in-polygon against your limits'],
        ].map(([k, v]) => (
          <View key={k} style={s.kv}>
            <Text style={s.kvKey}>{k}</Text>
            <Text style={[s.kvVal, { flex: 1, textAlign: 'left', marginLeft: 10 }]}>{v}</Text>
          </View>
        ))}
      </Card>
      <Text style={[s.note, { marginTop: 14 }]}>
        No aircraft tables are built in. Where a POH gives a factor, you enter the factor and the app applies it.
      </Text>
      <Text style={s.disclaimer}>{DISCLAIMER}</Text>
    </ScrollView>
  );
}

function Privacy({ go }) {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Header title="Privacy" sub="Short, because there is little to say" onBack={() => go({ name: 'settings' })} />
      <Card style={{ marginTop: 10 }}>
        <Text style={s.body}>
          PilotCalc has no account, no server, no analytics and no ads. Calculations run on the device.
          {'\n\n'}
          Stored on the device only: your flight log entries and feedback drafts, until you delete them.
          {'\n\n'}
          Feedback is sent by you, through your own mail app. The report contains app version, device model,
          iOS version, locale, the tool you were on, your last few tool names, and what you typed.
          It never contains the numbers you entered, photos, location or contacts.
          {'\n\n'}
          Questions or deletion requests: {FEEDBACK_EMAIL}
        </Text>
      </Card>
      <Text style={s.disclaimer}>{DISCLAIMER}</Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- root

export default function App() {
  const [route, setRoute] = useState({ name: 'home' });
  const [log, setLog] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [ready, setReady] = useState(false);
  const session = useRef(fb.createSession({ app: APP_ID, version: '1.0.0', build: '1', locale: 'en-US' })).current;

  const go = useCallback((r) => { setRoute({ ...r, k: Date.now() }); }, []);

  useEffect(() => {
    (async () => {
      try {
        const [l, d] = await Promise.all([AsyncStorage.getItem(LOG_KEY), AsyncStorage.getItem(DRAFT_KEY)]);
        if (l) setLog(JSON.parse(l));
        if (d) setDrafts(JSON.parse(d));
      } catch (e) {}
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const handle = (url) => {
      if (!url) return;
      const m = /pilotcalc:\/\/tool\/([a-z_]+)/.exec(url);
      if (m && byId(m[1])) go({ name: 'tool', id: m[1] });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [go]);

  // Scripted tour used only by the screenshot CI (EXPO_PUBLIC_SHOTS=1).
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_SHOTS !== '1') return;
    const plan = [
      [0, { name: 'home' }],
      [7, { name: 'tool', id: 'wind_triangle' }],
      [14, { name: 'tool', id: 'density_alt' }],
      [21, { name: 'tool', id: 'wb' }],
      [28, { name: 'log' }],
    ];
    const timers = plan.map(([sec, r]) => setTimeout(() => go(r), sec * 1000));
    return () => timers.forEach(clearTimeout);
  }, [go]);

  let screen = <Home go={go} />;
  if (route.name === 'tool') screen = <ToolScreen key={route.k} id={route.id} go={go} session={session} />;
  if (route.name === 'log') screen = <LogScreen go={go} log={log} setLog={setLog} />;
  if (route.name === 'settings') screen = <Settings go={go} />;
  if (route.name === 'feedback') screen = <FeedbackScreen go={go} session={session} toolId={route.toolId} drafts={drafts} setDrafts={setDrafts} />;
  if (route.name === 'sources') screen = <Sources go={go} />;
  if (route.name === 'privacy') screen = <Privacy go={go} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        {ready ? screen : <View style={[s.root, s.center]}><ActivityIndicator color={C.accent} /></View>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------------------------------------------------------------- styles

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingBottom: 12, gap: 10 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent, marginRight: 2 },
  headerTitle: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  backBtn: { paddingRight: 6 },
  backTxt: { color: C.accent, fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardEdge, padding: 14 },
  hero: { marginTop: 4, backgroundColor: '#141A1F' },
  heroKicker: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTxt: { color: C.text, fontSize: 16, lineHeight: 23, marginTop: 8 },
  groupTitle: { color: C.text, fontSize: 19, fontWeight: '700' },
  groupSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  rowEdge: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardEdge },
  rowPressed: { backgroundColor: '#1B232A' },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowTag: { color: C.muted, fontSize: 11.5, marginTop: 2 },
  chev: { color: C.muted, fontSize: 18, marginLeft: 8 },
  bottomRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  pillBtn: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardEdge, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  pillTxt: { color: C.text, fontSize: 13.5, fontWeight: '600' },
  toolFootRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { color: C.muted, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10151A', borderRadius: 10, borderWidth: 1, borderColor: C.cardEdge, paddingHorizontal: 12 },
  input: { flex: 1, color: C.text, fontSize: 17, paddingVertical: 10 },
  unit: { color: C.muted, fontSize: 12.5, marginLeft: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 9, borderWidth: 1, borderColor: C.cardEdge, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#10151A' },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { color: C.muted, fontSize: 12.5, fontWeight: '600' },
  chipTxtActive: { color: C.accentInk },
  resultCard: { marginTop: 16 },
  resultWarn: { borderColor: '#5A3A2A' },
  resultLabel: { color: C.muted, fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  resultValue: { color: C.accent, fontSize: 44, fontWeight: '700', letterSpacing: -1, marginTop: 2 },
  resultUnit: { color: C.accent, fontSize: 15, marginLeft: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  kvKey: { color: C.muted, fontSize: 13 },
  kvVal: { color: C.text, fontSize: 14, fontWeight: '600' },
  warnTxt: { color: C.bad, fontSize: 13, marginTop: 8, lineHeight: 18 },
  note: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 10, fontStyle: 'italic' },
  formula: { color: C.muted, fontSize: 11.5, marginTop: 14 },
  disclaimer: { color: '#6C7784', fontSize: 11, lineHeight: 15, marginTop: 18 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  primaryTxt: { color: C.accentInk, fontSize: 15, fontWeight: '700' },
  body: { color: C.text, fontSize: 14, lineHeight: 21 },
  mono: { color: C.text, fontSize: 11.5, lineHeight: 17, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
