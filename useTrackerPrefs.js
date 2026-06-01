/* useTrackerPrefs.js — Phase B step B: Tracker preference state hook.
   ════════════════════════════════════════════════════════════════════
   Extracted from TrackerApp. Holds the three "project-level settings"
   that are loaded by processLoadedProject and saved via buildSnapshot.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useTrackerPrefs.

   API
   ───
     const { skeinPrice, setSkeinPrice,
             stitchSpeed, setStitchSpeed,
             statsSettings, setStatsSettings } = window.useTrackerPrefs(); */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  window.useTrackerPrefs = function useTrackerPrefs() {
    var useState = R.useState;

    const[skeinPrice,setSkeinPrice]=useState(typeof DEFAULT_SKEIN_PRICE!=='undefined'?DEFAULT_SKEIN_PRICE:0.95);
    const[stitchSpeed,setStitchSpeed]=useState(40);
    const[statsSettings,setStatsSettings]=useState({dailyGoal:null,weeklyGoal:null,monthlyGoal:null,targetDate:null,dayEndHour:0,stitchingSpeedOverride:null,useActiveDays:true});

    return { skeinPrice, setSkeinPrice, stitchSpeed, setStitchSpeed, statsSettings, setStatsSettings };
  };
})();
