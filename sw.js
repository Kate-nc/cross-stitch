var CACHE_NAME = 'cross-stitch-cache-v70';

var PRECACHE_URLS = [
  // HTML pages
  './home.html',
  './index.html',
  './create.html',
  './stitch.html',
  './manager.html',
  // Experimental embroidery is fingerprinted separately and cached on first use.

  // PWA manifest
  './manifest.json',
  './assets/icons/app-icon.svg',
  // PNG rasterisations (scripts/build-app-icons.js). iOS ignores SVG for
  // apple-touch-icon, and a Home Screen install is how an iPad escapes the
  // 7-day eviction of stored patterns — so the icon has to be present.
  './assets/icons/app-icon-180.png',
  './assets/icons/app-icon-192.png',
  './assets/icons/app-icon-512.png',

  // Shared local assets
  './styles.css',
  './version.js',
  './runtime-loaders.js',
  './lazy-modules.js',
  './export-pdf.js',
  './constants.js',
  './dmc-data.js',
  './anchor-data.js',
  './thread-conversions.js',
  './starter-kits.js',
  './colour-utils.js',
  './symbol-glyphs.js',
  './helpers.js',
  './knots.js',
  './backstitch.js',
  './fractional.js',
  './unpick.js',
  './photos.js',
  './tracker-notes.js',
  './creator/Loupe.js',
  './tracking-merge.js',
  './tracking-sync.js',
  './icons.js',
  './import-formats.js',
  './components.js',
  './components-stats.js',
  './navigation.js',
  './header.js',
  './modals.js',
  './threadCalc.js',
  './pattern-size-calc.js',
  './cross-tab-coord.js',
  './cross-tab-resolution.js',
  './cross-tab-lock.js',
  './progress-units.js',
  './creator/SpecialtyStitchPanel.js',
  './project-storage.js',
  './blob-store.js',
  './thread-accounting.js',
  './stash-bridge.js',
  './thread-catalogues.js',

  // Page-specific local scripts
  './home-screen.js',
  './home-app.js',
  './palette-swap.js',
  './user-prefs.js',
  './sw-register.js',

  // Creator app bundle (compiled from creator/ sub-components)
  './creator/bundle.js',
  './creator/extras-bundle.js',
  './creator/import-wizard-bundle.js',
  './import-engine/lazy-shim.js',
  './import-engine/ui/importErrors.js',
  './import-engine/bundle.js',
  './compiled/manager-app.compiled.js',
  './compiled/embroidery.compiled.js',
  './compiled/creator-main.compiled.js',
  './compiled/tracker-app.compiled.js',
  './stats-activity.js',
  './stats-insights.js',
  './stats-page.js',
  './analysis-worker.js',
  './generate-worker.js',
  './cleanup-worker.js',
  './noise-cleanup-worker.js',
  './import-engine/worker.js',
  './wake-lock.js',
  './useWakeLock.js',
  './useTrackerPrefs.js',
  './useCanvasOverlays.js',
  './useAutoSession.js',
  './useStitchCounts.js',
  './useDragMark.js',
  './tracker-minimap.js',
  './tracker-layer-chip.js',
  './tracker-progress-strip.js',
  './work-area.js',
  './components/WorkAreaPicker.js',
  './components/ModeToggle.js',


  // Lazy-loaded local assets
  './pdf-axis-labels.js',
  './pdf-raster-chart.js',
  './pdf-raster-worker.js',
  './pdf-importer.js',
  // assets/fontkit.umd.min.js is intentionally omitted from PRECACHE_URLS.
  // It is only needed when the user exports a Pattern Keeper PDF; the
  // local-asset fetch handler below caches it on first use.
  './backup-restore.js',
  // help-drawer.js is loaded on demand by lazy-modules.js rather than by a
  // <script> tag. It used to be runtime-cached as a side effect of every page
  // load fetching it; now nothing fetches it until the user opens Help, so an
  // offline user who had never opened Help would find it missing. Precaching is
  // what keeps it available. Same reasoning as backup-restore.js above.
  './help-drawer.js',
  // The Tracker loads the PDF exporter on demand (export-pdf.js); the Creator
  // has it inside creator/bundle.js.
  './creator/pdfExport.js',
  './sync-engine.js',
  './webdav-sync.js',
  './assets/fonts/CrossStitchSymbols.base64.js',
  './assets/fonts/CrossStitchSymbols.ttf',

  // External CDN dependencies (exact versioned URLs from HTML)
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs'
];

