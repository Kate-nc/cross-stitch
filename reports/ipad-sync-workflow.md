# iPad sync — diagnosis and first pass

**Date:** 2026-08-30 · **Branch:** `feat/ipad-sync-workflow`
**Scope:** why folder sync cannot work on iPad, what was broken on top of that,
and what changed. Companion to [mobile-experience-audit.md](mobile-experience-audit.md).

---

## The premise, confirmed

Every browser on iOS and iPadOS is WebKit. Chrome, Edge and Firefox there are
Safari with a different badge, and they inherit Safari's limits exactly. This is
now verified in the harness rather than assumed: the `ipad-webkit` Playwright
project runs real WebKit at an iPad viewport, and
[tests/ipad/ipad-sync.spec.js](../tests/ipad/ipad-sync.spec.js) asserts
`typeof window.showDirectoryPicker === 'undefined'` on the engine itself.

Folder-watch sync rests on exactly one feature check
([sync-engine.js](../sync-engine.js), `hasFolderWatchSupport`):

```js
return typeof window.showDirectoryPicker === "function";
```

WebKit has never shipped the File System Access API, so on iPad that is `false`
and everything downstream is unreachable: folder connect, the polling watcher,
auto-export on save, auto-import, and the 6-digit pairing flow.

**The merge engine itself is unaffected.** `exportSync` → `compress` →
`prepareImport` → `classifyProjects` → `executeImport` are pure JS over
IndexedDB. Fingerprint reconciliation, canonical-id rewriting and the union
merges of `done` arrays and sessions all work identically on iPad. Only the
transport is missing, and a manual file path around it already existed.

---

## Three bugs sitting on top of that

### 1. The import file picker could select nothing on iPad

`UnifiedSyncImportModal` set `accept: '.csync'`. iOS resolves `accept` to UTIs,
and `.csync` is registered by no app on the system, so the filter matched
nothing and the Files picker greyed out every file. The same class of bug
affected `.oxs` on every pattern-open picker.

This is the most likely reason sync "did not work" on iPad rather than merely
being fiddly — the user could not get as far as choosing a file.

### 2. The eviction warning excluded exactly the browsers that needed it

[helpers.js](../helpers.js) gated its storage-eviction warning on:

```js
var isSafariFamily = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgA/.test(ua);
```

That is the desktop assumption — Chrome means Blink, Firefox means Gecko. On
iOS they are WebKit, carry the identical ~7-day eviction of script-writable
storage, and were skipped. A user in Chrome on iPad got no warning at all and
could lose their whole library.

### 3. Dead controls with unfollowable advice

"Enter pairing code" was permanently disabled with the explanation *"Folder
watching needs a Chromium-based browser (Chrome, Edge, Brave, Opera)"*, and the
header sync popover said *"Set one up on the Home page"*. On an iPad neither
instruction can be carried out — installing Chrome changes nothing, and
/home.html no longer has such a control.

---

## What changed

| # | Change | Files |
| --- | --- | --- |
| 1 | `Platform` capability module — iOS/WebKit detection, `fileAccept`, `shareOrDownload` | [helpers.js](../helpers.js) |
| 2 | `accept` sanitised on every live file picker | [modals.js](../modals.js), [home-app.js](../home-app.js), [creator-main.js](../creator-main.js), [tracker-app.js](../tracker-app.js) |
| 3 | Eviction detection keyed on the engine, not the browser name | [helpers.js](../helpers.js) |
| 4 | `downloadSync` offers the OS share sheet | [sync-engine.js](../sync-engine.js) |
| 5 | iOS-aware sync copy; export action added to the popover | [header.js](../header.js), [preferences-modal.js](../preferences-modal.js) |
| 6 | PNG app icons + `apple-touch-icon` on every page | [scripts/build-app-icons.js](../scripts/build-app-icons.js), 6 × HTML, [manifest.json](../manifest.json), [sw.js](../sw.js) |

