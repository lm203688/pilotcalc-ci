# PilotCalc

E6B flight computer, offline. 24 tools, one screen each, every result shows the formula it came from.

- **Platform**: iPhone only, en-US, iOS 17+
- **Price**: $7.99 one-time, no subscription, no account, no analytics
- **Availability**: 174 countries, China mainland excluded

## Run

```bash
npm install
npm start          # Expo dev server
```

## Test (no simulator needed)

```bash
npm test           # 34 assertions: calc 21 · feedback 8 · registry 5
```

The test suite is the gate: any formula change must change a test first.

## Layout

```
src/calc.js        pure flight math (ISA, wind triangle, TOD, W&B, sun times, …)
src/units.js       unit conversions, incl. convert() for the converter tool
src/tools.js       tool registry — inputs + run() per tool; the UI is generic
src/feedback.js    feedback bundle: ring buffer, schema, id, mailto/text
App.js             Home / Tool / Flight log / Settings / Feedback / Sources / Privacy
test/              golden tests for all of the above
```

Adding a tool = one entry in `src/tools.js`. No UI work.

## Build (CI)

`.github/workflows/release.yml` builds on a macOS runner with manual signing and uploads with
`altool`. Secrets: `PILOTCALC_CERT_P12`, `PILOTCALC_CERT_PASSWORD`, `PILOTCALC_PROFILE`,
`PILOTCALC_TEAM_ID`, `PILOTCALC_BUNDLE_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`.

## Safety

Advisory only, not for primary navigation. No aircraft tables are baked in: where a POH gives a
factor, you enter the factor. Holding-pattern entry is deliberately absent until a CFI reviews it.
