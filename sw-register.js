if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered, scope:', reg.scope);
        // Check for a new SW every 10 minutes so open tabs pick up deploys quickly.
        setInterval(() => { reg.update().catch(() => {}); }, 10 * 60 * 1000);
      })
      .catch(err => console.error('SW registration failed:', err));

    // When a new SW activates and calls clients.claim() the controllerchange
    // event fires on this page's serviceWorker container. At that point the
    // old SW's cached assets are still loaded in memory, so we need one reload
    // to get the freshly-deployed files. The `refreshing` guard prevents a
    // reload loop if the event fires more than once (e.g., rapid deployments).
    //
    // Exception 1 (first install): if there was no previous SW controller,
    // the page assets were just fetched fresh from the network — there is
    // nothing stale to reload away. Reloading here would dismiss any open
    // file-picker dialogs (e.g. the home.html "New from pattern file" input),
    // causing the "interface flashes back to homepage" bug on a brand-new
    // first visit. On subsequent SW updates hadController will be true and
    // the normal reload path applies.
    //
    // Exception 2: if an image-to-Creator handoff is in progress (sessionStorage
    // contains the pending data URL), reloading right now would either bounce
    // the user back to /home (if we're still on home.html) or strip the URL
    // params and lose the image (if we're mid-load on create.html). In that
    // case we set `refreshing = true` to silence future fires but skip the
    // reload — the updated SW assets take effect on the next navigation.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        // First-install: assets are already fresh — no reload needed.
        if (!hadController) return;
        try {
          if (sessionStorage.getItem('cs_pending_image_dataurl')) return;
        } catch (_) {}
        // Also skip the reload if a new-blank (scratch) or other creator
        // action is in-flight: processPendingAction() strips the ?action=
        // query param before React mounts, so a reload here would land on
        // create.html with no action and no active project, causing the
        // defensive redirect to bounce the user back to /home.
        if (window.__pendingCreatorAction) return;
        // processPendingAction() set this when it reconstructed a
        // home-image-pending file. It is intentionally never cleared so the
        // guard holds even after useProjectIO.js has consumed
        // __pendingCreatorFile and removed the sessionStorage keys — the
        // race that caused a first-visit SW-activation reload to bounce the
        // user back to /home.
        if (window.__creatorImageHandoffActive) return;
        window.location.reload();
      }
    });
  });
}
