#!/usr/bin/env node
// build-creator-bundle.js — Concatenates creator/ files in dependency order
// Run: node build-creator-bundle.js
// Outputs: creator/bundle.js, creator/extras-bundle.js
//
const fs = require('fs');
const path = require('path');

// Write `content` to `target` only if the existing file differs. Returns true
// when a write actually happened. Keeps the build idempotent so re-running
// `node build-creator-bundle.js` with no source changes leaves mtimes (and
// downstream watchers, IDE indexers, git status) untouched.
function writeIfChanged(target, content) {
  try {
    if (fs.existsSync(target)) {
      const current = fs.readFileSync(target, 'utf8');
      if (current === content) return false;
    }
  } catch (e) { /* fall through to write */ }
  fs.writeFileSync(target, content, 'utf8');
  return true;
}

// ── Bundle layout ──────────────────────────────────────────────────────────
// ORDER         → creator/bundle.js          (loaded eagerly on the Creator page)
// EXTRAS_ORDER  → creator/extras-bundle.js   (loaded the first time
//                                             Materials & Output or the Adapt
//                                             modal opens: loadCreatorExtras
//                                             in runtime-loaders.js)
//
// EXTRAS contains modules that are only needed for the Materials & Output
// page (LegendTab/PrepareTab/ExportTab/MaterialsHub and their helpers) plus
// the Stash-Adapt modal pipeline. creator-main.js shows a loading message
// until it arrives. pdfChartLayout.js is not included: the Creator pages
// load it with its own <script> tag because symbol-glyphs.js needs it from
// the first render.
const ORDER = [
  'context.js',
  // Auto-save state machine — pure helper used by useProjectIO.js to drive
  // the visible save status badge in the header.
  'saveStatus.js',
  'symbolFontSpec.js',
  'generate.js',
  'canvasRenderer.js',
  'PreviewCanvas.js',
  'RealisticCanvas.js',
  // Pure colour-replace helpers used by useMagicWand + ColourReplaceModal.
  'colourReplace.js',
  // Full / half stitch conversion for a selection (pure).
  'stitchTypeConvert.js',
  // Smooth edges: 3/4 stitches along a selection's outline (pure).
  'smoothEdges.js',
  // Keeps stitching progress consistent when cells are edited.
  'stitchedEdits.js',
  'useMagicWand.js',
  'useLassoSelect.js',
  'useMoveSelection.js',
  // Copy, paste, flip and rotate for a selection (audit DRAW-04).
  'selectionTransforms.js',
  'useSelectionClipboard.js',
  'shapeTools.js',
  'stitchFonts.js',
  'useCreatorState.js',
  // Saves ~30 KB on every Creator page load for the default user.
  'useEditHistory.js',
  'cleanupSharedHelpers.js',
  'useCleanupMode.js',
  'useDenoiseMode.js',
  'paletteTools.js',
  'Loupe.js',
  'useCanvasInteraction.js',
  'useKeyboardShortcuts.js',
  // The one list of Edit tools: touch rail, More panel and desktop rail
  // (Stage 2). Data plus small click handlers; read at render time.
  'toolRegistry.js',
  'useProjectIO.js',
  'usePreview.js',
  'CompareOptions.js',
  'CompareStrip.js',
  'GenerateProgress.js',
  'PatternCanvas.js',
  // Cross / half / half for a selection (bar, menus, Tools tab).
  'StitchTypeChoice.js',
  'SelectionBar.js',
  // Smooth edges card / phone sheet for a selection.
  'SmoothEdgesPanel.js',
  // Shapes and mirror drawing (audit DRAW-04).
  'MirrorHandle.js',
  'TextToolSheet.js',
  'SplitPane.js',
  'CompactBar.js',
  'SpecialtyStitchPanel.js',
  // Tool rail and options bar for the creator.desktopRail layout (Stage 2).
  'DesktopRail.js',
  'ToolStrip.js',
  'MagicWandPanel.js',
  'BulkAddModal.js',
  'FrameView.js',
  'FabricBlock.js',
  'SizeField.js',
  'NewDesignSheet.js',
  'Sidebar.js',
  'ConvertPanel.js',
  'StitchedPreview.js',
  'Toast.js',
  'ContextMenu.js',
  'ReadyBar.js',
  'PatternTab.js',
  'ProjectTab.js',
  // UX-12 Phase 5: outcome action bar mounted in creator-main.js.
  // Option 2: PatternInfoPopover must load before ActionBar (which renders
  // it) so window.CreatorPatternInfoPopover is defined at mount time.
  'PatternInfoPopover.js',
  'ColourReplaceModal.js',
  'canvasResize.js',
  'ResizeCanvasModal.js',
  'ActionBar.js',
];

// Materials & Output + Stash-Adapt — lazy-loaded via creator/extras-bundle.js.
// matchQuality.js MUST precede adaptationEngine.js, which MUST precede
// AdaptModal.js. ExportTab depends on DesignerBrandingSection. MaterialsHub
// renders LegendTab/PrepareTab/ExportTab so they all must be concatenated
// before it.
const EXTRAS_ORDER = [
  'matchQuality.js',
  'adaptationEngine.js',
  'pdfExport.js',
  'zipBundle.js',
  'AdaptModal.js',
  'LegendTab.js',
  'PrepareTab.js',
  'DesignerBrandingSection.js',
  'ExportTab.js',
  'ShoppingListModal.js',
  'ReadyReview.js',
  'MaterialsHub.js',
];

const parts = ORDER.map(name => {
  const src = fs.readFileSync(path.join('creator', name), 'utf8');
  return `/* ─── ${name} ─── */\n${src}`;
});

const banner = `/* creator/bundle.js — AUTO-GENERATED by build-creator-bundle.js
   Do not edit directly. Edit the source files in creator/ and re-run the build. */\n\n`;

const bundle = banner + parts.join('\n\n');
const bundleTarget = path.join('creator', 'bundle.js');
const bundleChanged = writeIfChanged(bundleTarget, bundle);

const kb = (bundle.length / 1024).toFixed(1);
console.log(`creator/bundle.js ${bundleChanged ? 'written' : 'unchanged'} \u2014 ${bundle.length} bytes (${kb} KB), ${ORDER.length} files merged`);

// ── Build the deferred extras bundle (action plan §3.2) ────────────────────
// Materials & Output components + Stash-Adapt modal pipeline. Loaded with
// `defer` from create.html so it downloads in parallel with the main bundle
// but doesn't block HTML parsing. Saves ~210 KB of synchronous parse cost
// on the critical path before first paint.
const extrasParts = EXTRAS_ORDER.map(name => {
  const src = fs.readFileSync(path.join('creator', name), 'utf8');
  return `/* \u2500\u2500\u2500 ${name} \u2500\u2500\u2500 */\n${src}`;
});
const extrasBanner = `/* creator/extras-bundle.js \u2014 AUTO-GENERATED by build-creator-bundle.js
   Lazy-loaded second bundle for Materials & Output components and the
   Stash-Adapt modal pipeline. Loaded with \`defer\` from create.html so it
   does not block initial HTML parsing. Do not edit directly. */\n\n`;
const extrasBundle = extrasBanner + extrasParts.join('\n\n');
const extrasTarget = path.join('creator', 'extras-bundle.js');
const extrasChanged = writeIfChanged(extrasTarget, extrasBundle);
const ekb = (extrasBundle.length / 1024).toFixed(1);
console.log(`creator/extras-bundle.js ${extrasChanged ? 'written' : 'unchanged'} \u2014 ${extrasBundle.length} bytes (${ekb} KB), ${EXTRAS_ORDER.length} files merged`);


