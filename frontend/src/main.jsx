import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

if (document.body) {
  document.body.style.backgroundColor = '#0f1117';
  document.body.style.color = '#e8eaf0';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the service worker (offline queueing for check-ins/meter
// readings, cached property/unit listings — see public/sw.js for exactly
// what it does and does not cache). Production builds only: registering
// it against the Vite dev server would have it intercept and cache
// dev-mode module requests, breaking HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // BUG FIX: the service worker's offline queue (visitor check-ins,
      // meter readings taken with no signal) was never actually being
      // replayed — nothing here ever registered Background Sync, and
      // that API isn't supported on iOS Safari at all regardless. Use
      // Background Sync where available, and always also message the
      // worker directly on reconnect and once on load — the message
      // handler in sw.js drains the queue either way, so mobile users
      // on any browser actually get their queued offline actions synced
      // once they're back online, not silently stuck forever.
      const requestReplay = () => {
        navigator.serviceWorker.controller?.postMessage({ type: 'REPLAY_QUEUE' });
        if ('sync' in reg) reg.sync.register('snp-sync').catch(() => {});
      };
      window.addEventListener('online', requestReplay);
      requestReplay(); // in case items were queued and we're already online
    }).catch(err => {
      // Non-fatal — the app works fully without it, just without
      // offline support. Don't let a registration failure (e.g. an
      // unsupported browser, or serving over plain HTTP) affect the app.
      console.warn('Service worker registration failed:', err);
    });

    // Let the user know when queued offline actions finish syncing.
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SYNC_COMPLETE' && event.data.synced > 0) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast.success(`${event.data.synced} offline action${event.data.synced > 1 ? 's' : ''} synced`);
        }).catch(() => {});
      }
    });
  });
}