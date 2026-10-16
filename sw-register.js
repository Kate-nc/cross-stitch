if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered, scope:', reg.scope);
        // A validated update waits until ALL app tabs close. Never reload an
        // editing/stitching session or send a skipWaiting message.
        setInterval(() => { reg.update().catch(() => {}); }, 10 * 60 * 1000);
      })
      .catch(err => console.error('SW registration failed:', err));
  });
}
