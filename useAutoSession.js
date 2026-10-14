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
    const autoStatsRef=useRef({doneUnits:0,totalUnits:0});
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
      if(mode==='classic'||mode==='batchAware'||mode==='manual')return mode;
      try{
        var globalMode=window.UserPrefs&&window.UserPrefs.get("trackerTimingMode");
        if(globalMode==='classic'||globalMode==='batchAware'||globalMode==='manual')return globalMode;
      }catch(_){}
      return 'classic';
    }
    // Persistent milestones, session onboarding, session note toast
    const[achievedMilestones,setAchievedMilestones]=useState([]);
    const[sessionOnboardingShown,setSessionOnboardingShown]=useState(()=>{try{return !!localStorage.getItem("cs_sessionOnboardingDone");}catch(_){return false;}});
    const[sessionSavedToast,setSessionSavedToast]=useState(null);
    const isUnloadingRef=useRef(false);

    // Variables for auto-session live display
    // The running clock ticks once a second. It lives in a tiny external store, read only by the few small components
    // that draw it (LiveElapsed in tracker-app.js), so a tick re-renders those and not the Tracker and its chart.
    const elapsedStoreRef = useRef(null);
    if (!elapsedStoreRef.current) {
      const subs = new Set();
      elapsedStoreRef.current = {
        value: 0,
        set: function(v){ if (this.value === v) return; this.value = v; subs.forEach(function(f){ f(); }); },
        subscribe: function(f){ subs.add(f); return function(){ subs.delete(f); }; }
      };
    }
    const elapsedStore = elapsedStoreRef.current;
    const setLiveAutoElapsed = function(v){ elapsedStore.set(v); };
    const [liveAutoStitches, setLiveAutoStitches] = useState(0);
    const [liveAutoIsPaused, setLiveAutoIsPaused] = useState(false);
    const autoSessionDisplayTimerRef = useRef(null);
    // A session can be open with nothing marked yet (the person started the timer), so the chip and panel cannot
    // key off the stitch count: these two follow the session itself.
    const [liveSessionOpen, setLiveSessionOpen] = useState(false);
    const [liveIsTimer, setLiveIsTimer] = useState(false);
    // Set when a timer has run well past the last mark: { lastMarkT, idleMs }. The Tracker shows "Forgot to stop?".
    const [forgotStop, setForgotStop] = useState(null);

    // Manual pause/resume — state + ref mirror for shortcut handler
    const [manuallyPaused, setManuallyPaused] = useState(false);
    const manuallyPausedRef = useRef(false);

    // ═══ Auto-session recording ═══
    function getStitchingDateLocal(now){
      // Each stitch is attributed to the day it was made, by the one shared date helper (getStitchingDate in
      // helpers.js); a session that crosses the day end is saved as one record per day (see finaliseAutoSession).
      try{return getStitchingDate(now,getDayEndHour(statsSettings));}
      catch(e){const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
    }
    // Opens the session record. An automatic session starts at the first mark; a timer session (the person pressed
    // Start timer) starts now and counts the whole time it is running, minus pauses and time the tab was hidden.
    function openAutoSession(now,timer){
      currentAutoSessionRef.current={
        id:'sess_'+now,
        date:getStitchingDateLocal(now),
        startTime:new Date(now).toISOString(),
        startMs:now,
        lastMarkT:null,
        timer:!!timer,
        timingMode:timer?'manual':getTimingMode(),
        stitchesCompleted:0,
        stitchesUndone:0,
        unitsCompleted:0,
        unitsUndone:0,
        catchUp:0,
        byDay:{},
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
      setLiveSessionOpen(true);
      setLiveIsTimer(!!timer);
      setForgotStop(null);
    }
    // Start timer: only when no session is open (a session already running keeps measuring itself).
    function startTimer(){
      if(currentAutoSessionRef.current||isUnloadingRef.current)return false;
      openAutoSession(Date.now(),true);
      return true;
    }
    // "Keep going" on the forgot-to-stop prompt: ask again after another idle period.
    function snoozeForgotStop(){
      const cs=currentAutoSessionRef.current;
      if(cs){cs.forgotAsked=false;const t=getIdleThresholdMs();cs.snoozeUntil=Date.now()+Math.max(isFinite(t)?t:30*60*1000,5*60*1000);}
      setForgotStop(null);
    }
    // completedUnits / undoneUnits: the same marks in the unit progress uses (half stitch = half, see
    // progress-units.js). Callers that only mark full stitches may leave them out.
    // eventKind (optional): 'frog' for an unpicked area, so the log (and the journal) can tell it from stitching; the
    // default is 'stitch'. Either way the stitches taken out go to the session's unpicked figure, never as a negative day.
    function recordAutoActivity(completed,undone,completedUnits,undoneUnits,catchUpUnits,eventKind){
      try{
        const cu=completedUnits==null?completed:completedUnits,uu=undoneUnits==null?undone:undoneUnits;
        const now=Date.now();
        if(!currentAutoSessionRef.current){
          // Guard: don't start a new session if the tab is unloading.
          if(isUnloadingRef.current)return;
          openAutoSession(now,false);
        }
        // Auto-resume manual pause on stitch activity (stitch implies intent to continue).
        if(manuallyPausedRef.current){
          currentAutoSessionRef.current.eventLog.push({kind:'manualResume',t:now});
          manuallyPausedRef.current=false;
          setManuallyPaused(false);
        }
        // Record the stitch event (net delta for the activity burst).
        currentAutoSessionRef.current.eventLog.push(eventKind==='frog'?{kind:'frog',t:now,delta:completed-undone,n:undone,units:uu}:{kind:'stitch',t:now,delta:completed-undone});
        currentAutoSessionRef.current.lastMarkT=now;
        currentAutoSessionRef.current.forgotAsked=false;currentAutoSessionRef.current.snoozeUntil=null;setForgotStop(null);
        currentAutoSessionRef.current.stitchesCompleted+=completed;
        currentAutoSessionRef.current.stitchesUndone+=undone;
        currentAutoSessionRef.current.unitsCompleted+=cu;
        currentAutoSessionRef.current.unitsUndone+=uu;
        // What was added on which stitching day. The day only needs working out when the previous one has ended
        // (a comparison per mark, not a date calculation).
        {
          const cs=currentAutoSessionRef.current;
          if(!cs.byDay)cs.byDay={};
          if(!cs.dayBoundary||now>=cs.dayBoundary){
            const deh=getDayEndHour(statsSettings);
            cs.curDate=getStitchingDate(now,deh);
            cs.dayBoundary=nextStitchingDayBoundary(now,deh);
          }
          const bd=cs.byDay[cs.curDate]||(cs.byDay[cs.curDate]={t0:now,sc:0,su:0,uc:0,uu:0,cu:0});
          bd.sc+=completed;bd.su+=undone;bd.uc+=cu;bd.uu+=uu;
          if(catchUpUnits)bd.cu+=catchUpUnits;
        }
        // Bulk marks the person said were catch-up (not stitching done now): in progress, left out of pace.
        if(catchUpUnits)currentAutoSessionRef.current.catchUp+=catchUpUnits;
        // DEFECT-011: a flurry of undos right after enabling Live tracking can drive
        // stitchesUndone past stitchesCompleted (the undos refer to stitches done
        // in a *previous* session). Clamp the displayed counter at 0 — anything
        // negative is meaningless and would also break the "stitches active" gate
        // in the footer (`liveAutoStitches > 0`).
        setLiveAutoStitches(ProgressUnits.liveSessionAdded(currentAutoSessionRef.current));
        // Update liveAutoIsPaused from the already-live flags (manual resume above
        // may have changed it). PERF: this used to call deriveIsLogPaused(), which
        // rescans the *entire* session event log on every single stitch — an O(n)
        // cost that grows for the whole session and made marking progressively
        // slower the longer a session ran. document.hidden and manuallyPausedRef
        // are kept perfectly in sync with the log's 'hidden'/'visible'/'manualPause'/
        // 'manualResume' events elsewhere, so they're an O(1) equivalent.
        setLiveAutoIsPaused(document.hidden||manuallyPausedRef.current);
        // Merge any pending colour IDs into the session
        if(pendingColoursRef.current.size>0){
          const _cs=currentAutoSessionRef.current,_day=_cs.byDay&&_cs.byDay[_cs.curDate];
          pendingColoursRef.current.forEach(c=>{_cs.coloursWorked.add(c);if(_day)(_day.cl||(_day.cl=new Set())).add(c);});
          pendingColoursRef.current.clear();
        }
        // Arm the idle-finalise timer (session lifecycle). Only fires to close
        // the session — duration is computed from the event log, not the timer.
        clearTimeout(autoIdleTimerRef.current);
        var idleMs=getIdleThresholdMs();
        // A timer session ends when the person stops it (or says "trim" when they forgot), not by itself.
        if(isFinite(idleMs)&&!currentAutoSessionRef.current.timer){
          autoIdleTimerRef.current=setTimeout(()=>{try{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();}catch(e){}},idleMs);
        }
      }catch(e){}
    }
    // An unpicked area was put back (Undo): take it off the session's unpicked figure again, if that session is still
    // open, so that undoing it does not leave "Unpicked 80" behind or count the 80 as added. A session already closed
    // keeps what it recorded.
    function unrecordUnpick(stitches,units){
      try{
        const cs=currentAutoSessionRef.current;
        if(!cs)return false;
        cs.stitchesUndone=Math.max(0,cs.stitchesUndone-stitches);
        cs.unitsUndone=Math.max(0,cs.unitsUndone-units);
        const bd=cs.byDay&&cs.byDay[cs.curDate];
        if(bd){bd.su=Math.max(0,bd.su-stitches);bd.uu=Math.max(0,bd.uu-units);}
        cs.eventLog.push({kind:'frogUndo',t:Date.now(),n:stitches,units:units});
        setLiveAutoStitches(ProgressUnits.liveSessionAdded(cs));
        return true;
      }catch(e){return false;}
    }
    // opts (all optional): endMs, finish the session at that time (trim to the last mark); durationSeconds, the
    // minutes the person confirmed or edited when stopping the timer.
    function finaliseAutoSession(opts){
      try{
        opts=opts&&typeof opts==='object'&&!opts.nativeEvent&&!opts.target?opts:{};
        const session=currentAutoSessionRef.current;
        if(!session||session.stitchesCompleted+session.stitchesUndone===0){
          currentAutoSessionRef.current=null;
          clearTimeout(autoIdleTimerRef.current);
          manuallyPausedRef.current=false;setManuallyPaused(false);
          setLiveSessionOpen(false);setLiveIsTimer(false);setForgotStop(null);setLiveAutoIsPaused(false);setLiveAutoElapsed(0);setLiveAutoStitches(0);
          return;
        }
        // Flush any colour IDs pending between the last recordAutoActivity call and now.
        if(pendingColoursRef.current.size>0&&session.coloursWorked){
          const _day=session.byDay&&session.byDay[session.curDate];
          pendingColoursRef.current.forEach(c=>{session.coloursWorked.add(c);if(_day)(_day.cl||(_day.cl=new Set())).add(c);});
          pendingColoursRef.current.clear();
        }
        // Duration: pure function of the event log — live display and saved value
        // use the same clock. The cap credits the tail (natural dwell after the
        // last stitch) and excludes any interval longer than capMs.
        // Leaving the page or the project with a timer that has sat idle past the threshold: the person walked away
        // without stopping it, so it ends at the last mark rather than counting the time since.
        if(opts.trimIfIdle&&session.timer&&typeof opts.endMs!=='number'&&session.lastMarkT){
          const thr=getIdleThresholdMs(),limit=isFinite(thr)?thr:30*60*1000;
          if(Date.now()-session.lastMarkT>=limit)opts=Object.assign({},opts,{endMs:session.lastMarkT});
        }
        const endTimeMs=typeof opts.endMs==='number'?Math.min(Date.now(),Math.max(session.startMs||0,opts.endMs)):Date.now();
        const capMs=getActiveGapCapMs();
        const timingMode=session.timingMode||getTimingMode();
        let activeDurationMs=Math.max(0,computeActiveMs(session.eventLog,endTimeMs,capMs,timingMode));
        // How the time was measured: the timer, or worked out from the marks; the person's own figure is "edited".
        let timingBasis=session.timer?'timer':'auto';
        if(typeof opts.durationSeconds==='number'&&opts.durationSeconds>=0&&Math.abs(opts.durationSeconds*1000-activeDurationMs)>30000){
          activeDurationMs=opts.durationSeconds*1000;timingBasis='edited';
        }
        // Progress at the end of the session, in units (the Tracker keeps these two numbers current).
        const ref=autoStatsRef.current||{doneUnits:0,totalUnits:0};
        const tc=ref.doneUnits||0,ts=ref.totalUnits||0;
        const finalised={
          id:session.id,
          date:session.date,
          startTime:session.startTime,
          endTime:new Date(endTimeMs).toISOString(),
          timingModeUsed:timingMode,
          timingBasis:timingBasis,
          durationSeconds:Math.max(1,Math.round(activeDurationMs/1000)),
          durationMinutes:Math.max(1,Math.round(activeDurationMs/60000)),
          stitchesCompleted:session.stitchesCompleted,
          stitchesUndone:session.stitchesUndone,
          netStitches:session.stitchesCompleted-session.stitchesUndone,
          // The same marks in progress units; the figures that add sessions up read these (netStitches stays for
          // older readers and older sessions, which have no units).
          units:session.unitsCompleted-session.unitsUndone,
          unitsCompleted:session.unitsCompleted,
          unitsUndone:session.unitsUndone,
          ...(session.catchUp>0?{catchUp:session.catchUp}:{}),
          totalAtEnd:tc,
          percentAtEnd:ts>0?Math.round((tc/ts)*1000)/10:0,
          note:'',
          coloursWorked:session.coloursWorked?[...session.coloursWorked]:[],
        };
        if(pendingMilestonesRef.current.length>0){
          finalised.milestones=pendingMilestonesRef.current.slice();
          pendingMilestonesRef.current=[];
        }
        // One record per stitching day when the session ran across the day end; the usual case is one record.
        let records=[finalised];
        const days=session.byDay?Object.keys(session.byDay).sort():[];
        if(days.length>1){
          try{
            const deh=getDayEndHour(statsSettings);
            const bounds=days.slice(0,-1).map(d=>nextStitchingDayBoundary(session.byDay[d].t0,deh));
            const prefix=bounds.map(b=>Math.max(0,computeActiveMs(session.eventLog.filter(e=>e.t<b),b,capMs,timingMode)));
            const ms=days.map((d,i)=>i===0?prefix[0]:(i<days.length-1?prefix[i]-prefix[i-1]:activeDurationMs-prefix[i-1]));
            records=splitSessionByDays(finalised,session.byDay,ms,ts,deh);
          }catch(e){records=[finalised];}
        }else if(days.length===1){finalised.date=days[0];}
        setStatsSessions(prev=>[...(prev||[]),...records]);
        // Synchronous localStorage backup so the session survives if the tab is closed
        // before the 5-second auto-save timer fires (beforeunload IDB writes are async
        // and may not complete in time). Cleared once the auto-save timer succeeds.
        try{if(projectIdRef.current)localStorage.setItem('cs_pending_session_'+projectIdRef.current,JSON.stringify(records.length>1?records:finalised));}catch(_){}
        // Update lastTouchedAt and finishStatus in v3FieldsRef.
        // stitchLog is now derived from statsSessions in buildSnapshot() — no direct mutation needed.
        if(projectIdRef.current){
          const _now=new Date();
          const _prev=v3FieldsRef.current||{};
          const _newV3=Object.assign({},_prev,{lastTouchedAt:_now.toISOString()});
          if(_prev.finishStatus==='planned'&&ProgressUnits.sessionAdded(finalised)>0){_newV3.finishStatus='active';}
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
        setLiveSessionOpen(false);setLiveIsTimer(false);setForgotStop(null);
        // Show note prompt toast (not during page unload)
        if(!isUnloadingRef.current&&ProgressUnits.sessionAdded(finalised)>0){
          setSessionSavedToast({sessionId:finalised.id,stitches:Math.round(ProgressUnits.sessionAdded(finalised)),durationMin:finalised.durationMinutes,showNoteInput:false,noteText:''});
        }
        // The records that were saved (more than one when the run crossed the day end), for callers that merge the
        // result into their own snapshot (the unload save). Not enumerable, so it is never written out itself.
        try{Object.defineProperty(finalised,'records',{value:records,enumerable:false});}catch(_){}
        return finalised;
      }catch(e){currentAutoSessionRef.current=null;setLiveSessionOpen(false);setLiveIsTimer(false);return null;}
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
      setLiveSessionOpen(false);setLiveIsTimer(false);setForgotStop(null);
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
        // Forgot to stop? A timer that has run past the idle threshold with nothing marked, while the person is looking.
        const cs=currentAutoSessionRef.current;
        if(cs&&cs.timer&&!document.hidden&&!manuallyPausedRef.current&&!cs.forgotAsked){
          const now=Date.now(),since=cs.lastMarkT||cs.startMs||now,thr=getIdleThresholdMs();
          const limit=isFinite(thr)?thr:30*60*1000;
          if(now-since>=limit&&(!cs.snoozeUntil||now>=cs.snoozeUntil)){cs.forgotAsked=true;setForgotStop({lastMarkT:cs.lastMarkT||null,idleMs:now-since});}
        }
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

    // A changed "Day ends at" closes the running session, so what was marked before the change keeps the day it was
    // attributed to and the next mark starts a session under the new setting.
    useEffect(()=>{
      const onPref=e=>{try{if(e&&e.detail&&e.detail.key==='statsDayEndHour'&&currentAutoSessionRef.current&&finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();}catch(_){}};
      window.addEventListener('cs:prefchange',onPref);
      return()=>window.removeEventListener('cs:prefchange',onPref);
    },[]);

    var currentTimingMode=(currentAutoSessionRef.current&&currentAutoSessionRef.current.timingMode)||getTimingMode();

    return {
      statsSessions, setStatsSessions, totalTime,
      elapsedStore, liveAutoStitches, liveAutoIsPaused,
      liveSessionOpen, liveIsTimer, forgotStop, startTimer, snoozeForgotStop,
      currentTimingMode,
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
      unrecordUnpick,
      editSessionNote,
    };
  };
})();
