import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import Badge     from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDate } from '../../utils/helpers';


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function CaretakerDashboard() {
  const { user } = useAuth();

  const { isLoading, data: tasks } = useQuery({
    queryKey: ['caretaker-tasks'],
    queryFn: () => api.get('/maintenance', { params: { assigned_to: user?.id, status: 'assigned', limit: 10 } }).then(r => r.data.requests).catch(() => []),
  });
  const { data: readings } = useQuery({
    queryKey: ['pending-readings'],
    queryFn: () => api.get('/meter-readings/pending').then(r => r.data.pending).catch(() => []),
  });
  const { data: units } = useQuery({
    queryKey: ['caretaker-units'],
    queryFn: () => api.get('/units', { params: { limit: 100 } }).then(r => r.data.units).catch(() => []),
  });

  const pendingReadings = (readings || []).length;
  const activeTasks     = (tasks || []).filter(t => t.status === 'assigned').length;
  const vacantUnits     = (units || []).filter(u => u.status === 'vacant').length;

  const PC = { urgent:'#DC2626', high:'#EA580C', medium:'#D97706', low:'#16A34A' };

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="My Work">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
          <KpiCard label="Assigned tasks"    value={activeTasks}    icon="🔧" color={activeTasks > 0 ? 'amber' : 'green'} />
          <KpiCard label="Pending readings"  value={pendingReadings} icon="📊" color={pendingReadings > 0 ? 'amber' : 'green'} />
          <KpiCard label="Vacant units"      value={vacantUnits}    icon="🏠" color={vacantUnits > 0 ? 'blue' : 'green'} />
          <KpiCard label="Total units"       value={(units||[]).length} icon="🔑" color="slate" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>My tasks</h2>
              <Link to="/caretaker/maintenance" style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>View all →</Link>
            </div>
            {!(tasks||[]).length
              ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>No tasks assigned ✓</div>
              : (tasks||[]).map((t,i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '0.625rem 0', borderBottom: i < (tasks||[]).length-1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PC[t.priority]||'#9C9991', flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.unit_number} · {t.property_name}</p>
                  </div>
                  <Badge status={t.priority} label={t.priority} />
                </div>
              ))
            }
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Pending meter readings</h2>
              <Link to="/caretaker/readings" style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>Enter readings →</Link>
            </div>
            {!(readings||[]).length
              ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>All readings up to date ✓</div>
              : (readings||[]).slice(0,6).map((r,i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: i < Math.min((readings||[]).length,6)-1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{r.unit_number}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.meter_type} meter</p>
                  </div>
                  <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>Overdue</span>
                </div>
              ))
            }
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[
            { icon: '🔧', label: 'Maintenance tasks', to: '/caretaker/maintenance' },
            { icon: '📊', label: 'Meter readings',    to: '/caretaker/readings'    },
            { icon: '🔍', label: 'Inspections',       to: '/caretaker/inspections' },
          ].map(({ icon, label, to }) => (
            <Link key={to} to={to} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', textAlign: 'center', textDecoration: 'none', display: 'block', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</p>
            </Link>
          ))}
        </div>

      </div>
    </AppLayout>
  );
}
