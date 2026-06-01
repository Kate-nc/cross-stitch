/* useWakeLock.js — Phase B step A: Wake-lock management hook.
   ════════════════════════════════════════════════════════════
   Extracted from TrackerApp. Manages the WakeLockSentinel that keeps
   the screen on while the user is stitching.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useWakeLock.

   API
   ───
     const { wakeLockActive, toggleWakeLock } = window.useWakeLock();

     wakeLockActive  — boolean, true while the sentinel is held
     toggleWakeLock  — async function, acquires or releases the lock and
                       persists the preference to window.UserPrefs         */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  window.useWakeLock = function useWakeLock() {
    var useRef      = R.useRef;
    var useState    = R.useState;
    var useCallback = R.useCallback;
    var useEffect   = R.useEffect;

    // ── Phase 4 (UX-12) — wake-lock chip ──
    // Holds the WakeLockSentinel returned by navigator.wakeLock.request when active.
    // Re-acquired on next session if the user previously toggled it on (UserPrefs).
    const wakeLockRef=useRef(null);
    const[wakeLockActive,setWakeLockActive]=useState(false);
    const releaseWakeLock=useCallback(async()=>{
      if(wakeLockRef.current){try{await wakeLockRef.current.release();}catch(_){}wakeLockRef.current=null;}
      setWakeLockActive(false);
    },[]);
    const acquireWakeLock=useCallback(async()=>{
      try{
        if(typeof navigator==='undefined'||!navigator.wakeLock||!navigator.wakeLock.request)return false;
        const sentinel=await navigator.wakeLock.request('screen');
        wakeLockRef.current=sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener&&sentinel.addEventListener('release',()=>{setWakeLockActive(false);wakeLockRef.current=null;});
        return true;
      }catch(_){setWakeLockActive(false);return false;}
    },[]);
    const toggleWakeLock=useCallback(async()=>{
      if(wakeLockActive){
        await releaseWakeLock();
        try{if(window.UserPrefs)window.UserPrefs.set('trackerWakeLock',false);}catch(_){}
      }else{
        const ok=await acquireWakeLock();
        try{if(window.UserPrefs)window.UserPrefs.set('trackerWakeLock',!!ok);}catch(_){}
        if(!ok){try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"Screen wake-lock not available on this browser.",type:"warn"});}catch(_){}}
      }
    },[wakeLockActive,acquireWakeLock,releaseWakeLock]);
    useEffect(()=>{
      let cancelled=false;
      try{
        const want=window.UserPrefs&&window.UserPrefs.get('trackerWakeLock');
        if(want){acquireWakeLock().then(ok=>{if(cancelled&&ok)releaseWakeLock();});}
      }catch(_){}
      function onVis(){
        if(document.visibilityState==='visible'){
          try{const want=window.UserPrefs&&window.UserPrefs.get('trackerWakeLock');if(want&&!wakeLockRef.current)acquireWakeLock();}catch(_){}
        }
      }
      document.addEventListener('visibilitychange',onVis);
      return()=>{cancelled=true;document.removeEventListener('visibilitychange',onVis);releaseWakeLock();};
    },[acquireWakeLock,releaseWakeLock]);

    return { wakeLockActive, toggleWakeLock };
  };
})();
