import { useState, useEffect } from 'react';
import api from '../../api';

/**
 * OfflineBanner — shows at top when API is unreachable.
 * Mount once in App.jsx inside the layout.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline  = () => setOffline(false);
    window.addEventListener('api:offline', handleOffline);
    window.addEventListener('online',      handleOnline);
    return () => {
      window.removeEventListener('api:offline', handleOffline);
      window.removeEventListener('online',      handleOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 shadow-lg">
      <span>⚠️ Connection lost — some features may be unavailable</span>
      <button
        className="text-xs underline"
        onClick={() => {
          api.get('/health').then(() => setOffline(false)).catch(() => {});
        }}
      >
        Retry
      </button>
    </div>
  );
}
