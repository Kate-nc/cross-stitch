# Audit harness

Playwright scripts used to produce the evidence in `reports/tracking-audit.md`. They are
throwaway investigation tools, not part of the test suite (`npm test` ignores them). Re-use
them to reproduce a finding before fixing it and to prove the fix afterwards.

## Setup

```bash
export AUDIT_WORK=/tmp/tracking-audit-work/        # fixtures, browser profiles, screenshots
mkdir -p $AUDIT_WORK/fx $AUDIT_WORK/shots $AUDIT_WORK/profiles
node serve.js 8000 &                                 # from the repo root
# Only if cdnjs is unreachable (the audit sandbox blocked it): serve React/pako locally.
mkdir -p $AUDIT_WORK/libs && (cd $AUDIT_WORK/libs && npm init -y && npm i react@18.2.0 react-dom@18.2.0 pako@2.1.0)
# Only if Playwright cannot find its browser (Playwright 1.59 wants a newer Chromium than some
# sandboxes ship):  export CHROMIUM_PATH=/path/to/chrome   (e.g. /opt/pw-browsers/chromium-1194/chrome-linux/chrome)
cd reports/tracking-audit/harness
node gen.js && node hist.js                          # writes small/large/special/history fixtures
```

`lib.js` intercepts cdnjs requests (serving the npm copies) and strips SRI hashes; `tk.js`
adds tracker helpers (`open`, `counts`, `clickCell`, `dragCells`, `shot`) and seeds a fixture
into IndexedDB through `ProjectStorage.save`.

## Scripts (finding they reproduce)

| Script | Reproduces |
|---|---|
| `e7.js`, `e8.js`, `e11.js`, `e12.js`, `e13.js` | TRACK-01: marks lost on reload or hard close; flush writes stale or pattern-less record |
| `e9b.js` | TRACK-03: two tabs |
| `ed1.js` | TRACK-12: pattern resized after tracking |
| `s1.js`, `s5.js` | STATS-01, 02, 04: hand-checkable history project |
| `c1.js` | STATS-05: midnight (fake clock, Europe/London) |
| `m2.js` | TRACK-07, 08: phone touch and target sizes |
| `p1.js` | Performance and Fit on the 300x300 fixture |
| `u1.js` | Dumps the More-panel tabs |

Expected hand-computed values for the history fixture are in section 2.4 of the audit.
Chromium only; scripts assume the tracker's first-run flags are pre-set by `tk.js` (`SKIP`).
Many scripts delete their profile first: `rm -rf $AUDIT_WORK/profiles/<name>`.

## Running the repo's e2e specs without the CDN

`E2E_LOCAL_CDN=1 npx playwright test -c <config> save-durability` serves React/pako from `node_modules`
(`tests/e2e/local-cdn.js`; no effect unless the variable is set). Specs that call `loadTrackerFixture` or
the save-durability spec use it automatically. Use a small config that points `launchOptions.executablePath`
at your Chromium if needed.