**On the Platform module.** Detection keys on the platform, never the browser
name. `isIOS()` also catches an iPad reporting a desktop Macintosh UA — iPadOS
13+ requests desktop sites by default — by disambiguating on `maxTouchPoints`,
which is 0 on a real Mac and 5 on an iPad.

`fileAccept(spec)` returns `undefined` (omit the attribute) when a spec names an
extension iOS cannot resolve, and passes everything else through unchanged. A
filter matching nothing is strictly worse than no filter. MIME specs such as
`image/*` are always preserved, so the photo-library picker is unaffected, and
desktop keeps its convenient filters.

**On the share sheet.** `downloadSync` now hands the blob to `navigator.share`
where files are shareable, mirroring `creator/ExportTab.js`. On iPad that turns
"download, find it in Downloads, move it to OneDrive" into "Share → Save to
Files → OneDrive", and gets AirDrop for free. Desktop browsers do not advertise
file sharing, so they still download. A dismissed sheet is reported as
`cancelled` and deliberately does **not** advance the last-export timestamp —
claiming the device is up to date when nothing was sent would hide the fact
that the other device is stale. It also fixes a latent Safari bug in passing:
the object URL is now revoked on a delay rather than synchronously, which is
what aborts downloads in Safari.

**On the popover.** Without a watch folder it previously offered import but no
way to send, so on iPad — where a folder can never be connected — half the
workflow was missing from the only sync surface on the page. There is now a
"Share sync file" action.

---

## A correction found during implementation

The sync panel with the `Download .csync` / `Import .csync` buttons lives in
`HomeScreen` in [home-screen.js](../home-screen.js). **That component is not
mounted by any page.** `/home.html` renders [home-app.js](../home-app.js), whose
own comment calls `HomeScreen` legacy; `home-screen.js` is still loaded, but
only for `MultiProjectDashboard` / `ProjectCard`, which
[project-library.js](../project-library.js) consumes.

Edits made there in the first draft of this pass were reverted, because a change
to unmounted code is not a fix. The live sync surfaces on `/home.html` are the
header sync popover and the File menu, both in [header.js](../header.js), plus
Preferences → Sync, backup & data. This was caught only by running against a
real browser; the unit tests were happy.

---

## Verified

- Full Jest suite **207 suites / 2 733 tests green** (2 682 before; +51 from
  [tests/platformCapabilities.test.js](../tests/platformCapabilities.test.js)).
- **iPad WebKit e2e, 10 checks green** —
  [tests/ipad/](../tests/ipad/) on the new `ipad-webkit` project. This is the
  first harness in the repo that reproduces an actual iPad: the existing
  `touch-tablet-chromium` project is the iPad Mini viewport on *Chromium*,
  which still exposes `showDirectoryPicker` and so cannot observe any of this.
- **A full round trip on the real engine** —
  [tests/ipad/ipad-roundtrip.spec.js](../tests/ipad/ipad-roundtrip.spec.js)
  seeds a project, exports it through `downloadSync`, saves the file, reloads,
  and feeds it back through the import picker until the plan is ready. That
  covers the send leg, the filename, the picker's `accept`, the mis-pick
  guard and the parse in one pass, which no unit test could.
- Mobile audit **40 checks green** across both projects.
- Terminology lint clean; CSS-token lint unchanged at 13 pre-existing warnings.
- The four `touch-tablet-chromium` failures are unchanged — re-confirmed on a
  stash of this branch, failing identically on the pre-change tree.

Three test files pinned `CACHE_NAME` to the literal `v54`, so the service-worker
bump here broke all three. They now assert a floor rather than an exact version:
pinning meant every legitimate bump broke the tests, which trains people to edit
the assertion instead of thinking about it.

### Found during self-review

Three things the first pass got wrong or left unguarded:

- **The Preferences data panel was untested.** It is built almost entirely from
  `Platform.isIOS()` conditionals, so a scoping slip would surface as a blank
  or crashed panel rather than as wrong text. It now renders for real in the
  iPad spec, asserting no `pageerror` alongside the copy.