// BEGIN GENERATED BUILD MANIFEST
var BUILD_ID = "33e02fcb3abe5f6c92d6f77a9ca8db8a2f03fcd53075bab7a345758f40959d05";
var REQUIRED_URLS = [
  "./home.html",
  "./index.html",
  "./create.html",
  "./stitch.html",
  "./manager.html",
  "./manifest.json",
  "./assets/icons/app-icon.svg",
  "./assets/icons/app-icon-180.png",
  "./assets/icons/app-icon-192.png",
  "./assets/icons/app-icon-512.png",
  "./styles.css",
  "./version.js",
  "./runtime-loaders.js",
  "./lazy-modules.js",
  "./export-pdf.js",
  "./constants.js",
  "./dmc-data.js",
  "./anchor-data.js",
  "./thread-conversions.js",
  "./starter-kits.js",
  "./colour-utils.js",
  "./symbol-glyphs.js",
  "./helpers.js",
  "./knots.js",
  "./backstitch.js",
  "./fractional.js",
  "./unpick.js",
  "./photos.js",
  "./tracker-notes.js",
  "./creator/Loupe.js",
  "./tracking-merge.js",
  "./tracking-sync.js",
  "./icons.js",
  "./import-formats.js",
  "./components.js",
  "./components-stats.js",
  "./navigation.js",
  "./header.js",
  "./modals.js",
  "./threadCalc.js",
  "./pattern-size-calc.js",
  "./cross-tab-coord.js",
  "./cross-tab-resolution.js",
  "./cross-tab-lock.js",
  "./progress-units.js",
  "./creator/SpecialtyStitchPanel.js",
  "./project-storage.js",
  "./blob-store.js",
  "./thread-accounting.js",
  "./stash-bridge.js",
  "./thread-catalogues.js",
  "./home-screen.js",
  "./home-app.js",
  "./palette-swap.js",
  "./user-prefs.js",
  "./sw-register.js",
  "./creator/bundle.js",
  "./creator/extras-bundle.js",
  "./creator/import-wizard-bundle.js",
  "./import-engine/lazy-shim.js",
  "./import-engine/ui/importErrors.js",
  "./import-engine/bundle.js",
  "./compiled/manager-app.compiled.js",
  "./compiled/embroidery.compiled.js",
  "./compiled/creator-main.compiled.js",
  "./compiled/tracker-app.compiled.js",
  "./stats-activity.js",
  "./stats-insights.js",
  "./stats-page.js",
  "./analysis-worker.js",
  "./generate-worker.js",
  "./cleanup-worker.js",
  "./noise-cleanup-worker.js",
  "./import-engine/worker.js",
  "./wake-lock.js",
  "./useWakeLock.js",
  "./useTrackerPrefs.js",
  "./useCanvasOverlays.js",
  "./useAutoSession.js",
  "./useStitchCounts.js",
  "./useDragMark.js",
  "./tracker-minimap.js",
  "./tracker-layer-chip.js",
  "./tracker-progress-strip.js",
  "./work-area.js",
  "./components/WorkAreaPicker.js",
  "./components/ModeToggle.js",
  "./pdf-axis-labels.js",
  "./pdf-raster-chart.js",
  "./pdf-raster-worker.js",
  "./pdf-importer.js",
  "./backup-restore.js",
  "./help-drawer.js",
  "./creator/pdfExport.js",
  "./sync-engine.js",
  "./webdav-sync.js",
  "./assets/fonts/CrossStitchSymbols.base64.js",
  "./assets/fonts/CrossStitchSymbols.ttf",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs",
  "./recovery-storage.js",
  "./keyboard-utils.js",
  "./shortcuts.js",
  "./components/PartialStitchThumb.js",
  "./components/Overlay.js",
  "./onboarding-wizard.js",
  "./beads.js",
  "./chart-updates.js",
  "./chart-update-ui.js",
  "./material-reservations.js",
  "./apply-prefs.js",
  "./touch-constants.js",
  "./toast.js",
  "./command-palette.js",
  "./preferences-modal.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "./coaching.js",
  "./project-library.js",
  "./insights-engine.js",
  "./creator/pdfChartLayout.js",
  "./creator/symbolFontSpec.js",
  "./creator/BulkAddModal.js"
];
var BUILD_ASSETS = {
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js": {
    "integrity": "sha384-tMH8h3BGESGckSAVGZ82T9n90ztNXxvdwvdM6UoR56cYcf+0iGXBliJ29D+wZ/x8"
  },
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js": {
    "integrity": "sha384-bm7MnzvK++ykSwVJ2tynSE5TRdN+xL418osEVF2DE/L/gfWHj91J2Sphe582B1Bh"
  },
  "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js": {
    "integrity": "sha384-rNlaE5fs9dGIjmxWDALQh/RBAaGRYT5ChrzHo6tRfgrZ36iRFAiquP5g41Jsv+0j"
  },
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js": {
    "integrity": "sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG"
  },
  "./home.html": {
    "sha256": "9055db46d7f24c96df3690de3632291cf1e1ee115aa94575748a8fc718f21730"
  },
  "./index.html": {
    "sha256": "dc46749698b657a64d833a8c230a9d4f9fb071cc439c3e66b677dff141a93994"
  },
  "./create.html": {
    "sha256": "0d56da347bb4ef883897d6f52a7fc701f868c34bea45e5a6954b71bbbe83e7a5"
  },
  "./stitch.html": {
    "sha256": "e18ee95c205acf7d7a9daeeeebb0e64667cf91b13b16e111db70ba61059e0087"
  },
  "./manager.html": {
    "sha256": "989e0b2beffd3b70adca85692a2a0067302bacada96cfc69863d65bac4a816f3"
  },
  "./manifest.json": {
    "sha256": "d4c4100e8bde92386cc77c149696bd4d6c0d2eb300e62625529e72b92b05b64d"
  },
  "./assets/icons/app-icon.svg": {
    "sha256": "e8c79c003e7b4d00af869a0b5d918cb9826ec9063a0f645fd66d09dbc11f418c"
  },
  "./assets/icons/app-icon-180.png": {
    "sha256": "dc0c61e5c41bba38ffad9624bafb91c73682a8e224338838cf151f41d5273ee7"
  },
  "./assets/icons/app-icon-192.png": {
    "sha256": "b8c99a54a4a41d3a27e7ec3b5f01f5f775ee8c43466001b2ad1d78b05c1e4d0b"
  },
  "./assets/icons/app-icon-512.png": {
    "sha256": "30ed400c9978352785c40bcaf8ea28fb81a20f6d5f1dba58703d7191d62d93a0"
  },
  "./styles.css": {
    "sha256": "2907e65965e1fab09a87c2866e72de07f99567bb61942b6c0abb33c517114a29"
  },
  "./version.js": {
    "sha256": "5f2e6d31ab4d205702e13c7db28778f0c6ae40e341e7169f1bcf0392ec5fb1af"
  },
  "./runtime-loaders.js": {
    "sha256": "4da10789a50dffe2450aebb36efa5dbdb7fc537e922f87748bd21947c202a1a1"
  },
  "./lazy-modules.js": {
    "sha256": "aedb4ee3af7c1f93723612c4cb5bb9a96df558dc1b339b00caa578c496204cb1"
  },
  "./export-pdf.js": {
    "sha256": "1f919aeedd05f7156e703bd628d8b1a908dfb4e360a570c5766085a2cc305bfb"
  },
  "./constants.js": {
    "sha256": "79faacefc8b904058c432e2654ed51870ad4aef448e3f916b033e3db4b43e984"
  },
  "./dmc-data.js": {
    "sha256": "29cca45b43a7b98dac3d4b02b1e7110b35c675b9c819fd0f68587b9c37abad7a"
  },
  "./anchor-data.js": {
    "sha256": "6dc95b04177ca4430a83b93aa765ea24829978260034b7fa5676a3adb5cec281"
  },
  "./thread-conversions.js": {
    "sha256": "2247308f0d986d05904e4cdefe9e0b460506c3920ff5f8f7d99c6004be313f24"
  },
  "./starter-kits.js": {
    "sha256": "5b0d7792c6a6759211b8db8c2e611a0da3fbc4ee0d8c7fc87efa698f1da6c2b3"
  },
  "./colour-utils.js": {
    "sha256": "5bd7f36393a272ffd8252a3c3add0072c0bf0a6f566677e547043098b5d7116a"
  },
  "./symbol-glyphs.js": {
    "sha256": "434cff8dc936a9b28012a438176422fde06eb43c1890a5364c1cc6c2b2d967cd"
  },
  "./helpers.js": {
    "sha256": "54f6d70db08cfd7fa640ac446cb4511aec15d710c71b2d647aa1824b47e1ef9a"
  },
  "./knots.js": {
    "sha256": "850de631376f77a9e6d40760603f74a7c19a51ef89a2ddd686e6cb4f4afa0b57"
  },
  "./backstitch.js": {
    "sha256": "2f8ae7663a1f7dee463b7674b423fbb61aefe6855a5fcd44b06b23be591ba413"
  },
  "./fractional.js": {
    "sha256": "90f48e5bd39bc16eb407c6aeec4607af17029e841ad6f628dc23bb8d7e637d61"
  },
  "./unpick.js": {
    "sha256": "831e9f7e44665313746cd68c728eaa86e0e4ead76875cfa3fbdead11be7e6fd5"
  },
  "./photos.js": {
    "sha256": "f08775898857f6d3b90590f298218e6689891150f553b1f3caf76fb0138a5128"
  },
  "./tracker-notes.js": {
    "sha256": "64e05d8e93966f8dcc7be82df1a93cd987922f6481ce8a66495ff748c2434ba4"
  },
  "./creator/Loupe.js": {
    "sha256": "3d7c2c9becaed45212ed4e4c8a4f299637f158f29f2fbec78bfe502a294d6d2d"
  },
  "./tracking-merge.js": {
    "sha256": "8e541427d27420148aa0ec591e88668ba69b4e4ef9d9dfcf7e0e24d2383dc816"
  },
  "./tracking-sync.js": {
    "sha256": "90287c017c37e47311f1e0e3b13ddb6ede89c9707c4683e9da7a5fd6c608ba35"
  },
  "./icons.js": {
    "sha256": "c0a0b4ac8b56a2ea8cae0f14e6e0c805473c8f6107a208aa54aa96b902ffedc0"
  },
  "./import-formats.js": {
    "sha256": "d31e150d933f08b59fff58ac8d75b986d73742b10be4d6df8e66dc040038241a"
  },
  "./components.js": {
    "sha256": "a541a43c0c5f3d56cd7a41ce98e06a8d49e4a0180b96f23d993ece5466b9d78d"
  },
  "./components-stats.js": {
    "sha256": "79bb8fabc308d500fc1a5a332f2000228a867bc8030bdf2e2b6a81aa173c3473"
  },
  "./navigation.js": {
    "sha256": "ee35e3e194037dc9bdc9c74591fd4945db28fe3df53aea0398e9703f768fb0f8"
  },
  "./header.js": {
    "sha256": "db92e4f45bfd39e73c51e8063e108f42e1141d957f876b56e87236b5ec83baf6"
  },
  "./modals.js": {
    "sha256": "29d6fb7f1db9a638c923f52629dfff8d6b5a9cc77442acfceeaa957dc3533790"
  },
  "./threadCalc.js": {
    "sha256": "3d2e9bd03b3a2b7d30e4d62ce999de8b19d40818e5535a6834b5d30cb9312762"
  },
  "./pattern-size-calc.js": {
    "sha256": "f8d743b60550770510ef77b0e06f5eb333ed0479e057e425a2ad826cef8c8d91"
  },
  "./cross-tab-coord.js": {
    "sha256": "356fa9dcf1110ffae7b14158cfe391abbf52b1cd1fcb6ca679221f1680620684"
  },
  "./cross-tab-resolution.js": {
    "sha256": "82fb9c8433d5e22c54e2a60406bfe1f643c3e86841a71c0ec114aab088f0a930"
  },
  "./cross-tab-lock.js": {
    "sha256": "50b89b4c2607d32dc39d4a13620b86d02d762f71a9d0cb93032ac83a8c00b97c"
  },
  "./progress-units.js": {
    "sha256": "4679a5862d34a39eeda14ab2f64c178b4bcffb2e93f4a83a69868492e774cfa6"
  },
  "./creator/SpecialtyStitchPanel.js": {
    "sha256": "ee290e9f8fda8595302704b1ba85acbecef07d0e1282b038aea79c34e6bd822d"
  },
  "./project-storage.js": {
    "sha256": "5fba9f98a66ef507b8c20f885b63406dc81c38600c5d0518795dfe5da74cd02a"
  },
  "./blob-store.js": {
    "sha256": "869beee9fe5502c2ad614ef9e8b3d6d452abb7ff1fbc6bcf7667dba99f083113"
  },
  "./thread-accounting.js": {
    "sha256": "94b76336b443ed31e4662f3b8fc4fc7a1a69fc94cfddbc388e7ca0d06802612c"
  },
  "./stash-bridge.js": {
    "sha256": "83374a36146cb2dd161e516f4f4c782ed9d9808b5c8bfa8d1bfbc490f8c37c7d"
  },
  "./thread-catalogues.js": {
    "sha256": "ff0a0bd69e9fdd321b35d9fd04670413f3aa6c2a2e00fa2ba7f999bbfc7805e3"
  },
  "./home-screen.js": {
    "sha256": "85883f91eaccd9aad3042dc212e85e9feb7669442be07c206b40a328b7e0987c"
  },
  "./home-app.js": {
    "sha256": "2fce8b04b4acdeaf7f3586783e2885f8ade34ac498652f69a37cb9b3b7c51dc2"
  },
  "./palette-swap.js": {
    "sha256": "4c6c38398a39f21060df3193b8cc5fa12daf0912f0d162321a7f1ec4442e39d8"
  },
  "./user-prefs.js": {
    "sha256": "2ebbb07e9bdf5924d1fb8e9bdd7fae63fecf46a4b0ac7d9014cdc8a2a8f22435"
  },
  "./sw-register.js": {
    "sha256": "4cc025f2bb7cad65c796f0730cb8d1cf378d88e464383b6d862d0b586df0b697"
  },
  "./creator/bundle.js": {
    "sha256": "7fa13fa3f1b105a5ac48af57c8fd457f656b1cf30f46405cb297080305d9f33a"
  },
  "./creator/extras-bundle.js": {
    "sha256": "afc7560011b56919ff231b805b5977d3e675d08a7fcee0d6a5b26d4b9e0da6ab"
  },
  "./creator/import-wizard-bundle.js": {
    "sha256": "2cadd8549aa04af59c40e8f786c40921752f561fd16f42de1c409e4ab8a10e71"
  },
  "./import-engine/lazy-shim.js": {
    "sha256": "8c33328438164fc2ed589b5ee8250abfcde7f59604a19e4f26add601881c62c1"
  },
  "./import-engine/ui/importErrors.js": {
    "sha256": "1e130923b21bc32251ce6902d11971903019918ddbcb56ee74d6759b52af812a"
  },
  "./import-engine/bundle.js": {
    "sha256": "ba933c94c9e019aa88602e5ef2276c1db47917cb77786e011c9f5113b0088ec6"
  },
  "./compiled/manager-app.compiled.js": {
    "sha256": "d6a5b4a6f2d858410332694a3473a2179ab89ae3f0f5824733286beb7ee3b2f0"
  },
  "./compiled/embroidery.compiled.js": {
    "sha256": "d5dee5854794748cf4e9af900c8bc0a370020a64e111efe77dbdc596f2182382"
  },
  "./compiled/creator-main.compiled.js": {
    "sha256": "a18204821ebfe4f317a0d7c71b205cb72fdcab3122d3014e4a6d4b13b9646cec"
  },
  "./compiled/tracker-app.compiled.js": {
    "sha256": "c71a7e499fb044f63ed463036757dc18a1e28c418a6d5b4b9bc6434591b1a17e"
  },
  "./stats-activity.js": {
    "sha256": "14f14b1e70c4e99fe30f89d1eee77e293ca5bcf9580faf5967adb2ba55b5f134"
  },
  "./stats-insights.js": {
    "sha256": "23ed854586fbd814a7ab9886fbd019f9b278a8a71f0a85ecb7d1acbad4e116bc"
  },
  "./stats-page.js": {
    "sha256": "16d93df54a05f20e4a709fa5539977b80adb1e231550a221c384297389085a3b"
  },
  "./analysis-worker.js": {
    "sha256": "a0d3b9526ec89bef46ff8d716915854502b25aab8885583811080e37cf04ef7b"
  },
  "./generate-worker.js": {
    "sha256": "16be6368ce43eaa444dcaca9975f262d4caabdca098ea37d0f2ad013c25fdbea"
  },
  "./cleanup-worker.js": {
    "sha256": "400f297c33328632690d56fe926ad82623f561c3d83fc445fd8ce5152cfaa96e"
  },
  "./noise-cleanup-worker.js": {
    "sha256": "857b65a92ce4955701a14dca291bcd5f4eb422b41bf372a0203b73544e61e1c6"
  },
  "./import-engine/worker.js": {
    "sha256": "1427b6823794043293e8fb544f2e80804b5affd27f0b6d2f32edc52d8ca925a3"
  },
  "./wake-lock.js": {
    "sha256": "58705c9c71a37addf60cbf2bd5a8efdfb957f9ba4df7c8dc9a35bc0f3eabbeb1"
  },
  "./useWakeLock.js": {
    "sha256": "8cad5a8f7ac681cb8f16e74fdf942997ac8f1ec50b75e8559fa068e5a765f347"
  },
  "./useTrackerPrefs.js": {
    "sha256": "ed92d68c4ec04dab726d7ee4b996290476fc03e08f3a6db481c4c40eeaafa7ed"
  },
  "./useCanvasOverlays.js": {
    "sha256": "dfd7c53525fa2b70602790f1f120940d866a2230f6d22d2938bc76d56770fba0"
  },
  "./useAutoSession.js": {
    "sha256": "0c91b1a1fa79f1cce51417cbcbd9ba7ed3c6aac36975f6e42b0cf96b8d4b5458"
  },
  "./useStitchCounts.js": {
    "sha256": "ab02c07c8bc06fc8e5af987302a452d2a95b76573e117a654bb21442aeae096f"
  },
  "./useDragMark.js": {
    "sha256": "4803c756f3469117cd16730e4208bb43f0aaf321df93ad47b39466a4c7628f9c"
  },
  "./tracker-minimap.js": {
    "sha256": "438dd62ca44de0eaa812283d34f08e19a726ff2dc783bd16a9839d7acf3b89f3"
  },
  "./tracker-layer-chip.js": {
    "sha256": "5c3bcd3183fa5b087e392aee182d721eb87e67fb307cb24924c09fbe7dff7e85"
  },
  "./tracker-progress-strip.js": {
    "sha256": "60473afa7426c23fe3a848cbf3b2ba0d51ccfe895b4cc3ced352cac952374e09"
  },
  "./work-area.js": {
    "sha256": "907f38a428eb2075c7d8bf5ebb4f66b825bd695348e879db3ab2e62f4eef02aa"
  },
  "./components/WorkAreaPicker.js": {
    "sha256": "6ba5482e6409defd5ac5ddd245291583252085177b6772174e7e1b2684a4132f"
  },
  "./components/ModeToggle.js": {
    "sha256": "cb973f8c699fad2673d16fecab25b47cc148144048a108e7444b8860911bb2d9"
  },
  "./pdf-axis-labels.js": {
    "sha256": "dfb0520622f8e495efa1504f0b7dfbb0bbba142875f26d5b09b511cde1a4e95b"
  },
  "./pdf-raster-chart.js": {
    "sha256": "3c2fe4f670d6419a414d175c12b40922da6435570db6245d8f9ac19a1770d23e"
  },
  "./pdf-raster-worker.js": {
    "sha256": "524d936a439d9395a7d93a77e6addc9c2224e3a46076f7aeb702985b740c4713"
  },
  "./pdf-importer.js": {
    "sha256": "16efd4a61bb6f53e055a134e2f7bd7dee8e5d4d412c1c1ede878189e6fea390c"
  },
  "./backup-restore.js": {
    "sha256": "77b3759d887dd998f80bd7da66e9f00b2641276b57cec5bf8ad895d334e151cc"
  },
  "./help-drawer.js": {
    "sha256": "8184923c49e249a23b63833864cd0ccb41ec97fbd5e2c0dd3372bb7a8d2a2101"
  },
  "./creator/pdfExport.js": {
    "sha256": "70e7b15e8bb57d00f3e71b98d82da8abbc961b6f05a859aa99bd712299417310"
  },
  "./sync-engine.js": {
    "sha256": "80ffe9854239ac05e2bee8231fb6dde361095f54bedb8b6a2f7e1e8a4c5a9812"
  },
  "./webdav-sync.js": {
    "sha256": "eb6cceb9c949c479b79108eeae059db6022221763d97ba454578672be887a39c"
  },
  "./assets/fonts/CrossStitchSymbols.base64.js": {
    "sha256": "c6b5293953acb71cf7dd71bd8b293333c9012ab1760ba3f7a19e7977f3b30ca4"
  },
  "./assets/fonts/CrossStitchSymbols.ttf": {
    "sha256": "39ad60a805057a6192fa24412d4676145dad46b5d9bcff09272cde2876d1034c"
  },
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs": {
    "integrity": "sha384-ZCFxELU1bvPx4evkYZ+4CxkApXPjaMxGVdWGuBjqwJe5aBdx8oSItpalx5V4e5Yh"
  },
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs": {
    "integrity": "sha384-VmWqohaIr0TG8Z7jJ6XGckbkf8x1MwGKHoL/4uTODvpnyUCDVNhQfrEmWTvzn0Os"
  },
  "./recovery-storage.js": {
    "sha256": "f43d8ba4b8457ee00ccfc495b1435ae0bca0cbf6c12610f549d32777b3e95d5f"
  },
  "./keyboard-utils.js": {
    "sha256": "d77c394b89e429281a3389e5e224269ce446c0b8c7638dca1343d5af0ec8b225"
  },
  "./shortcuts.js": {
    "sha256": "229c26018dc4b6763310aa8143f223838641589d4639fc19439854b9f0afbd57"
  },
  "./components/PartialStitchThumb.js": {
    "sha256": "b42bf0c83c6a7a91d822b5700a7e150a10ade794a1cb8da926e0f96a94c5ec47"
  },
  "./components/Overlay.js": {
    "sha256": "0844fc8ccd2a4a038c7ca13b8f13478f5fdc6e77d952c6877ce5f3a7b6b12d6f"
  },
  "./onboarding-wizard.js": {
    "sha256": "db7464a12c2d198fd51041f2d39dceca67c5f07f8d12448c91dfd4b9569057f8"
  },
  "./beads.js": {
    "sha256": "c7a295f9184daf1f8bf528cdfcff36e3808e772f7feca278ab5616e282574641"
  },
  "./chart-updates.js": {
    "sha256": "a806e98691d2b54efc7cf897aed64326d83482a1f103b3ae107219a1f34040ec"
  },
  "./chart-update-ui.js": {
    "sha256": "4e7ba5285fed13c29a8b554f49a5eecbf1a5627ff6602d9d13322fec85a9b1f5"
  },
  "./material-reservations.js": {
    "sha256": "91970d7c61eb15ee6ab890236e3f6a9e06536ff5c296dc161191530d0dc88fe6"
  },
  "./apply-prefs.js": {
    "sha256": "a8346e4d9ed2ee8d74714f8bf048a3a53365e195c620eb5473e5af35a7801c62"
  },
  "./touch-constants.js": {
    "sha256": "433afbd8694f3fb578720e92da0510d29d36813b71ac0a88c297849657c5f520"
  },
  "./toast.js": {
    "sha256": "6902c67b153f0ad0cfb4e02d4a18a5386580d6d18bd5cfcb4946e87e037324e5"
  },
  "./command-palette.js": {
    "sha256": "939ac378ce06c86a18c8e42cefc4907ec8c065edf51cb898eaead75db24a8ae7"
  },
  "./preferences-modal.js": {
    "sha256": "c24ca143de3a385ae354bd2209336b1774821ede4f3cb8f9da05e8d159992045"
  },
  "./coaching.js": {
    "sha256": "fdd2a7cea5a5780f52b6c3f5e240344d3dabe1faa6a4d8f2ad76db47f319ab4c"
  },
  "./project-library.js": {
    "sha256": "f4d5d6a6a75f4d4cd64ee9661856b3f7d45802b7e89e37a02b0d844be45f184d"
  },
  "./insights-engine.js": {
    "sha256": "6f0ff93b3e6a6cda427b802efc10b578d58f0247110e46013dad8d8c6d9edc48"
  },
  "./creator/pdfChartLayout.js": {
    "sha256": "dfab6001d334b9e243cdd78b99c6bf18a1e48189fa3e32b434136649049c91e1"
  },
  "./creator/symbolFontSpec.js": {
    "sha256": "a2a4de6283f67446424538e7ee83e10d8ae76f0c379b3ba8bdbbac27d6ca5e69"
  },
  "./creator/BulkAddModal.js": {
    "sha256": "d12ec064f79aaf6b5b8e13a999e2525504e3d9fd844625305f94560b2f175946"
  },
  "./embroidery.html": {
    "sha256": "cfc48284fb6a28c67edbf24c2976b85a207a9a5d4575de69cbfafee782bffea8"
  },
  "./embroidery.js": {
    "sha256": "ec2e4ea674fd96cd02f301428d997919fbe0db858247f21b31ea9e6c07a98577"
  },
  "./assets/fontkit.umd.min.js": {
    "sha256": "d8df561b9fba98e24f2e5130e40948809281bbbc55a20c412359f1a0a5eb35a6"
  },
  "./pdf-export-worker.js": {
    "sha256": "ed4b2bf7aa55c9f85067726511b1e13c3413b044b704e8a1048bb873eb7561b9"
  },
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js": {
    "integrity": "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI"
  }
};
// END GENERATED BUILD MANIFEST

