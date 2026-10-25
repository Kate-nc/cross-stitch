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
  './pdf-chart-geometry.js',
  './pdf-picture-pixels.js',
  './pdf-key-reader.js',
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
  './sync-merge-helpers.js',
  './sync-attachment-codec.js',
  './sync-export-scheduler.js',
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
var BUILD_ID = "eb1b2ab537adda6528f8b4517c6d783675ea8ce765163a2ee5d81604126812d4";
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
  "./pdf-chart-geometry.js",
  "./pdf-picture-pixels.js",
  "./pdf-key-reader.js",
  "./pdf-raster-worker.js",
  "./pdf-importer.js",
  "./backup-restore.js",
  "./help-drawer.js",
  "./creator/pdfExport.js",
  "./sync-merge-helpers.js",
  "./sync-attachment-codec.js",
  "./sync-export-scheduler.js",
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
    "sha256": "b4b94ee107497ef2ce98f2d62255b9ef2f823deedf6add3252fd5083d96cb489"
  },
  "./index.html": {
    "sha256": "4809310dc144e4d10bf191d4dbf6f006ad5508aa9c80fc7967cc8170b0872136"
  },
  "./create.html": {
    "sha256": "bc7e9664e3bd72485633c531998250a9af0d3949621c45b10f5efa81ac751e99"
  },
  "./stitch.html": {
    "sha256": "52a82d5d96db5b844bf4cd5893408ab636c107a11f8618ab36838871fbdea54c"
  },
  "./manager.html": {
    "sha256": "29be2d3d2a6e2371a91e6701bdeaf3edfcc66bc5dd675dac7682f33d95ef358e"
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
    "sha256": "ecab8166f648544f3f1c1d7fa409d5222c532fbd3827781465c1144619c34016"
  },
  "./version.js": {
    "sha256": "f6ddcd009e43cfdd8098f4fa9a5b2cd578b11a01becd8af4a60ac39a51161558"
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
    "sha256": "2af87345f48d7c288c15cdda2bdb274258c587869b137ac5966ea4a70f11dc49"
  },
  "./symbol-glyphs.js": {
    "sha256": "434cff8dc936a9b28012a438176422fde06eb43c1890a5364c1cc6c2b2d967cd"
  },
  "./helpers.js": {
    "sha256": "75a18547c483925e84c286aca7a42cd0fe7caecf759ddff5e75f2b0659c3d1a7"
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
    "sha256": "091b228defb48ce03701ddaff9fa792d89bd139f7a203fca387c05041024fa0b"
  },
  "./import-formats.js": {
    "sha256": "1c2c7e65d1d4e81db1b550789e5d3f8f950d896e5e6b0430089555aca407eb9f"
  },
  "./components.js": {
    "sha256": "9303eb517c77e9c9670a6c361d4561ae79de77c5d7dc3be0fc258d00d088c4d2"
  },
  "./components-stats.js": {
    "sha256": "79bb8fabc308d500fc1a5a332f2000228a867bc8030bdf2e2b6a81aa173c3473"
  },
  "./navigation.js": {
    "sha256": "ee35e3e194037dc9bdc9c74591fd4945db28fe3df53aea0398e9703f768fb0f8"
  },
  "./header.js": {
    "sha256": "27bc8c4b0bf113fd6ad1f1a0655274ee0a9dcdd802cc415c4ea5021e210f931a"
  },
  "./modals.js": {
    "sha256": "29d6fb7f1db9a638c923f52629dfff8d6b5a9cc77442acfceeaa957dc3533790"
  },
  "./threadCalc.js": {
    "sha256": "31ba15cfebe413fdcf691953b742ba7bcaeab4700ac5a1e1c49e9174fc7cb3fe"
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
    "sha256": "8a6940717dca5c8d12906b6b38feee2600d128802d7afb5ffb9b84f72a0292ce"
  },
  "./blob-store.js": {
    "sha256": "869beee9fe5502c2ad614ef9e8b3d6d452abb7ff1fbc6bcf7667dba99f083113"
  },
  "./thread-accounting.js": {
    "sha256": "94b76336b443ed31e4662f3b8fc4fc7a1a69fc94cfddbc388e7ca0d06802612c"
  },
  "./stash-bridge.js": {
    "sha256": "60b93052de741d6a28ddca4323fb8b462dbd69966c33c94fa23e01e3770d7742"
  },
  "./thread-catalogues.js": {
    "sha256": "ff0a0bd69e9fdd321b35d9fd04670413f3aa6c2a2e00fa2ba7f999bbfc7805e3"
  },
  "./home-screen.js": {
    "sha256": "eb3d8cdc5b2f0ea7ac61d32a84fe889298743d769dc3177e8a8aeb69ae2ca96d"
  },
  "./home-app.js": {
    "sha256": "6f943993b33ad8d208a7095cbcfa1496b968e82fd5672cd99041fae3af460191"
  },
  "./palette-swap.js": {
    "sha256": "4c6c38398a39f21060df3193b8cc5fa12daf0912f0d162321a7f1ec4442e39d8"
  },
  "./user-prefs.js": {
    "sha256": "0ce160604b1cee3ae8bbbf078c470fd68f2bd538c75783e7b4a4bdaffb8b1301"
  },
  "./sw-register.js": {
    "sha256": "4cc025f2bb7cad65c796f0730cb8d1cf378d88e464383b6d862d0b586df0b697"
  },
  "./creator/bundle.js": {
    "sha256": "a4b7a32b173a6ab0e7b31821b1e29da69632832b5f6fd02f2ab4161ea29bdddd"
  },
  "./creator/extras-bundle.js": {
    "sha256": "07cbb1bd4b3b0449f62166dc1eb20425d462401a5138ddd226d2afea22205386"
  },
  "./creator/import-wizard-bundle.js": {
    "sha256": "a760d937fdb36c3ede33ed7b7e1afd2c9b81a1cab4b445161e2ed9e313e8bb5b"
  },
  "./import-engine/lazy-shim.js": {
    "sha256": "8c33328438164fc2ed589b5ee8250abfcde7f59604a19e4f26add601881c62c1"
  },
  "./import-engine/ui/importErrors.js": {
    "sha256": "1e130923b21bc32251ce6902d11971903019918ddbcb56ee74d6759b52af812a"
  },
  "./import-engine/bundle.js": {
    "sha256": "3127d717941394cd826ed68607a324bc84d3d3f02def4d3943544da35b95a60a"
  },
  "./compiled/manager-app.compiled.js": {
    "sha256": "22bd933a1ca227c48cc773c20591bfdc6e229336dc419126f987b77e4a9a54b1"
  },
  "./compiled/embroidery.compiled.js": {
    "sha256": "d5dee5854794748cf4e9af900c8bc0a370020a64e111efe77dbdc596f2182382"
  },
  "./compiled/creator-main.compiled.js": {
    "sha256": "e3aa94e42bcbd58f5b6d98364230a0f385d593b5c02e880c1d28f437c5984010"
  },
  "./compiled/tracker-app.compiled.js": {
    "sha256": "65331fa43f6e60f36534663b95c3daa8e1e4f1bdc8fb21a8c9a385259ffaaf45"
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
    "sha256": "d03c8d3179d6954bad24c4f1287826af1ac5519dd306ac16f6904cf5f8e64436"
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
    "sha256": "c25619db489ac462112a2ea19e93af5f2f93dbd066591037017cc87816846854"
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
  "./pdf-chart-geometry.js": {
    "sha256": "79ffd3e8081a742a9afe37b2b4d7d94e830637c6b9cbb5d49bafa315631a32f0"
  },
  "./pdf-picture-pixels.js": {
    "sha256": "369913827119725fb7c68688b9af6f64b7a62e4742c38d92e7aa91e65bd38afa"
  },
  "./pdf-key-reader.js": {
    "sha256": "d6627e399b3aff51076d7bbe22d727ee7bac308238b111183b7d01132274bf7e"
  },
  "./pdf-raster-worker.js": {
    "sha256": "524d936a439d9395a7d93a77e6addc9c2224e3a46076f7aeb702985b740c4713"
  },
  "./pdf-importer.js": {
    "sha256": "4493eb33933ccdae11752a0005e9b8a1d3a27e5ad61964ad8fa3000e3e135892"
  },
  "./backup-restore.js": {
    "sha256": "77b3759d887dd998f80bd7da66e9f00b2641276b57cec5bf8ad895d334e151cc"
  },
  "./help-drawer.js": {
    "sha256": "be848f0058f837c2deeb6e0a6a8278dad9cd2ccc04c85e9c08f373824e63f0fc"
  },
  "./creator/pdfExport.js": {
    "sha256": "70e7b15e8bb57d00f3e71b98d82da8abbc961b6f05a859aa99bd712299417310"
  },
  "./sync-merge-helpers.js": {
    "sha256": "049bac322f42bb1b277d5681d180ac586b49d244223ac5b71a7cebb99ffbfd2c"
  },
  "./sync-attachment-codec.js": {
    "sha256": "23c363f05ddb3d40fba2ed31fc546c47201ada20ff7d4ee7e69b2245c5b041fd"
  },
  "./sync-export-scheduler.js": {
    "sha256": "9d302aef429305ff28bf6a6b08814dbdc9d405308dacd76c293253be5ccdf067"
  },
  "./sync-engine.js": {
    "sha256": "370fa4fcaef089e940de2fb853be6d2fc155a3db73ddfb5ab25e0e6aa5d5c98b"
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
    "sha256": "f47191d641e827d5199438bb404e4fe68decc2300631f7f1321b4c1bf7a482d3"
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
    "sha256": "370fc0640b77d07fd2d307d6071c822719ea7bee5721968db4e63f8ad9c963f8"
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
    "sha256": "990065428a12fd47993fcbd35413a7247d1db3e974a80afb7d745f6b17b34091"
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
    "sha256": "df5132bb7529adc91eda916b89b0330c61c274769fe4395d7501b467e1ab8f49"
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
