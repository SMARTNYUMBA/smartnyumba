import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import api, { getProperties } from '../../api';
import { fmt, fmtDate, priorityColor } from '../../utils/helpers';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ── Custom tooltip ────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--obsidian-900,#0C1117)', color: 'white', borderRadius: 10, padding: '8px 14px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: '#FCD34D' }}>
        {fmt(payload[0].value)}
      </p>
    </div>
  );
};

// ── Section header ────────────────────────────────────────────
const Section = ({ title, href, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
    <h2 style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
      {title}
    </h2>
    {href && (
      <Link to={href} style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}
        className="hover:underline">
        {action || 'View all'} →
      </Link>
    )}
  </div>
);

export default function Dashboard() {
  const [propertyId, setPropertyId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', propertyId],
    queryFn: () => api.get('/dashboard', { params: propertyId ? { property_id: propertyId } : {} }).then(r => r.data),
  });

  const { data: expiring } = useQuery({
    queryKey: ['expiring-leases'],
    queryFn: () => api.get('/tenancies', { params: { status: 'active', limit: 200 } }).then(r =>
      (r.data.tenancies || []).filter(t => {
        if (!t.end_date) return false;
        const days = Math.ceil((new Date(t.end_date) - new Date()) / 86400000);
        return days >= 0 && days <= 30;
      }).sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
    ),
    staleTime: 300_000,
  });

  const { data: props } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties().then(r => r.data.properties),
  });

  const d = data || {};

  const filterBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Property</span>
      <select
        value={propertyId}
        onChange={e => setPropertyId(e.target.value)}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'Outfit,sans-serif', outline: 'none', cursor: 'pointer' }}>
        <option value="">All properties</option>
        {(props || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );

  if (isLoading) {
    return (
      <AppLayout title="Dashboard" actions={filterBar}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[...Array(8)].map((_, i) => <KpiCard key={i} loading />)}
        </div>
      </AppLayout>
    );
  }

  const occupancyPct = d.total_units > 0 ? Math.round((d.occupied_units / d.total_units) * 100) : 0;

  return (
    <AppLayout title="Dashboard" actions={filterBar}>
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── KPI Row 1 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}
          className="sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Units"    value={d.total_units || 0}           icon="🏢" color="slate"  sub={`${d.occupied_units || 0} occupied`} />
          <KpiCard label="Active Tenants" value={d.active_tenants || 0}        icon="👥" color="blue"   sub={`${d.active_leases || 0} leases`} />
          <KpiCard label="Monthly Revenue" value={fmt(d.monthly_revenue)}      icon="💰" color="green"  sub="This month collected" />
          <KpiCard label="Outstanding"    value={fmt(d.outstanding)}            icon="⚠️" color="amber" sub={`${d.overdue_invoices || 0} overdue`} />
        </div>

        {/* ── KPI Row 2 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}
          className="sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Occupancy"       value={`${occupancyPct}%`}            icon="📊" color="brand" />
          <KpiCard label="Open Maintenance" value={d.open_maintenance || 0}      icon="🔧" color={d.open_maintenance > 0 ? 'amber' : 'green'} />
          <KpiCard label="Visitors Today"  value={d.visitors_today || 0}         icon="👋" color="purple" />
          <KpiCard label="Properties"      value={d.total_properties || 0}       icon="🏠" color="teal" />
        </div>

        {/* ── Charts Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-[2fr_1fr]">

          {/* Revenue area chart */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Revenue — last 6 months" href="/admin/reports" />
            {d.revenue_trend?.length > 0
              ? <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={d.revenue_trend}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#D97706" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#D97706" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" vertical={false}/>
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTooltip />}/>
                    <Area type="monotone" dataKey="revenue" stroke="#D97706" strokeWidth={2} fill="url(#rev)" dot={false} activeDot={{ r: 5, fill: '#D97706', strokeWidth: 0 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No revenue data yet
                </div>
            }
          </div>

          {/* Properties occupancy */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
            <Section title="Properties" />
            {!(d.by_property || []).length
              ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No properties yet
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(d.by_property || []).slice(0, 5).map((p, i) => {
                    const pct = p.total > 0 ? Math.round((p.occupied / p.total) * 100) : 0;
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>{p.occupied}/{p.total}</span>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 5, background: '#ECEAE4', borderRadius: 100, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#E11D48', borderRadius: 100, transition: 'width 0.6s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: '#16A34A', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(p.collected)}</span>
                          {p.owed > 0 && <span style={{ fontSize: 11, color: '#E11D48', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(p.owed)} owed</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>

        {/* ── Bottom row: Arrears + Maintenance + Expiring leases ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="grid-cols-1 lg:grid-cols-3">

          {/* Top arrears */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Top Arrears" href="/admin/reports" />
            {!(d.top_arrears || []).length
              ? <Empty label="No arrears 🎉" />
              : (d.top_arrears || []).slice(0, 5).map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 12, borderBottom: i < 4 ? '1px solid #F0EEE9' : 'none' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.tenant_name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.unit_number} · {a.property_name}</p>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 8 }}>
                      <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#DC2626' }}>{fmt(a.total_owed)}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.days_overdue}d overdue</p>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Open maintenance */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Open Maintenance" href="/admin/maintenance" />
            {!(d.open_requests || []).length
              ? <Empty label="No open requests" />
              : (d.open_requests || []).slice(0, 5).map((r, i) => (
                  <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < 4 ? '1px solid #F0EEE9' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <PriorityDot priority={r.priority} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.unit_number} · {r.property_name}</p>
                      </div>
                      <span style={{ fontSize: 10, textTransform: 'capitalize', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{r.priority}</span>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Expiring leases */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Expiring Leases" href="/admin/tenancies" />
            {!(expiring || []).length
              ? <Empty label="No leases expiring soon" />
              : (expiring || []).slice(0, 5).map((t, i) => {
                  const days = Math.ceil((new Date(t.end_date) - new Date()) / 86400000);
                  const urgent = days <= 7;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 12, borderBottom: i < 4 ? '1px solid #F0EEE9' : 'none' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tenant_name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.unit_number}</p>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: urgent ? '#DC2626' : '#D97706' }}>
                          {days}d left
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtDate(t.end_date)}</p>
                      </div>
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

// ── Sub-components ────────────────────────────────────────────

const Empty = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100, color: 'var(--text-muted)', fontSize: 13 }}>
    {label}
  </div>
);

const PriorityDot = ({ priority }) => {
  const c = { urgent: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A' };
  return (
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: c[priority] || '#9C9991', flexShrink: 0, marginTop: 4 }} />
  );
};
