if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered, scope:', reg.scope);
        // Periodically check for a new SW so users on long-lived tabs pick up deploys.
        setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
      })
      .catch(err => console.error('SW registration failed:', err));
  });
}