- **The export button in the popover was primary on desktop too.** On a machine
  that can watch a folder, the better next step is still connecting one, so
  exporting a file is now primary only on iOS.
- **The picker assertion banned `.xml`.** That extension maps to `public.xml`
  and works fine on iOS; it only ever looked broken because every spec
  containing it also contained `.oxs`. The assertion would have failed
  confusingly on a future `.xml`-only picker, so it now bans `.oxs`/`.csync`
  alone.

One deliberate desktop-visible change: the sync popover gains an "Export sync
file" action when no folder is connected. It fills a real gap on both
platforms, but it is a change desktop users will see.

### Found in use — the import wizard dead-ended on iPad

Reported after the first pass shipped: importing on Safari showed *"Watching a
folder needs a Chromium-based browser"*. This was a real blocker, not just
stale wording, and the first pass missed it.

Step 2 of `UnifiedSyncImportModal` asks "Keep syncing automatically?" with
**"Yes — watch this folder" preselected**. On iPad, tapping Continue hit the
`showDirectoryPicker` check and errored, leaving the user stuck unless they
noticed they had to go Back and choose "No — just this one file". So the
*default* import path dead-ended on the platform the whole branch is about.

The fix is to skip the step, not to reword the error: an unofferable choice,
preselected and then refused, is worse than no choice. On iOS the wizard is now
two steps, step 1 goes straight to the confirmation with `watchEnabled = false`,
and the confirmation says what to do next instead of linking to a Preferences
page that also cannot set up watching.

Three other sites still stated the Chromium advice literally
([modals.js](../modals.js) ×2, [preferences-modal.js](../preferences-modal.js)).
All four now route through one `Platform.folderSyncUnavailableMessage()`, which
keeps the browser recommendation for desktop Safari and Firefox — where
switching genuinely fixes it — and explains the file workflow on iOS, where it
does not. A test asserts no surface states that advice on its own again.

**Why the harness missed it.** The round-trip spec asserted that Continue was
*enabled* and stopped there — one click short of the bug. It now drives the
wizard to the end, and was confirmed to fail against the pre-fix code before
being kept.

### What the tests actually pin down

The eviction tests are genuine regression guards, not restatements: under the
old `/CriOS/` exclusion, `shown` would be empty for Chrome on iPad and the test
fails. `fileAccept` is checked for both directions — unknown extensions dropped,
MIME specs and known extensions preserved — so a future over-eager change that
strips `image/*` would be caught too.

---

## Still open

**The transport is still file-based on iPad.** That is inherent to iOS, not
something this pass could remove. The remaining lever is a network transport,
and the engine is already shaped for it: `exportSync()` produces a blob and
`prepareImport(syncObj)` consumes one, so `exportToFolder` / `scanFolder` /
`checkForUpdates` are the only places holding a `dirHandle`. Extracting a
transport interface — `list()` / `read(name)` / `write(name, bytes)` — with the
current File System Access code as one implementation would let a Dropbox or
Google Drive app-folder OAuth transport drop in behind it. That works in Safari
and needs no backend beyond an OAuth redirect, which suits `vercel.json`'s
`"buildCommand": null` static deployment.

**Untested on hardware.** Everything here is verified on WebKit at an iPad
viewport, which is the right engine but not a real device. Two things need a
physical iPad to confirm: that the Files picker genuinely offers `.csync` files
now, and that the share sheet lists OneDrive as a destination.

**A local-network gotcha.** If the app is tested from `node serve.js` over a LAN
IP, that is not a secure context, so `crypto.subtle` is undefined and the
encryption path in `_deriveKey` throws. Production over HTTPS is unaffected.

## Reproducing

```
npm run test:ipad                              # iPad on real WebKit
npx jest tests/platformCapabilities.test.js    # unit tests
node scripts/build-app-icons.js                # regenerate the PNG icons
```

`tests/ipad/` is excluded from Jest via `testPathIgnorePatterns` in
`package.json`, alongside the existing `tests/e2e`, `tests/perf` and
`tests/mobile-audit` entries.
