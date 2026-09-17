import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import Badge     from '../../components/ui/Badge';
import api from '../../api';
import { fmtDateTime } from '../../utils/helpers';


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function SecurityDashboard() {
  const { isLoading, data: visitors } = useQuery({
    queryKey: ['visitors-today'],
    queryFn: () => api.get('/visitors', { params: { date: new Date().toISOString().slice(0,10), limit: 10 } }).then(r => r.data.visitors).catch(() => []),
  });
  const { data: parking } = useQuery({
    queryKey: ['parking-active'],
    queryFn: () => api.get('/parking').then(r => r.data.slots || r.data.records || []).catch(() => []),
  });
  const { data: alerts } = useQuery({
    queryKey: ['security-alerts'],
    // BUG FIX: this called /security/alerts, which doesn't exist anywhere
    // in the backend (no /api/security mount at all). The real, working
    // endpoint — the same one pages/security/Alerts.jsx already uses via
    // the getAlerts() helper — is /settings/alerts. This widget silently
    // always showed zero alerts because of the .catch(() => []) below.
    queryFn: () => api.get('/settings/alerts').then(r => r.data.alerts).catch(() => []),
    refetchInterval: 30_000,
  });

  const checkedIn   = (visitors||[]).filter(v => !v.check_out_time).length;
  const checkedOut  = (visitors||[]).filter(v => v.check_out_time).length;
  const activeCars  = (parking||[]).length;
  const openAlerts  = (alerts||[]).length;

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Gate Control">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

        {openAlerts > 0 && (
          <div style={{ background: '#FFF1F2', border: '2px solid #FECDD3', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 20 20" fill="#DC2626" style={{ width: 18, height: 18, flexShrink: 0 }}>
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>{openAlerts} open security alert{openAlerts > 1 ? 's' : ''}</p>
            <Link to="/security/alerts" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#DC2626' }}>View →</Link>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
          <KpiCard label="Visitors today"  value={(visitors||[]).length} icon="👥" color="blue" />
          <KpiCard label="Currently inside" value={checkedIn}             icon="✅" color={checkedIn > 0 ? 'green' : 'slate'} />
          <KpiCard label="Checked out"     value={checkedOut}             icon="🚪" color="slate" />
          <KpiCard label="Parked vehicles" value={activeCars}             icon="🚗" color={activeCars > 0 ? 'amber' : 'slate'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>Visitors today</h2>
              <Link to="/security/visitors" style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>View all →</Link>
            </div>
            {!(visitors||[]).length
              ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>No visitors today</div>
              : (visitors||[]).map((v,i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.625rem 0', borderBottom: i < (visitors||[]).length-1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.check_out_time ? '#9C9991' : '#16A34A', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visiting: {v.tenant_name} · {v.unit_number}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono,monospace', color: 'var(--text-muted)' }}>{v.check_in_time ? new Date(v.check_in_time).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '—'}</p>
                    <Badge status={v.check_out_time ? 'inactive' : 'active'} label={v.check_out_time ? 'Out' : 'In'} />
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>Quick actions</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '✅', label: 'Check in visitor', to: '/security/check-in', primary: true },
                { icon: '📋', label: 'View visitors',    to: '/security/visitors' },
                { icon: '🚗', label: 'Parking',          to: '/security/parking'  },
                { icon: '📖', label: 'Logbook',          to: '/security/logbook'  },
                { icon: '🔑', label: 'Access log',       to: '/security/access-log' },
                { icon: '🚨', label: 'Alerts',           to: '/security/alerts'   },
              ].map(({ icon, label, to, primary }) => (
                <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.625rem 0.75rem', borderRadius: 9, background: primary ? 'var(--text-primary)' : 'var(--surface-muted)', textDecoration: 'none', transition: 'all 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: primary ? 'white' : 'var(--text-secondary)' }}>{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
