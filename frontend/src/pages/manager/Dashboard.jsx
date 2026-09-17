import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import Badge     from '../../components/ui/Badge';
import { Link }  from 'react-router-dom';
import api, { getProperties } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../../context/AuthContext';

const Section = ({ title, to }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.875rem' }}>
    <h2 style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</h2>
    {to && <Link to={to} style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>View all →</Link>}
  </div>
);

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0C1117', borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: '#FCD34D' }}>{fmt(payload[0].value)}</p>
    </div>
  );
};

export default function ManagerDashboard() {
  const { user } = useAuth();

  const { data: dash, isLoading } = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
  });
  const { data: props } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties().then(r => r.data.properties),
  });
  const { data: arrears } = useQuery({
    queryKey: ['top-arrears'],
    queryFn: () => api.get('/reports/arrears', { params: { limit: 5 } }).then(r => r.data.arrears).catch(() => []),
  });
  const { data: pending } = useQuery({
    queryKey: ['pending-maintenance'],
    queryFn: () => api.get('/maintenance', { params: { status: 'pending', limit: 5 } }).then(r => r.data.requests).catch(() => []),
  });

  const d = dash || {};
  const occupancyPct = d.total_units > 0 ? Math.round((d.occupied_units / d.total_units) * 100) : 0;

  return (
    <AppLayout title="Manager Dashboard">
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
          <KpiCard label="Units managed"   value={d.total_units || 0}         icon="🏢" color="slate"  loading={isLoading} sub={`${d.occupied_units || 0} occupied`} />
          <KpiCard label="Active tenants"  value={d.active_tenants || 0}       icon="👥" color="blue"  loading={isLoading} />
          <KpiCard label="Collected"       value={fmt(d.monthly_revenue)}      icon="💰" color="green" loading={isLoading} sub="This month" />
          <KpiCard label="Outstanding"     value={fmt(d.outstanding)}           icon="⚠️" color="amber" loading={isLoading} sub={`${d.overdue_invoices || 0} overdue`} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
          <KpiCard label="Occupancy"       value={`${occupancyPct}%`}           icon="📊" color="brand" loading={isLoading} />
          <KpiCard label="Open maintenance" value={d.open_maintenance || 0}     icon="🔧" color={d.open_maintenance > 0 ? 'amber' : 'green'} loading={isLoading} />
          <KpiCard label="Properties"      value={(props || []).length}          icon="🏠" color="teal"  loading={isLoading} />
          <KpiCard label="Visitors today"  value={d.visitors_today || 0}         icon="👋" color="purple" loading={isLoading} />
        </div>

        {/* Revenue chart + properties */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Revenue trend" to="/manager/reports" />
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={d.revenue_trend || []}>
                <defs>
                  <linearGradient id="mgr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#D97706" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="revenue" stroke="#D97706" strokeWidth={2} fill="url(#mgr)" dot={false} activeDot={{ r: 5, fill: '#D97706', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="My properties" to="/manager/properties" />
            {(props || []).slice(0, 5).map((p, i) => {
              const pct = p.total_units > 0 ? Math.round((p.occupied_units / p.total_units) * 100) : 0;
              return (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: 'var(--text-muted)' }}>{p.occupied_units||0}/{p.total_units||0}</span>
                  </div>
                  <div style={{ height: 5, background: '#ECEAE4', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626', borderRadius: 100 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Arrears + Maintenance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Top arrears" to="/manager/reports" />
            {!(arrears || []).length
              ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>No arrears 🎉</div>
              : (arrears || []).map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: i < (arrears||[]).length - 1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{a.tenant_name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.unit_number}</p>
                  </div>
                  <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#DC2626' }}>{fmt(a.total_owed)}</p>
                </div>
              ))
            }
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Pending maintenance" to="/manager/maintenance" />
            {!(pending || []).length
              ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>All clear ✓</div>
              : (pending || []).map((r, i) => {
                const pc = { urgent: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A' }[r.priority] || '#9C9991';
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '0.625rem 0', borderBottom: i < (pending||[]).length - 1 ? '1px solid #F0EEE9' : 'none' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: pc, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.unit_number} · {r.property_name}</p>
                    </div>
                    <Badge status={r.priority} label={r.priority} />
                  </div>
                );
              })
            }
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
