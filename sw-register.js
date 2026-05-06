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
    // Exception: if an image-to-Creator handoff is in progress (sessionStorage
    // contains the pending data URL), reloading right now would either bounce
    // the user back to /home (if we're still on home.html) or strip the URL
    // params and lose the image (if we're mid-load on create.html). In that
    // case we set `refreshing = true` to silence future fires but skip the
    // reload — the updated SW assets take effect on the next navigation.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        try {
          if (sessionStorage.getItem('cs_pending_image_dataurl')) return;
        } catch (_) {}
        window.location.reload();
      }
    });
  });
}
