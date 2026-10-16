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
  './stash-bridge.js',

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
var BUILD_ID = "3add084e5ea6db0927a4401303ab388c443b5db94c057d4dacc1903ebd18c680";
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
  "./stash-bridge.js",
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
  "./assets/fonts/CrossStitchSymbols.base64.js",
  "./assets/fonts/CrossStitchSymbols.ttf",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs",
  "./keyboard-utils.js",
  "./shortcuts.js",
  "./components/PartialStitchThumb.js",
  "./components/Overlay.js",
  "./onboarding-wizard.js",
  "./beads.js",
  "./apply-prefs.js",
  "./touch-constants.js",
  "./toast.js",
  "./command-palette.js",
  "./preferences-modal.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "./coaching.js",
  "./project-library.js",
  "./insights-engine.js",
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
    "sha256": "04b93fe5c9778b48793f7631985f29af43fdec8d7b5ec2ff17ab78a3f71cbf53"
  },
  "./index.html": {
    "sha256": "904ffc9705322c603cd2bd1ba2dd2c7189d00fe28cd14c08254d01a6fc493979"
  },
  "./create.html": {
    "sha256": "3dde24831a48846642f5f84d7389d5a6f1e02c068d12e0ce875291c54741ee3d"
  },
  "./stitch.html": {
    "sha256": "075964a14f0939e9ffc3908f48ebaf73bef7ff28cb8071d228c95320071c8845"
  },
  "./manager.html": {
    "sha256": "b63057a489e9ca15119ed706eeb8d96aa396f12375670f45ca8c647c7163da49"
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
    "sha256": "b9ce76b86bf5f2f78b7d90782efd049250ee400eadaf3d4130cd414a02fca803"
  },
  "./version.js": {
    "sha256": "f24a502c788ddf7688d1f4077541220dfb400344afc2afd6d3ce456560ead063"
  },
  "./runtime-loaders.js": {
    "sha256": "4da10789a50dffe2450aebb36efa5dbdb7fc537e922f87748bd21947c202a1a1"
  },
  "./lazy-modules.js": {
    "sha256": "aedb4ee3af7c1f93723612c4cb5bb9a96df558dc1b339b00caa578c496204cb1"
  },
  "./export-pdf.js": {
    "sha256": "cbd147bf6685b5a3b8e36c32091c918f6eefc46d96dc18f7dc620f06f5499937"
  },
  "./constants.js": {
    "sha256": "5ce6443ccc9c61836303ab56482d4e6bcc6f08d959c0a2748f53d66ed33ab6cb"
  },
  "./dmc-data.js": {
    "sha256": "29cca45b43a7b98dac3d4b02b1e7110b35c675b9c819fd0f68587b9c37abad7a"
  },
  "./anchor-data.js": {
    "sha256": "7dadc9b0943e5da7ee6f86f81a1ba30056cc869f6c47fef3674d7ddff11d1853"
  },
  "./thread-conversions.js": {
    "sha256": "2247308f0d986d05904e4cdefe9e0b460506c3920ff5f8f7d99c6004be313f24"
  },
  "./starter-kits.js": {
    "sha256": "5b0d7792c6a6759211b8db8c2e611a0da3fbc4ee0d8c7fc87efa698f1da6c2b3"
  },
  "./colour-utils.js": {
    "sha256": "2d9b2e649162332cf162f932e6b61f83c49a8ae9a035e55da527cb9d7ecbcebc"
  },
  "./helpers.js": {
    "sha256": "3318bef5c95549ec0aeb0dc455b2eaacf09cdfa8b2225dd666cc19aa48f155c5"
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
    "sha256": "5878ffd2a1e7cdfecd35d38a5033a63277558cb4fdde6641d7ff8f987c3a87b9"
  },
  "./icons.js": {
    "sha256": "3a0a2ba9bd9d707ab6fd814504708b5184f6d243626a5106ec8a1d8af6fdc36f"
  },
  "./import-formats.js": {
    "sha256": "c29ca83916ba1b6d699eb7b5a08ea21ba0c73fd87abfc09d4c32ea343b8d4200"
  },
  "./components.js": {
    "sha256": "6be29e98a07ef9ce61c9885f5d375bb82821d8e493211c9d14904e4f002550bc"
  },
  "./components-stats.js": {
    "sha256": "87574f12830fa32aebe24ddbc5732c4614f99b79f91f3faa5469188e9cdd3355"
  },
  "./navigation.js": {
    "sha256": "ee35e3e194037dc9bdc9c74591fd4945db28fe3df53aea0398e9703f768fb0f8"
  },
  "./header.js": {
    "sha256": "06f8419ca57606f884ff4825ec9d4c0031513353ef7bf43692620bbed7a23560"
  },
  "./modals.js": {
    "sha256": "94e4c4dcff8e7cb0ecf5f8277ee34d7ee5431f8bbaa7349f83ab850abe743819"
  },
  "./threadCalc.js": {
    "sha256": "c8edb90a753668b7580af829970c9ac8ee93d4666b71c852185a9ba8f7b39425"
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
    "sha256": "bde17b0f3e8002fa29d732c52efd84962490b9dedb89ed062dd191f5db7e65bf"
  },
  "./creator/SpecialtyStitchPanel.js": {
    "sha256": "ee290e9f8fda8595302704b1ba85acbecef07d0e1282b038aea79c34e6bd822d"
  },
  "./project-storage.js": {
    "sha256": "47c225d256c20c451bede36109b8340767308b5af7c08c4651c65084735347f0"
  },
  "./blob-store.js": {
    "sha256": "af2ba20b5d4298aea36b5d45dd635e9351c8d2675a8964d01e92445eba5a9d0b"
  },
  "./stash-bridge.js": {
    "sha256": "29029b0eaa19257f1946adbf86a0cbcdc06cf87ed31a90cee31390d4da056333"
  },
  "./home-screen.js": {
    "sha256": "4865ccc78f9ae02725d76541abe829364117ddfc45a722f41b4f194825b743f5"
  },
  "./home-app.js": {
    "sha256": "d2031b74ee6f8480569042f7f0ef30e46286d41d815fbd534bde2a2472cabace"
  },
  "./palette-swap.js": {
    "sha256": "c52d0d7b1d05884fb409f498835f735e04b85c54e07ec6136d742889171b6ab5"
  },
  "./user-prefs.js": {
    "sha256": "9a53e1adc56e2c8c39de3470fa839b41e8c6e4a77e6f07af81dfc1719405cd9f"
  },
  "./sw-register.js": {
    "sha256": "4cc025f2bb7cad65c796f0730cb8d1cf378d88e464383b6d862d0b586df0b697"
  },
  "./creator/bundle.js": {
    "sha256": "5246524790859fceb512a4dbccadd3b4f6950d4ada3d6586decdfa0d61c8495b"
  },
  "./creator/extras-bundle.js": {
    "sha256": "564bb829e451b715611c8ac017eda3634f29715544ed06d7888b8cf9c04a5bf8"
  },
  "./creator/import-wizard-bundle.js": {
    "sha256": "d0399142a717ce58705e4d94071a364a34c830d5de4704df90ad8814d023d1a4"
  },
  "./import-engine/lazy-shim.js": {
    "sha256": "8c33328438164fc2ed589b5ee8250abfcde7f59604a19e4f26add601881c62c1"
  },
  "./import-engine/ui/importErrors.js": {
    "sha256": "961930b8928dd85c4895c45c490978566605ccad0b6393e3f0c87f648bac998b"
  },
  "./import-engine/bundle.js": {
    "sha256": "68853bf4f0965d42ee8e9d790b9ebf25e955dcfb343a2823785ed85b9e40e226"
  },
  "./compiled/manager-app.compiled.js": {
    "sha256": "c5eac7e94eb545fc333ba8bc2f4bc9f216be6b76e80f80baf26e14188ad4f6fc"
  },
  "./compiled/embroidery.compiled.js": {
    "sha256": "d5dee5854794748cf4e9af900c8bc0a370020a64e111efe77dbdc596f2182382"
  },
  "./compiled/creator-main.compiled.js": {
    "sha256": "8cf07d4d72db61afec40195e27847dc8d494b48190b3301d67c7dae13c51d645"
  },
  "./compiled/tracker-app.compiled.js": {
    "sha256": "044407f9b66243c08421d02e55e0970c979cf43c2e40a2acd965260e6f62a6b3"
  },
  "./stats-activity.js": {
    "sha256": "3f05b3da0477cb23b1084e4f298a97fc79456f1b53e949da1f0a967e905f203b"
  },
  "./stats-insights.js": {
    "sha256": "23ed854586fbd814a7ab9886fbd019f9b278a8a71f0a85ecb7d1acbad4e116bc"
  },
  "./stats-page.js": {
    "sha256": "a0bbb8c1f0034f42b40ccd0ad6c9bccbf8c0da01c23ec24366c4ba708ab5e988"
  },
  "./analysis-worker.js": {
    "sha256": "a0d3b9526ec89bef46ff8d716915854502b25aab8885583811080e37cf04ef7b"
  },
  "./generate-worker.js": {
    "sha256": "9069ad1616fd4a6a06f1a0ef612d9b48dae863272671db4df0d979486744570c"
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
    "sha256": "ae6d938f9a1dd566c8e85362b680e7df13e423d637b3f521d07bf3945c6b448b"
  },
  "./useTrackerPrefs.js": {
    "sha256": "a98820e7e907e46216ac3b3f2f213658b7a96b1b481ebf1309dc55724fa1f52c"
  },
  "./useCanvasOverlays.js": {
    "sha256": "d91e9a8c973f2528fb5acc503899670a01096362d82a476b52142c7d72d78726"
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
    "sha256": "c437b4e471e64461850631c12fa32d58e2a9ddc23b0f3a8f6791948bb7bc4c85"
  },
  "./backup-restore.js": {
    "sha256": "93da9089512e07567f993ac1f67939ed354e340d45818f3a7083c568c7042948"
  },
  "./help-drawer.js": {
    "sha256": "c0a86bca6ba61e903cefe224714dad37d1c4485f3115d962b54dab2457c17469"
  },
  "./creator/pdfExport.js": {
    "sha256": "46414465a6cffaf8cef430542fdeadf8de9a892110abdea6ecd2b16ea0fe67f8"
  },
  "./sync-engine.js": {
    "sha256": "78cac1030f6ee78f06405eb9770558e54b82900cb0be8be5f7fb3205e9f2aa1a"
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
  "./keyboard-utils.js": {
    "sha256": "d77c394b89e429281a3389e5e224269ce446c0b8c7638dca1343d5af0ec8b225"
  },
  "./shortcuts.js": {
    "sha256": "ad4903cbca3cc671aa93adbc627b95782571c17a82b306fd0922477d0d36f8af"
  },
  "./components/PartialStitchThumb.js": {
    "sha256": "b42bf0c83c6a7a91d822b5700a7e150a10ade794a1cb8da926e0f96a94c5ec47"
  },
  "./components/Overlay.js": {
    "sha256": "a4b13aa1bb0c285920f0cb56548e93acc085d0d86be3054e45254adb067903bc"
  },
  "./onboarding-wizard.js": {
    "sha256": "db7464a12c2d198fd51041f2d39dceca67c5f07f8d12448c91dfd4b9569057f8"
  },
  "./beads.js": {
    "sha256": "c7a295f9184daf1f8bf528cdfcff36e3808e772f7feca278ab5616e282574641"
  },
  "./apply-prefs.js": {
    "sha256": "a8346e4d9ed2ee8d74714f8bf048a3a53365e195c620eb5473e5af35a7801c62"
  },
  "./touch-constants.js": {
    "sha256": "433afbd8694f3fb578720e92da0510d29d36813b71ac0a88c297849657c5f520"
  },
  "./toast.js": {
    "sha256": "1ed7c8d9f5795de5f1aaceeabe611f72643b19d8ad3d95a49aef08f5c87bfd17"
  },
  "./command-palette.js": {
    "sha256": "ac8d88798eca15a112cf0f745363d7b36765ad7777c45e4c208a4fc73ad91751"
  },
  "./preferences-modal.js": {
    "sha256": "fe9870fce2dbdb451ef6b309deb043dabba2b547a1749f1959eff8dd842751df"
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
  "./creator/BulkAddModal.js": {
    "sha256": "fb451bb1b4ee3da26650e9bdb33e0be69bf71a81922b69300b7ae4da12a21f99"
  },
  "./embroidery.html": {
    "sha256": "4e15ffe8ab6705fac85bcdbe19b5ea11fedc371152be5461e12e1aaa93fcf70c"
  },
  "./embroidery.js": {
    "sha256": "ec2e4ea674fd96cd02f301428d997919fbe0db858247f21b31ea9e6c07a98577"
  },
  "./assets/fontkit.umd.min.js": {
    "sha256": "d8df561b9fba98e24f2e5130e40948809281bbbc55a20c412359f1a0a5eb35a6"
  },
  "./pdf-export-worker.js": {
    "sha256": "f1cc092de20aac597ac46e340f41ab02cd838a5fbf311b962387018e16c6030a"
  },
  "./creator/symbolFontSpec.js": {
    "sha256": "a2a4de6283f67446424538e7ee83e10d8ae76f0c379b3ba8bdbbac27d6ca5e69"
  },
  "./creator/pdfChartLayout.js": {
    "sha256": "36b5c2bc25a1ee8ca599a7d51e780e873eb99c98bcafd13b4995db11f04a4e23"
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