// Each build has its own immutable candidate, even if the release cache number
// was not bumped. The ready record is written last; partial caches are never used.
var CACHE_SCOPE = new URL(self.registration.scope).pathname === '/' ? '' : '-scope-' + encodeURIComponent(new URL(self.registration.scope).pathname);
var BUILD_CACHE = CACHE_NAME + '-' + BUILD_ID + CACHE_SCOPE;
var READY_URL = new URL('./__sw_ready__', self.registration.scope).href;
var OWN_CACHE = /^cross-stitch-cache-v\d+(?:-[a-f0-9]{64})?$/;

function ownsCache(name) {
  if (!CACHE_SCOPE) return OWN_CACHE.test(name);
  return name.endsWith(CACHE_SCOPE) && OWN_CACHE.test(name.slice(0, -CACHE_SCOPE.length));
}
function absolute(url) { return new URL(url, self.registration.scope).href; }
function unavailable() { return new Response('Application asset unavailable; close all app tabs and reopen online to retry the update.', { status: 503 }); }
async function verifiedResponse(url) {
  var expected = BUILD_ASSETS[url];
  var options = { cache: 'no-store', mode: 'cors', credentials: 'same-origin', redirect: 'error' };
  if (expected && expected.integrity) options.integrity = expected.integrity;
  var response = await fetch(new Request(absolute(url), options));
  if (!response.ok || response.type === 'opaque') throw new Error('Required asset failed: ' + url);
  if (expected && expected.sha256) {
    var bytes = await response.clone().arrayBuffer();
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    var hex = Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    if (hex !== expected.sha256) throw new Error('Build mismatch: ' + url);
  }
  return response;
}
async function ready(cacheName) {
  var cache = await caches.open(cacheName);
  var record = await cache.match(READY_URL);
  return record ? record.json() : null;
}
async function validateCandidate() {
  var record = await ready(BUILD_CACHE);
  if (!record || record.build !== BUILD_ID) throw new Error('Incomplete application cache');
  var cache = await caches.open(BUILD_CACHE);
  for (var url of REQUIRED_URLS) {
    if (!(await cache.match(absolute(url)))) throw new Error('Missing cached asset: ' + url);
  }
}
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    // Sequential writes also ensure a failed install cannot leave late writes
    // recreating a cache after cleanup. Browser termination may leave a partial
    // cache, which a later successful activation removes.
    if (await ready(BUILD_CACHE)) { await validateCandidate(); return; }
    await caches.delete(BUILD_CACHE);
    var cache = await caches.open(BUILD_CACHE);
    try {
      for (var url of REQUIRED_URLS) await cache.put(absolute(url), await verifiedResponse(url));
      await cache.put(READY_URL, new Response(JSON.stringify({ build: BUILD_ID, completed: Date.now() })));
      await validateCandidate();
    } catch (error) {
      await caches.delete(BUILD_CACHE);
      throw error;
    }
    // No skipWaiting: all controlled tabs must close before this build takes over.
  })());
});
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    await validateCandidate();
    var names = (await caches.keys()).filter(function (name) { return ownsCache(name) && name !== BUILD_CACHE; });
    var complete = [];
    for (var name of names) {
      var record = await ready(name);
      if (record) complete.push({ name: name, completed: record.completed });
    }
    complete.sort(function (a, b) { return b.completed - a.completed; });
    var recovery = complete.length ? complete[0].name : null;
    // Keep one complete predecessor. Legacy caches lack a ready record, so keep
    // the newest numbered legacy release on the first migration as recovery.
    if (!recovery) recovery = names.filter(function (name) { return /^cross-stitch-cache-v\d+$/.test(name); })
      .sort(function (a, b) { return Number(b.split('-v')[1]) - Number(a.split('-v')[1]); })[0];
    for (var obsolete of names) if (obsolete !== recovery) await caches.delete(obsolete);
    // Do not claim uncontrolled pages: their in-memory scripts may be another
    // build. They become controlled on their next navigation, without a reload.
  })());
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  var root = new URL(self.registration.scope);
  var local = url.origin === root.origin && url.pathname.startsWith(root.pathname);
  var key = local ? './' + url.pathname.slice(root.pathname.length) : url.href;
  if (local && event.request.mode === 'navigate') {
    var route = key.replace(/\/$/, '');
    var aliases = { '.': './home.html', './home': './home.html', './create': './create.html', './stitch': './stitch.html', './manager': './manager.html' };
    // A trailing-slash document would resolve relative scripts under /home/
    // (or /create/) instead of the deployment root. Canonicalise before serving.
    if (key.endsWith('/') && route !== '.' && aliases[route]) {
      url.pathname = url.pathname.slice(0, -1);
      event.respondWith(Promise.resolve(Response.redirect(url.href, 302)));
      return;
    }
    key = aliases[route] || key;
  }
  if (!Object.prototype.hasOwnProperty.call(BUILD_ASSETS, key)) {
    // Never fetch unknown application code into a controlled build. Keep user
    // files, non-GET requests and unrelated origins out of application caches.
    if (local && (event.request.mode === 'navigate' || /\.(?:js|mjs|css|html|json)$/i.test(url.pathname))) event.respondWith(Promise.resolve(unavailable()));
    return;
  }
  event.respondWith((async function () {
    var cache = await caches.open(BUILD_CACHE);
    var cached = await cache.match(absolute(key));
    if (cached) return cached;
    // Optional features and recovery of an evicted entry use the same digest.
    // A newer deployment must never fill a hole in this build with new bytes.
    try {
      var response = await verifiedResponse(key);
      await cache.put(absolute(key), response.clone());
      return response;
    } catch (_) { return unavailable(); }
  })());
});
