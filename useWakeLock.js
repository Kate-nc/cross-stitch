/* useWakeLock.js — Phase B step A: Wake-lock management hook.
   ════════════════════════════════════════════════════════════
   Extracted from TrackerApp. Manages the WakeLockSentinel that keeps
   the screen on while the user is stitching.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useWakeLock.

   API
   ───
     const { wakeLockActive, toggleWakeLock, keepAwakeOnMark } = window.useWakeLock();

     wakeLockActive  — boolean, true while the sentinel is held
     toggleWakeLock  — async function, acquires or releases the lock and
                       persists the preference to window.UserPrefs
     keepAwakeOnMark — call on every mark: takes the lock in Automatic mode on
                       a touch screen, restarts the 15-minute idle release

   trackerWakeLock: "auto" (default) | "always" | "never"; true is read as
   "always", false as "auto".                                           */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  // The stored preference, whatever an older build wrote: true (the chip left on) is "always", "never" is explicit,
  // everything else (the old default false, unset, anything unknown) is "auto".
  function wakeLockMode(v) {
    if (v === true || v === 'always') return 'always';
    if (v === 'never') return 'never';
    return 'auto';
  }
  // A touch screen: a phone or tablet, where the screen sleeping mid-row is the problem. A computer keeps what it had.
  function isTouchScreen() {
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (_) { return false; }
  }
  var IDLE_RELEASE_MS = 15 * 60 * 1000;   // a phone left on the table does not stay lit for ever

  window.useWakeLock = function useWakeLock() {
    var useRef      = R.useRef;
    var useState    = R.useState;
    var useCallback = R.useCallback;
    var useEffect   = R.useEffect;

    // Holds the WakeLockSentinel returned by navigator.wakeLock.request when active.
    const wakeLockRef=useRef(null);
    const wantRef=useRef(false);      // true while the screen should be kept on: re-acquired when the tab is visible again
    const idleRef=useRef(null);
    const[wakeLockActive,setWakeLockActive]=useState(false);
    const supported=()=>typeof navigator!=='undefined'&&!!navigator.wakeLock&&!!navigator.wakeLock.request;
    const clearIdle=()=>{if(idleRef.current){clearTimeout(idleRef.current);idleRef.current=null;}};
    const releaseWakeLock=useCallback(async()=>{
      wantRef.current=false;clearIdle();
      const s=wakeLockRef.current;wakeLockRef.current=null;   // cleared first: its release event must not look like a lost lock
      if(s){try{await s.release();}catch(_){}}
      setWakeLockActive(false);
    },[]);
    const acquireWakeLock=useCallback(async()=>{
      try{
        if(!supported())return false;
        const sentinel=await navigator.wakeLock.request('screen');
        wakeLockRef.current=sentinel;
        wantRef.current=true;
        setWakeLockActive(true);
        sentinel.addEventListener&&sentinel.addEventListener('release',()=>{if(wakeLockRef.current===sentinel){setWakeLockActive(false);wakeLockRef.current=null;}});   // the browser took it (tab hidden): wantRef stays, so it comes back
        return true;
      }catch(_){setWakeLockActive(false);return false;}
    },[]);
    const armIdle=()=>{clearIdle();idleRef.current=setTimeout(()=>{releaseWakeLock();},IDLE_RELEASE_MS);};
    const toggleWakeLock=useCallback(async()=>{
      if(wakeLockActive){
        await releaseWakeLock();
        try{if(window.UserPrefs)window.UserPrefs.set('trackerWakeLock','never');}catch(_){}
      }else{
        const ok=await acquireWakeLock();
        try{if(window.UserPrefs)window.UserPrefs.set('trackerWakeLock',ok?'always':'auto');}catch(_){}
        if(ok)armIdle();
        else{try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"This browser cannot keep the screen on.",type:"warning"});}catch(_){}}
      }
    },[wakeLockActive,acquireWakeLock,releaseWakeLock]);

    // Called on every mark. In Automatic mode on a touch screen the first mark of a session takes the lock (once, with
    // a message saying so and how to stop it); every mark restarts the idle clock. Never means never.
    const keepAwakeOnMark=useCallback(async()=>{
      let mode='auto';
      try{mode=wakeLockMode(window.UserPrefs&&window.UserPrefs.get('trackerWakeLock'));}catch(_){}
      if(mode==='never'||!supported())return;
      if(wakeLockRef.current){armIdle();return;}
      if(mode==='auto'&&!isTouchScreen())return;
      const ok=await acquireWakeLock();
      if(!ok)return;
      armIdle();
      try{
        if(!localStorage.getItem('cs_wakelock_told')){
          localStorage.setItem('cs_wakelock_told','1');
          if(window.Toast&&window.Toast.show)window.Toast.show({
            message:"Keeping the screen on while you stitch.", type:"info", duration:9000,
            actions:[{label:"Turn off",onClick:()=>{releaseWakeLock();try{window.UserPrefs.set('trackerWakeLock','never');}catch(_){}}}]
          });
        }
      }catch(_){}
    },[acquireWakeLock,releaseWakeLock]);

    useEffect(()=>{
      let cancelled=false;
      try{
        // "Always" (the chip left on in an older build, or chosen in Preferences) takes the lock as the Tracker opens.
        if(wakeLockMode(window.UserPrefs&&window.UserPrefs.get('trackerWakeLock'))==='always'){
          acquireWakeLock().then(ok=>{if(cancelled&&ok)releaseWakeLock();else if(ok)armIdle();});
        }
      }catch(_){}
      function onVis(){
        if(document.visibilityState==='visible'&&wantRef.current&&!wakeLockRef.current)acquireWakeLock();
      }
      document.addEventListener('visibilitychange',onVis);
      return()=>{cancelled=true;document.removeEventListener('visibilitychange',onVis);releaseWakeLock();};
    },[acquireWakeLock,releaseWakeLock]);

    return { wakeLockActive, toggleWakeLock, keepAwakeOnMark };
  };
  window.useWakeLock.mode = wakeLockMode;
})();
