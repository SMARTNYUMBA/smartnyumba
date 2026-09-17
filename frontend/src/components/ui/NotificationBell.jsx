import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, roleHome } from '../../utils/helpers';

function resolveUrl(url, role) {
  if (!url) return roleHome(role);
  const portal = roleHome(role);
  const PREFIXES = ['/admin', '/manager', '/owner', '/tenant', '/caretaker', '/security'];
  let suffix = url;
  for (const p of PREFIXES) {
    if (url.startsWith(p + '/') || url === p) { suffix = url.slice(p.length); break; }
  }
  if (url === '/messages' || url === '/profile') return url;
  if (role === 'tenant') {
    if (url.startsWith('/tenant')) return url;
    const m = { invoices: '/tenant/invoices', payments: '/tenant/payments', maintenance: '/tenant/maintenance' };
    return m[suffix.replace('/','')] || '/tenant';
  }
  const base = suffix.replace(/^\//, '').split('/')[0];
  const rest = suffix.replace(/^\//, '').split('/').slice(1).join('/');
  return rest ? `${portal}/${base}/${rest}` : `${portal}/${base}`;
}

const TYPE_COLORS = {
  tenancy: '#2563EB', maintenance: '#D97706', payment: '#16A34A', invoice: '#7C3AED',
  announcement: '#0D9488', lease_expiry: '#EA580C', security: '#DC2626', system: '#475569',
  deposit_refund: '#16A34A', case: '#6D28D9', message: '#2563EB',
};
const TYPE_CHAR = {
  tenancy: '🏠', maintenance: '🔧', payment: '💳', invoice: '📄',
  announcement: '📢', lease_expiry: '⏰', security: '🚨', system: '⚙️',
  deposit_refund: '💰', case: '📋', message: '✉️',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth() || {};

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const unread = data?.unread || 0;
  const items = data?.notifications || [];

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markAll = async () => {
    await api.put('/notifications/all/read').catch(() => {});
    qc.invalidateQueries(['notifications']);
  };

  const clickItem = async (item) => {
    await api.put(`/notifications/${item.id}/read`).catch(() => {});
    qc.invalidateQueries(['notifications']);
    setOpen(false);
    navigate(resolveUrl(item.action_url, user?.role));
  };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: open ? 'var(--surface-muted)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--border-strong)' : 'var(--border)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease', cursor: 'pointer', position: 'relative',
        }}
        aria-label="Notifications">
        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15, color: unread > 0 ? 'var(--brand)' : 'var(--text-secondary)' }}>
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#E11D48', color: 'white',
            width: 16, height: 16, borderRadius: '50%',
            fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--surface)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            width: 320,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            zIndex: 50,
            overflow: 'hidden',
          }}
          className="animate-slide-up">

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Notifications
              {unread > 0 && (
                <span style={{ marginLeft: 6, background: '#E11D48', color: 'white', borderRadius: 100, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
                  {unread}
                </span>
              )}
            </span>
            {unread > 0 && (
              <button onClick={markAll}
                style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {!items.length
              ? <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔕</div>
                  No notifications
                </div>
              : items.map((n, i) => (
                  <button key={n.id || i} onClick={() => clickItem(n)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '0.75rem 1rem',
                      background: n.is_read ? 'transparent' : 'rgba(217,119,6,0.04)',
                      borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(217,119,6,0.04)'}>

                    {/* Type dot */}
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                      {TYPE_CHAR[n.type] || '🔔'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {n.title && (
                        <p style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.title}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {n.message}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmtDateTime(n.created_at)}
                      </p>
                    </div>

                    {!n.is_read && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: 6 }} />
                    )}
                  </button>
                ))
            }
          </div>

          {items.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '0.6rem 1rem', background: 'var(--surface-muted)', textAlign: 'center' }}>
              <button onClick={() => { markAll(); setOpen(false); }}
                style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none' }}>
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
