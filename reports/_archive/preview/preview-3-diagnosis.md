# Preview-3 — Diagnosis of broken settings

For each broken setting, the failure-point taxonomy from the brief:

- **A** State doesn't update.
- **B** State updates but nothing watches it.
- **C** Conversion trigger fires but doesn't pass the setting.
- **D** Conversion runs but ignores the setting.
- **E** Conversion produces output but the preview doesn't re-render.

## S1 — "Use only stash threads"

**Failure points: B + C + D (compounded).** The dependency exists, the
trigger fires, but `allowedPalette` is built incorrectly and ends up
`null`, so the engine receives the same input as if the toggle were
off.

### The broken builder

[creator/usePreview.js#L25-L37](../creator/usePreview.js#L25-L37):

```js
allowedPalette = [];
Object.keys(globalStash).forEach(function(id) {
  if ((globalStash[id].owned || 0) > 0) {
    var dmcEntry = findThreadInCatalog('dmc', id);   // ← BUG
    if (dmcEntry) allowedPalette.push(dmcEntry);
  }
});
if (!allowedPalette.length) allowedPalette = null;
```

`globalStash` is populated by
`StashBridge.getGlobalStash()` ([stash-bridge.js#L221](../stash-bridge.js#L221))
which returns **composite-keyed** entries: `{ "dmc:310": { owned, … }, "dmc:550": { … } }`.

Calling `findThreadInCatalog('dmc', 'dmc:310')` looks up DMC id literally
`"dmc:310"` and never finds anything. Every iteration drops through.
`allowedPalette` stays empty. The next line sets it to `null`. `null`
means *no constraint* in `quantize()` ([colour-utils.js#L52](../colour-utils.js#L52)):

```js
var pool = allowedPalette && allowedPalette.length ? allowedPalette : DMC;
```

→ falls back to the full DMC palette. Toggling stash mode on the
preview path is therefore a no-op.

### The reference builder (the Generate path) does it right

[creator/useCreatorState.js#L848-L857](../creator/useCreatorState.js#L848-L857):

```js
Object.keys(globalStash).forEach(function(key) {
  if ((globalStash[key].owned || 0) <= 0) return;
  var bareId = _extractDmcId(key);            // ← strips "dmc:" prefix
  if (!bareId) return;
  var dmcEntry = findThreadInCatalog('dmc', bareId);
  if (dmcEntry) allowedPalette.push(dmcEntry);
});
```

This same pattern is used in **four** other places in `useCreatorState.js`
(lines 939, 988, 1058, 1245). The preview is the lone copy that's
broken.

### Fix scope

- **Wiring**: replace the inline builder in `usePreview.js` with the
  identical `_extractDmcId` pattern.
- **Architectural**: the duplication is the real bug. There should
  be a single helper (e.g. `buildAllowedPaletteFromStash(globalStash, subset)`)
  exported from `useCreatorState.js` (or a new shared module) and
  used by both the preview, the worker call, the gallery, and
  `effectiveMaxC`/`effectiveAllowBlends`/`stashPalette`/`blendsAutoDisabled`
  derivations. Otherwise the next refactor will diverge again.

## C5 — "Min stitches per colour"

**Failure points: B + C + D.** The slider writes to `minSt`, but:

1. `minSt` is **not in the deps array** of `generatePreview`
   ([usePreview.js#L176-L184](../creator/usePreview.js#L176-L184)).
   Changing it does not rebuild the callback nor restart the debounce.
   *(This is point B.)*
2. Even if the callback re-ran, `minSt` is never read inside
   `generatePreview`. *(Point C.)*
3. Even if it were read, `runCleanupPipeline` itself does not
   implement `minSt` rebucketing — that logic lives only in
   `runGenerationPipeline` ([generate.js#L155-L175](../creator/generate.js#L155-L175)),
   the worker/full-pass path. The preview's pipeline simply doesn't
   have the feature. *(Point D.)*

### Fix scope

Two reasonable shapes:

- **Move the `minSt` rebucketing pass into `runCleanupPipeline`** so
  preview and Generate both honour it. This is the right fix because
  the engine should have one definition of "rare-colour collapse",
  not two. Then add `minSt` to the preview deps and forward it.
- **Cheaper alternative**: implement just the rebucket in the
  preview alongside its current `runCleanupPipeline` call. Smaller
  blast radius, but keeps the divergence the bug stems from.

## C3 — Dither strength (weak / balanced / strong)

**Failure point: C.** Toggling `dithMode` between weak/balanced/strong
does rebuild the callback (deps include `dithMode`), and `dith` stays
`true`, so a re-run *happens*. But the preview's call to
`runCleanupPipeline` ([usePreview.js#L91](../creator/usePreview.js#L91))
omits `dithStrength` from the opts object:

```js
runCleanupPipeline(raw, pw, ph, {
  maxC: effMaxC, dith: dith, allowBlends: effAllowBlends,
  skipBg, bgCol, bgTh, stitchCleanup, orphans, allowedPalette, seed: varSeed
});  // ← no dithStrength
```

`runCleanupPipeline` defaults to `1.0` ("balanced") when the field is
missing ([generate.js#L33](../creator/generate.js#L33)). So *all three*
strengths render identically in preview at the balanced setting. The
Generate path passes it correctly.

### Fix scope

Single-line wiring fix: read `state.dithStrength` and forward.

## C4 — "Allow blended threads" (partial / progressive-paint quirk)

**Failure points: C (only on the fast pre-pass).** Wiring is correct
in code: `state.allowBlends` is in deps, `effAllowBlends` is read,
and `runCleanupPipeline` forwards it to `findBest()` which honours it.

**However** when dithering is on, the user sees a two-stage paint:

[usePreview.js#L80-L86](../creator/usePreview.js#L80-L86):

```js
if (dith) {
  var fastResult = runCleanupPipeline(raw, pw, ph, {
    maxC: effMaxC, dith: false,
    allowBlends: false,                  // ← always false on the fast pass
    …
  });
  if (fastResult) state.setPreviewUrl(renderUrl(fastResult.mapped));
  fullPassTimerRef.current = setTimeout(runFull, 0);
  return;
}
```

The user briefly sees the no-blend solid map before the proper
blended pass paints over it. With dither on, toggling C4 first shows
the *unblended* mid-frame; users with pattern-design instincts will
read this as "the toggle did nothing" before the next paint catches
up — especially because the visible delta between blended and
non-blended at 40k preview pixels is subtle on most images.

### Fix scope

- Make the fast pre-pass honour `effAllowBlends` (cheap), or
- Skip the fast pre-pass entirely when blends are enabled (since
  the time saving is most valuable when the engine has work to do
  for dither, and the cost is the visual lie about blends), or
- Add a loading indicator (recommended either way) so the user
  knows a result is mid-flight and that the *next* frame is the
  authoritative one.

## Cross-cutting structural finding

The recurring theme across **S1, C3, C5** is that
`runCleanupPipeline` is **invoked from two separate sites with
inline-built opts objects**:

| Site | File | Notes |
|---|---|---|
| Preview | [usePreview.js#L91](../creator/usePreview.js#L91) | Missing dithStrength, broken stash-builder, no minSt logic |
| Generate (main thread fallback) | [useCreatorState.js#L887](../creator/useCreatorState.js#L887) via `runGenerationPipeline` | Complete |
| Generate (worker) | [generate-worker.js](../generate-worker.js) calling `runGenerationPipeline` | Complete |
| Variation gallery | [useCreatorState.js#L1010-L1025](../creator/useCreatorState.js#L1010-L1025) | Has its own opts shape too |

Each call site re-derives the settings object by hand. This is the
underlying defect that the surface-level bugs are symptoms of. Any
real fix must collapse these into a single canonical "settings
contract" that the preview and the worker share — otherwise the
seventh future setting will reproduce this same class of bug.
