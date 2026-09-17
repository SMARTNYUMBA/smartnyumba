import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api, { revokeSession } from '../../api';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';

// How long ago a session started, in plain words — "since when" is more
// useful at a glance here than a raw timestamp.
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Minimal inline UA parsing — good enough for "browser on platform" at a
// glance, without pulling in a dependency for something this narrow.
function deviceLabel(ua) {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua)     ? 'Edge' :
    /OPR\//.test(ua)     ? 'Opera' :
    /Chrome\//.test(ua)  ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua)  ? 'Safari' : 'Browser';
  const platform =
    /iPhone|iPad/.test(ua)  ? 'iOS' :
    /Android/.test(ua)      ? 'Android' :
    /Windows/.test(ua)      ? 'Windows' :
    /Macintosh/.test(ua)    ? 'Mac' :
    /Linux/.test(ua)        ? 'Linux' : '';
  return platform ? `${browser} on ${platform}` : browser;
}

export default function Sessions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ page: 1 });
  const [revoking, setRevoking] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['active-sessions', filters],
    queryFn: () => api.get('/organisations/sessions', { params: filters }).then(r => r.data),
    staleTime: 15000,
    keepPreviousData: true,
  });

  const rows = data?.data || [];
  const meta = data?.meta || {};

  const doRevoke = async (session) => {
    setRevoking(session.id);
    try {
      await revokeSession(session.id);
      toast.success(`Signed out ${session.full_name}`);
      qc.invalidateQueries(['active-sessions']);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Active Sessions</h1>
          <p className="text-[--text-muted] text-sm mt-0.5">
            Everyone currently logged in to your organisation — sign someone out remotely if needed.
          </p>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          ℹ️ "Signed in" reflects the most recent token refresh, not necessarily when someone's
          continuous session first began — active use refreshes the token periodically.
          For a full login/logout history, check the{' '}
          <a href="/admin/audit-log" className="underline">Audit Log</a>.
        </div>

        {isLoading ? (
          <p className="text-[--text-muted] text-sm">Loading...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[--border]">
            <div className="table-wrap">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-[--surface-muted]">
                <tr>{['User', 'Role', 'Device', 'IP', 'Signed in', 'Expires', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[--text-muted] font-medium text-xs uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[--border]">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[--text-muted]">No active sessions</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} className="bg-[--surface] hover:bg-[--surface-muted]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[--text-primary]">
                        {r.full_name}
                        {String(r.user_id) === String(user?.id) && (
                          <span className="ml-2 text-xs text-[--text-muted] font-normal">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-[--text-muted]">{r.email}</p>
                    </td>
                    <td className="px-4 py-3 text-[--text-muted] text-xs capitalize">{r.role?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-[--text-muted] text-xs">{deviceLabel(r.user_agent)}</td>
                    <td className="px-4 py-3 text-[--text-muted] font-mono text-xs">{r.ip || '—'}</td>
                    <td className="px-4 py-3 text-[--text-muted] whitespace-nowrap text-xs">
                      {timeAgo(r.logged_in_at)}
                    </td>
                    <td className="px-4 py-3 text-[--text-muted] whitespace-nowrap font-mono text-xs">
                      {new Date(r.expires_at).toLocaleDateString('en-KE')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="btn-danger btn-sm"
                        disabled={revoking === r.id}
                        onClick={() => doRevoke(r)}
                      >
                        {revoking === r.id ? '...' : 'Sign out'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {meta.pages > 1 && (
          <div className="flex items-center justify-between text-sm text-[--text-muted]">
            <span>Page {meta.page} of {meta.pages} ({meta.total} sessions)</span>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" disabled={meta.page <= 1}
                onClick={() => setFilters(p => ({ ...p, page: p.page - 1 }))}>← Prev</button>
              <button className="btn-secondary btn-sm" disabled={meta.page >= meta.pages}
                onClick={() => setFilters(p => ({ ...p, page: p.page + 1 }))}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
