import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * CrispChat — embeds the Crisp live chat widget.
 *
 * YOUR PART: Set VITE_CRISP_ID in your .env:
 *   VITE_CRISP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   (get it from app.crisp.chat → Settings → Website Settings → Setup)
 *
 * The widget is hidden for the tenant portal (tenants use in-app messaging)
 * and shown only for admin/owner/manager roles.
 */
export default function CrispChat() {
  const { user } = useAuth();
  const CRISP_ID = import.meta.env.VITE_CRISP_ID;

  useEffect(() => {
    if (!CRISP_ID) return;
    // Only show for admin-level roles — tenants use in-app messaging
    if (user?.role === 'tenant') return;

    if (window.$crisp) return; // already loaded

    window.$crisp = [];
    window.CRISP_WEBSITE_ID = CRISP_ID;

    // Pre-fill user info so support agents see who they're talking to
    if (user) {
      window.$crisp.push(['set', 'user:email',    [user.email]]);
      window.$crisp.push(['set', 'user:nickname', [user.name || user.full_name]]);
      window.$crisp.push(['set', 'session:data',  [[['role', user.role], ['org_id', user.org_id]]]]);
    }

    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);

    return () => {
      // Clean up on unmount (e.g. user logs out)
      if (window.$crisp) window.$crisp.push(['do', 'chat:hide']);
    };
  }, [CRISP_ID, user?.sub]);

  return null; // no visual output — Crisp renders its own widget
}
