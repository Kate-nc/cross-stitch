/* useAutoSession.js — Phase B step D: Auto-session tracking hook.
   ═══════════════════════════════════════════════════════════════════════
   Extracted from TrackerApp.  Owns all session-recording state, the
   idle-timer lifecycle, the live-elapsed display timer, and the helper
   functions recordAutoActivity / finaliseAutoSession / editSessionNote.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useAutoSession.

   Parameters
   ──────────
     projectIdRef    — ref to the current project's storage ID
     v3FieldsRef     — ref holding v3 metadata fields (updated on finalise)
     autoSaveDirtyRef — ref flagged true when a save is needed

   Returns (see bottom of function)                                       */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  window.useAutoSession = function useAutoSession({ projectIdRef, v3FieldsRef, autoSaveDirtyRef, statsSettings }) {
    var useState    = R.useState;
    var useRef      = R.useRef;
    var useEffect   = R.useEffect;
    var useMemo     = R.useMemo;

    const[statsSessions,setStatsSessions]=useState([]);
    const totalTime=useMemo(()=>{if(!statsSessions||statsSessions.length===0)return 0;return statsSessions.reduce(function(sum,s){return sum+getSessionSeconds(s);},0);},[statsSessions]);
    const[celebration,setCelebration]=useState(null);
    const celebratedRef=useRef(new Set());
    const goalCelebrationRef=useRef({daily:false,weekly:false,monthly:false});
    const currentAutoSessionRef=useRef(null);
    const pendingColoursRef=useRef(new Set());
    const pendingMilestonesRef=useRef([]);
    const autoIdleTimerRef=useRef(null);
    const prevAutoCountRef=useRef({done:0,halfDone:0});
    const justLoadedRef=useRef(false);
    const justLoadedSettlePassRef=useRef(0);
    const autoStatsRef=useRef({doneCount:0,totalStitchable:0});
    const finaliseAutoSessionRef=useRef(null);
    // Idle threshold (trackerIdleMinutes): read fresh on each timer arm so a
    // settings change applies on the next stroke without restarting the session.
    // 0 = never auto-finalise the session.
    function getIdleThresholdMs(){
      try{
        var m=window.UserPrefs&&window.UserPrefs.get("trackerIdleMinutes");
        if(m===0)return Infinity; // never auto-finalise
        if(typeof m==="number"&&m>0)return m*60*1000;
      }catch(_){}
      return 10*60*1000;
    }
    // Gap cap (trackerActiveGapCapSec): maximum dwell between stitches credited
    // as active time. Gaps longer than this contribute only capMs — natural
    // dwell (counting, rethreading) is credited; walk-away time is not. Read
    // fresh on each call so preference changes apply immediately to the live timer.
    // Clamped to [15, 600] seconds.
    function getActiveGapCapMs(){
      try{
        var s=window.UserPrefs&&window.UserPrefs.get("trackerActiveGapCapSec");
        if(typeof s==="number"&&Number.isFinite(s))return Math.min(600,Math.max(15,s))*1000;
      }catch(_){}
      return 90*1000;
    }
    function getTimingMode(){
      var mode=statsSettings&&statsSettings.timingMode;
      if(mode==='classic'||mode==='batchAware')return mode;
      try{
        var globalMode=window.UserPrefs&&window.UserPrefs.get("trackerTimingMode");
        if(globalMode==='classic'||globalMode==='batchAware')return globalMode;
      }catch(_){}
      return 'classic';
    }
    // Persistent milestones, session onboarding, session note toast
    const[achievedMilestones,setAchievedMilestones]=useState([]);
    const[sessionOnboardingShown,setSessionOnboardingShown]=useState(()=>{try{return !!localStorage.getItem("cs_sessionOnboardingDone");}catch(_){return false;}});
    const[sessionSavedToast,setSessionSavedToast]=useState(null);
    const isUnloadingRef=useRef(false);

    // Variables for auto-session live display
    const [liveAutoElapsed, setLiveAutoElapsed] = useState(0);
    const [liveAutoStitches, setLiveAutoStitches] = useState(0);
    const [liveAutoIsPaused, setLiveAutoIsPaused] = useState(false);
    const autoSessionDisplayTimerRef = useRef(null);

    // Manual pause/resume — state + ref mirror for shortcut handler
    const [manuallyPaused, setManuallyPaused] = useState(false);
    const manuallyPausedRef = useRef(false);

    // ═══ Auto-session recording ═══
    function getStitchingDateLocal(now){
      // NOTE: attribution uses local date at session-start time. Cross-midnight
      // sessions are attributed to the day they started. A future PR may revisit
      // this; do not change attribution semantics here.
      try{
        const d=new Date(now);
        const deh=(statsSettings&&statsSettings.dayEndHour)||0;
        if(deh>0&&d.getHours()<deh)d.setDate(d.getDate()-1);
        const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),day=('0'+d.getDate()).slice(-2);
        return y+'-'+m+'-'+day;
      }catch(e){const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
    }
    function recordAutoActivity(completed,undone){
      try{
        const now=Date.now();
        if(!currentAutoSessionRef.current){
          // Guard: don't start a new session if the tab is unloading.
          if(isUnloadingRef.current)return;
          currentAutoSessionRef.current={
            id:'sess_'+now,
            date:getStitchingDateLocal(now),
            startTime:new Date(now).toISOString(),
            timingMode:getTimingMode(),
            stitchesCompleted:0,
            stitchesUndone:0,
            coloursWorked:new Set(),
            // Event log: timestamped events drive all duration computation.
            eventLog:[{kind:'start',t:now}]
          };
          // Seed hidden state if the tab is already hidden when the session starts.
          if(document.hidden){
            currentAutoSessionRef.current.eventLog.push({kind:'hidden',t:now});
          }
          setLiveAutoStitches(0);
          setLiveAutoElapsed(0);
          setLiveAutoIsPaused(document.hidden);
        }
        // Auto-resume manual pause on stitch activity (stitch implies intent to continue).
        if(manuallyPausedRef.current){
          currentAutoSessionRef.current.eventLog.push({kind:'manualResume',t:now});
          manuallyPausedRef.current=false;
          setManuallyPaused(false);
        }
        // Record the stitch event (net delta for the activity burst).
        currentAutoSessionRef.current.eventLog.push({kind:'stitch',t:now,delta:completed-undone});
        currentAutoSessionRef.current.stitchesCompleted+=completed;
        currentAutoSessionRef.current.stitchesUndone+=undone;
        // DEFECT-011: a flurry of undos right after enabling Live tracking can drive
        // stitchesUndone past stitchesCompleted (the undos refer to stitches done
        // in a *previous* session). Clamp the displayed counter at 0 — anything
        // negative is meaningless and would also break the "stitches active" gate
        // in the footer (`liveAutoStitches > 0`).
        setLiveAutoStitches(Math.max(0, currentAutoSessionRef.current.stitchesCompleted-currentAutoSessionRef.current.stitchesUndone));
        // Update liveAutoIsPaused from log (manual resume above may have changed it).
        setLiveAutoIsPaused(deriveIsLogPaused(currentAutoSessionRef.current.eventLog));
        // Merge any pending colour IDs into the session
        if(pendingColoursRef.current.size>0){
          pendingColoursRef.current.forEach(c=>currentAutoSessionRef.current.coloursWorked.add(c));
          pendingColoursRef.current.clear();
        }
        // Arm the idle-finalise timer (session lifecycle). Only fires to close
        // the session — duration is computed from the event log, not the timer.
        clearTimeout(autoIdleTimerRef.current);
        var idleMs=getIdleThresholdMs();
        if(isFinite(idleMs)){
          autoIdleTimerRef.current=setTimeout(()=>{try{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();}catch(e){}},idleMs);
        }
      }catch(e){}
    }
    function finaliseAutoSession(){
      try{
        const session=currentAutoSessionRef.current;
        if(!session||session.stitchesCompleted+session.stitchesUndone===0){
          currentAutoSessionRef.current=null;
          return;
        }
        // Flush any colour IDs pending between the last recordAutoActivity call and now.
        if(pendingColoursRef.current.size>0&&session.coloursWorked){
          pendingColoursRef.current.forEach(c=>session.coloursWorked.add(c));
          pendingColoursRef.current.clear();
        }
        // Duration: pure function of the event log — live display and saved value
        // use the same clock. The cap credits the tail (natural dwell after the
        // last stitch) and excludes any interval longer than capMs.
        const endTimeMs=Date.now();
        const capMs=getActiveGapCapMs();
        const timingMode=session.timingMode||getTimingMode();
        const activeDurationMs=Math.max(0,computeActiveMs(session.eventLog,endTimeMs,capMs,timingMode));
        const ref=autoStatsRef.current||{doneCount:0,totalStitchable:0};
        const tc=ref.doneCount||0,ts=ref.totalStitchable||0;
        const finalised={
          id:session.id,
          date:session.date,
          startTime:session.startTime,
          endTime:new Date(endTimeMs).toISOString(),
          timingModeUsed:timingMode,
          durationSeconds:Math.max(1,Math.round(activeDurationMs/1000)),
          durationMinutes:Math.max(1,Math.round(activeDurationMs/60000)),
          stitchesCompleted:session.stitchesCompleted,
          stitchesUndone:session.stitchesUndone,
          netStitches:session.stitchesCompleted-session.stitchesUndone,
          totalAtEnd:tc,
          percentAtEnd:ts>0?Math.round((tc/ts)*1000)/10:0,
          note:'',
          coloursWorked:session.coloursWorked?[...session.coloursWorked]:[],
        };
        if(pendingMilestonesRef.current.length>0){
          finalised.milestones=pendingMilestonesRef.current.slice();
          pendingMilestonesRef.current=[];
        }
        setStatsSessions(prev=>[...(prev||[]),finalised]);
        // Synchronous localStorage backup so the session survives if the tab is closed
        // before the 5-second auto-save timer fires (beforeunload IDB writes are async
        // and may not complete in time). Cleared once the auto-save timer succeeds.
        try{if(projectIdRef.current)localStorage.setItem('cs_pending_session_'+projectIdRef.current,JSON.stringify(finalised));}catch(_){}
        // Update lastTouchedAt and finishStatus in v3FieldsRef.
        // stitchLog is now derived from statsSessions in buildSnapshot() — no direct mutation needed.
        if(projectIdRef.current){
          const _now=new Date();
          const _prev=v3FieldsRef.current||{};
          const _newV3=Object.assign({},_prev,{lastTouchedAt:_now.toISOString()});
          if(_prev.finishStatus==='planned'&&finalised.netStitches>0){_newV3.finishStatus='active';}
          v3FieldsRef.current=_newV3;
          autoSaveDirtyRef.current=true;
          if(typeof invalidateStatsCache==='function')invalidateStatsCache();
        }
        currentAutoSessionRef.current=null;
        clearTimeout(autoIdleTimerRef.current);
        // Clear pause state synchronously so the display timer doesn't see stale state.
        manuallyPausedRef.current=false;
        setManuallyPaused(false);
        setLiveAutoIsPaused(false);
        setLiveAutoElapsed(0);
        setLiveAutoStitches(0);
        // Show note prompt toast (not during page unload)
        if(!isUnloadingRef.current&&finalised.netStitches>0){
          setSessionSavedToast({sessionId:finalised.id,stitches:finalised.netStitches,durationMin:finalised.durationMinutes,showNoteInput:false,noteText:''});
        }
        return finalised;
      }catch(e){currentAutoSessionRef.current=null;return null;}
    }
    finaliseAutoSessionRef.current=finaliseAutoSession;

    function resetAutoSessionForProjectLoad(){
      currentAutoSessionRef.current=null;
      clearTimeout(autoIdleTimerRef.current);
      pendingColoursRef.current.clear();
      pendingMilestonesRef.current=[];
      manuallyPausedRef.current=false;
      setManuallyPaused(false);
      setLiveAutoIsPaused(false);
      setLiveAutoElapsed(0);
      setLiveAutoStitches(0);
      setSessionSavedToast(null);
    }

    useEffect(() => {
      function handleVisibilityChange() {
        const isHidden = document.hidden;
        if (currentAutoSessionRef.current) {
          // Push visibility event to the log — computeActiveMs will exclude the
          // hidden span automatically. No separate totalPausedMs accounting needed.
          currentAutoSessionRef.current.eventLog.push({kind: isHidden ? 'hidden' : 'visible', t: Date.now()});
        }
        // Update liveAutoIsPaused (hidden overrides any other state for UI).
        setLiveAutoIsPaused(isHidden || manuallyPausedRef.current);
      }
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    useEffect(() => {
      autoSessionDisplayTimerRef.current = setInterval(() => {
        if (!currentAutoSessionRef.current) return;
        // computeActiveMs uses the same algorithm as finaliseAutoSession — the live
        // display and the saved value agree by construction (±1 s from rounding).
        const elapsedMs = computeActiveMs(
          currentAutoSessionRef.current.eventLog,
          Date.now(),
          getActiveGapCapMs(),
          currentAutoSessionRef.current.timingMode || getTimingMode()
        );
        setLiveAutoElapsed(Math.floor(elapsedMs / 1000));
      }, 1000);
      return () => clearInterval(autoSessionDisplayTimerRef.current);
    }, []);

    // Session onboarding toast: auto-dismiss after 8s (only for very first session ever)
    useEffect(()=>{
      if(!sessionOnboardingShown&&liveAutoStitches>0&&statsSessions.length===0){
        const timer=setTimeout(()=>{setSessionOnboardingShown(true);try{localStorage.setItem("cs_sessionOnboardingDone","1");}catch(_){}},8000);
        return()=>clearTimeout(timer);
      }
    },[sessionOnboardingShown,liveAutoStitches,statsSessions.length]);
    // Session saved toast: auto-dismiss after 10s (unless note input is open)
    useEffect(()=>{
      if(!sessionSavedToast||sessionSavedToast.showNoteInput)return;
      const timer=setTimeout(()=>setSessionSavedToast(null),10000);
      return()=>clearTimeout(timer);
    },[sessionSavedToast]);

    function editSessionNote(sessionId,noteText){
      try{setStatsSessions(prev=>(prev||[]).map(s=>s.id===sessionId?Object.assign({},s,{note:noteText}):s));}catch(e){}
      // Flush immediately so a tab close before the next auto-save doesn't lose the edit
      setTimeout(function(){
        if(typeof window.__flushProjectToIDB==='function'){
          var flushPromise=window.__flushProjectToIDB();
          if(flushPromise&&typeof flushPromise.catch==='function')flushPromise.catch(function(){});
        }
      },0);
    }

    return {
      statsSessions, setStatsSessions, totalTime,
      liveAutoElapsed, liveAutoStitches, liveAutoIsPaused,
      manuallyPaused, setManuallyPaused, manuallyPausedRef,
      celebration, setCelebration, celebratedRef, goalCelebrationRef,
      currentAutoSessionRef, finaliseAutoSessionRef,
      resetAutoSessionForProjectLoad,
      pendingColoursRef, pendingMilestonesRef,
      prevAutoCountRef, justLoadedRef, justLoadedSettlePassRef, autoStatsRef,
      isUnloadingRef,
      achievedMilestones, setAchievedMilestones,
      sessionOnboardingShown, setSessionOnboardingShown,
      sessionSavedToast, setSessionSavedToast,
      recordAutoActivity,
      editSessionNote,
    };
  };
})();
