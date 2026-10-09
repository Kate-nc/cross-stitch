const FABRIC_COUNTS=[{ct:11,label:"11 count",inPerSt:1.27},{ct:14,label:"14 count",inPerSt:1.0},{ct:16,label:"16 count",inPerSt:0.9},{ct:18,label:"18 count",inPerSt:0.8},{ct:20,label:"20 count",inPerSt:0.72},{ct:22,label:"22 count",inPerSt:0.65},{ct:25,label:"25 count (over 2)",inPerSt:1.12,over:2},{ct:28,label:"28 count (over 2)",inPerSt:1.0,over:2},{ct:32,label:"32 count (over 2)",inPerSt:0.88,over:2}];
// Threads each stitch covers on this fabric: 2 for the evenweave/linen counts
// stitched over two (the "(over 2)" entries above), else 1. Finished size and
// thread use follow the effective count, fabricCt / stitchOverFor(fabricCt).
function stitchOverFor(ct){ct=Number(ct);for(var i=0;i<FABRIC_COUNTS.length;i++)if(FABRIC_COUNTS[i].ct===ct)return FABRIC_COUNTS[i].over||1;return 1;}
// Short fabric name for summaries: "14ct", "28ct over 2".
function fabricShortLabel(ct){return ct+"ct"+(stitchOverFor(ct)===2?" over 2":"");}
if(typeof window!=="undefined"){window.stitchOverFor=stitchOverFor;window.fabricShortLabel=fabricShortLabel;}
// Default DMC skein price in GBP
const DEFAULT_SKEIN_PRICE=0.95;

const A4W=50,A4H=75;
const CK=4;
const QUADRANTS=["TL","TR","BL","BR"];
const PARTIAL_STITCH_TYPES=["quarter","half","three-quarter"];

// Centralised localStorage key registry. See reports/code-quality-02-duplication.md.
// Reference these constants instead of hard-coding strings to keep keys in sync
// across pages and to make backup/restore audit-able.
const LOCAL_STORAGE_KEYS={
  activeProject:"crossstitch_active_project",
  globalStreak:"cs_globalStreak",
  globalGoals:"cs_global_goals",
  globalGoalsCompat:"cs_stats_settings",
  shortcutsHint:"shortcuts_hint_dismissed"
};
if(typeof window!=='undefined')window.LOCAL_STORAGE_KEYS=LOCAL_STORAGE_KEYS;
