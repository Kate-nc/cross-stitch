const FABRIC_COUNTS=[{ct:14,label:"14 count",inPerSt:1.0},{ct:16,label:"16 count",inPerSt:0.9},{ct:18,label:"18 count",inPerSt:0.8},{ct:20,label:"20 count",inPerSt:0.72},{ct:22,label:"22 count",inPerSt:0.65},{ct:28,label:"28 count (over 2)",inPerSt:1.0}];
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
