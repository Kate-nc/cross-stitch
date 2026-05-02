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
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
