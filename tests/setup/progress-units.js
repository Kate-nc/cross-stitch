global.Beads = require('../../beads.js');
// The pages load progress-units.js with a script tag before project-storage.js (tests/progressUnitsLoaded.test.js
// checks every page). Tests that run project-storage.js on its own get the same global from here.
const PU = require('../../progress-units.js');
global.ProgressUnits = PU;
if (typeof window !== 'undefined') window.ProgressUnits = PU;

// helpers.js is loaded before these scripts on every page, so its shared functions (the estimator, the date helper)
// are globals there. Tests that load insights-engine.js or project-storage.js on their own get them from here.
try {
  const fs = require('fs');
  const path = require('path');
  (0, eval)(fs.readFileSync(path.join(__dirname, '..', '..', 'helpers.js'), 'utf8'));
} catch (e) { /* a test that needs them will say so */ }

// Pages load the causal mark helper before storage and sync.
global.TrackingSync = require('../../tracking-sync.js');

// Pages load the merge primitives before sync-engine.js, which calls them by global name.
global.SyncMergeHelpers = require('../../sync-merge-helpers.js');

// Pages load the attachment codec before the engine's narrow verification adapter.
global.SyncAttachmentCodec = require('../../sync-attachment-codec.js');

// Pages load the export scheduler before the engine, which looks it up when an automatic export is first triggered.
global.SyncExportScheduler = require('../../sync-export-scheduler.js');

// Pages load the PDF placement geometry before pdf-importer.js, whose ruler/grid methods delegate to it by global name.
global.PdfChartGeometry = require('../../pdf-chart-geometry.js');
