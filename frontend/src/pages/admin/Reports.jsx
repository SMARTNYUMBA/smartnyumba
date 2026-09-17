import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { exportToExcel, exportToCSV } from '../../utils/exportExcel';
import AppLayout  from '../../components/layout/AppLayout';
import KpiCard    from '../../components/ui/KpiCard';
import ExportBar, { exportToCsv, printSection } from '../../components/ui/ExportBar';
import api, { getReports, getProperties } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

const TABS = [
  { id: 'financial',   label: 'Financial'   },
  { id: 'insights',    label: 'Insights'    },
  { id: 'pnl',         label: 'P&L'         },
  { id: 'cashflow',    label: 'Forecast'     },
  { id: 'arrears',     label: 'Arrears'      },
  { id: 'maintenance', label: 'Maintenance'  },
  { id: 'occupancy',   label: 'Occupancy'    },
  { id: 'rentroll',    label: 'Rent Roll'    },
  { id: 'ratings',     label: 'Ratings'      },
];

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0C1117', color: 'white', borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: '#FCD34D' }}>
        {fmt(payload[0].value)}
      </p>
    </div>
  );
};

const Section = ({ title }) => (
  <h3 style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: '1rem', letterSpacing: '-0.01em' }}>
    {title}
  </h3>
);

const Card = ({ children, style }) => (
  <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '1.25rem', ...style }}>
    {children}
  </div>
);

function getPeriods() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return { value: d.toISOString().slice(0,7), label: d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }) };
  });
}

export default function Reports() {
  const periods = getPeriods();
  const [period, setPeriod]         = useState(periods[0].value);
  const [tab, setTab]               = useState('financial');
  const [propFilter, setPropFilter] = useState('');

  const params = { month_year: period, property_id: propFilter || undefined };

  const { data, isLoading }   = useQuery({ queryKey: ['reports', period, propFilter], queryFn: () => getReports({ period, property_id: propFilter || undefined }).then(r => r.data), staleTime: 300_000 });
  const { data: pnl }         = useQuery({ queryKey: ['pnl', period, propFilter], queryFn: () => api.get('/reports/pnl', { params }).then(r => r.data), enabled: tab === 'pnl' });
  const { data: cf }          = useQuery({ queryKey: ['cf', propFilter], queryFn: () => api.get('/reports/cashflow-forecast', { params: { property_id: propFilter||undefined } }).then(r => r.data), enabled: tab === 'cashflow' });
  const { data: maint }       = useQuery({ queryKey: ['maint-kpi', propFilter], queryFn: () => api.get('/reports/maintenance-kpis', { params: { property_id: propFilter||undefined } }).then(r => r.data), enabled: tab === 'maintenance' });
  const { data: occ }         = useQuery({ queryKey: ['occ-trend', propFilter], queryFn: () => api.get('/reports/occupancy-trend', { params: { property_id: propFilter||undefined } }).then(r => r.data), enabled: tab === 'occupancy' });
  const { data: rr, isLoading: rrLoading } = useQuery({ queryKey: ['rentroll', period, propFilter], queryFn: () => api.get('/reports/rent-roll', { params }).then(r => r.data), enabled: tab === 'rentroll' });
  const { data: ratings }     = useQuery({ queryKey: ['ratings-stats'], queryFn: () => api.get('/ratings/stats').then(r => r.data), staleTime: 300_000, enabled: tab === 'ratings' });
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({ queryKey: ['portfolio-overview', period, propFilter], queryFn: () => api.get('/reports/portfolio-overview', { params }).then(r => r.data), enabled: tab === 'insights' });
  const { data: revTrend }    = useQuery({ queryKey: ['revenue-trend', propFilter], queryFn: () => api.get('/reports/revenue-trend', { params: { property_id: propFilter||undefined, months: 6 } }).then(r => r.data), enabled: tab === 'insights' });
  const { data: props }       = useQuery({ queryKey: ['properties'], queryFn: () => getProperties().then(r => r.data.properties) });

  const exportArrears = () => exportToCsv(
    (data?.arrears || []).map(a => ({ Tenant: a.tenant_name, Unit: a.unit_number, Property: a.property_name, '1-30d': a.bucket_30, '31-60d': a.bucket_60, '61-90d': a.bucket_90, '90+d': a.bucket_over90, Total: a.total_owed })),
    `arrears-${period}`
  );

  return (
    <AppLayout title="Reports & Analytics" actions={
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" style={{ width: 160, fontSize: 13 }} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">All properties</option>
          {(props || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" style={{ width: 180, fontSize: 13 }} value={period} onChange={e => setPeriod(e.target.value)}>
          {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <ExportBar onPrint={() => printSection('report-body', 'Report')} />
      </div>
    }>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: '1.25rem', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              background: tab === t.id ? 'var(--text-primary)' : 'transparent',
              color: tab === t.id ? 'white' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', transition: 'all 0.12s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div id="report-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Financial ── */}
        {tab === 'financial' && (isLoading
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{[...Array(4)].map((_,i) => <KpiCard key={i} loading />)}</div>
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
              <KpiCard label="Revenue collected" value={fmt(data?.collected)}    icon="💰" color="green" />
              <KpiCard label="Total billed"      value={fmt(data?.total_billed)} icon="🧾" color="brand" />
              <KpiCard label="Net income"        value={fmt(data?.net)}          icon="📈" color={(data?.net||0) >= 0 ? 'green' : 'red'} />
              <KpiCard label="Outstanding"       value={fmt(data?.outstanding)}  icon="⚠️" color="amber" />
            </div>
            <Card>
              <Section title="Revenue — last 6 months" />
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data?.trend || []}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#D97706" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#D97706" strokeWidth={2} fill="url(#rev)" dot={false} activeDot={{ r: 5, fill: '#D97706', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}

        {/* ── Business Intelligence — portfolio comparison & trend ── */}
        {tab === 'insights' && (
          portfolioLoading
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{[...Array(4)].map((_,i) => <KpiCard key={i} loading />)}</div>
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
              <KpiCard label="Portfolio NOI"     value={fmt(portfolio?.totals?.noi)} icon="📈" color={(portfolio?.totals?.noi||0) >= 0 ? 'green' : 'red'} />
              <KpiCard label="Collection rate"   value={portfolio?.totals?.collection_rate != null ? `${portfolio.totals.collection_rate}%` : '—'} icon="📊" color={(portfolio?.totals?.collection_rate||0) >= 80 ? 'green' : 'amber'} />
              <KpiCard label="Occupancy rate"    value={portfolio?.totals?.occupancy_rate != null ? `${portfolio.totals.occupancy_rate}%` : '—'} icon="🏢" color={(portfolio?.totals?.occupancy_rate||0) >= 80 ? 'green' : 'amber'} />
              <KpiCard label="Needs attention"   value={portfolio?.needs_attention?.length || 0} icon="⚠️" color={(portfolio?.needs_attention?.length||0) > 0 ? 'red' : 'green'} />
            </div>

            <Card>
              <Section title="Revenue trend — last 6 months" />
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revTrend?.trend || []}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="collected" name="Collected" stroke="#059669" fill="#059669" fillOpacity={0.12} strokeWidth={2.5} />
                  <Area type="monotone" dataKey="total_expenses" name="Expenses" stroke="#DC2626" fill="#DC2626" fillOpacity={0.08} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <Section title="Property comparison — net operating income" />
              <ResponsiveContainer width="100%" height={Math.max(180, (portfolio?.properties?.length || 1) * 42)}>
                <BarChart data={portfolio?.properties || []} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Bar dataKey="noi" radius={[0, 6, 6, 0]}>
                    {(portfolio?.properties || []).map((p, i) => (
                      <Cell key={i} fill={p.flags?.length ? '#D97706' : '#059669'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <Section title="Properties needing attention" />
              {!(portfolio?.needs_attention || []).length
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Nothing flagged — every property is within normal ranges.</p>
                : portfolio.needs_attention.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {p.flags.map(f => ({
                          low_collection: `Collection rate ${p.collection_rate}%`,
                          low_occupancy: `Occupancy ${p.occupancy_rate}%`,
                          high_maintenance_load: `${p.open_maintenance} open maintenance requests`,
                        }[f])).join(' · ')}
                      </p>
                    </div>
                    <span style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: p.noi >= 0 ? 'var(--text-primary)' : '#DC2626' }}>
                      {fmt(p.noi)}
                    </span>
                  </div>
                ))
              }
            </Card>
          </>
        )}

        {/* ── P&L ── */}
        {tab === 'pnl' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
              <KpiCard label="Gross income"  value={fmt(pnl?.gross_income)}  icon="💰" color="green" />
              <KpiCard label="Total expenses" value={fmt(pnl?.total_expenses)} icon="💸" color="amber" />
              <KpiCard label="Net income"    value={fmt(pnl?.net_income)}     icon="📊" color={(pnl?.net_income||0) >= 0 ? 'green' : 'red'} />
              <KpiCard label="Vacancy loss"  value={fmt(pnl?.vacancy_loss)}   icon="🏚️" color="red" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">
              <Card>
                <Section title="Income breakdown" />
                {(pnl?.income_breakdown || []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{item.type?.replace(/_/g,' ')}</span>
                    <span style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{fmt(item.amount)}</span>
                  </div>
                ))}
              </Card>
              <Card>
                <Section title="Expense breakdown" />
                {(pnl?.expense_breakdown || []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{item.category?.replace(/_/g,' ')}</span>
                    <span style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#DC2626' }}>{fmt(item.amount)}</span>
                  </div>
                ))}
              </Card>
            </div>
          </>
        )}

        {/* ── Cashflow forecast ── */}
        {tab === 'cashflow' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              <KpiCard label="Expected monthly rent" value={fmt(cf?.expected_monthly_rent)} icon="🏠" color="brand" />
              <KpiCard label="Avg monthly expenses"  value={fmt(cf?.avg_monthly_expenses)}  icon="💸" color="amber" />
              <KpiCard label="Collection rate"       value={`${cf?.collection_rate || 0}%`} icon="📊" color={(cf?.collection_rate||0) >= 80 ? 'green' : 'red'} />
            </div>
            <Card>
              <Section title="3-month cash flow projection" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(cf?.forecast || []).map((m, i) => (
                  <div key={i} style={{ borderRadius: 12, border: `2px solid ${m.net >= 0 ? '#BBF7D0' : '#FECDD3'}`, background: m.net >= 0 ? '#F0FDF4' : '#FFF1F2', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{m.month}</p>
                      <span style={{ fontSize: 14, fontWeight: 700, color: m.net >= 0 ? '#15803D' : '#DC2626' }}>
                        {m.net >= 0 ? `+${fmt(m.net)} surplus` : `${fmt(m.net)} shortfall`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                      <span style={{ color: '#15803D' }}>↑ Income: {fmt(m.projected_income)}</span>
                      <span style={{ color: '#DC2626' }}>↓ Expenses: {fmt(m.projected_expenses)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* ── Arrears ── */}
        {tab === 'arrears' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary btn-sm" onClick={exportArrears}>Export CSV</button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tenant</th><th>Unit</th><th>Property</th>
                    <th style={{ textAlign: 'right' }}>1–30d</th>
                    <th style={{ textAlign: 'right' }}>31–60d</th>
                    <th style={{ textAlign: 'right' }}>61–90d</th>
                    <th style={{ textAlign: 'right' }}>90+d</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {!(data?.arrears || []).length
                    ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>All clear — no arrears!</td></tr>
                    : (data.arrears || []).map((a, i) => (
                      <tr key={i}>
                        <td><p style={{ fontWeight: 600 }}>{a.tenant_name}</p><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.phone}</p></td>
                        <td>{a.unit_number}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{a.property_name}</td>
                        <td style={{ textAlign: 'right', color: '#D97706', fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}>{a.bucket_30 > 0 ? fmt(a.bucket_30) : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#EA580C', fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}>{a.bucket_60 > 0 ? fmt(a.bucket_60) : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#DC2626', fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}>{a.bucket_90 > 0 ? fmt(a.bucket_90) : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#9F1239', fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}>{a.bucket_over90 > 0 ? fmt(a.bucket_over90) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#DC2626' }}>{fmt(a.total_owed)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Maintenance KPIs ── */}
        {tab === 'maintenance' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              <KpiCard label="Total requests (6mo)" value={maint?.overall?.total || 0} icon="🔧" color="brand" />
              <KpiCard label="Avg resolution" value={maint?.overall?.avg_resolution_hours ? `${Math.round(maint.overall.avg_resolution_hours)}h` : '—'} icon="⏱️" color="teal" />
              <KpiCard label="Total cost (6mo)" value={fmt(maint?.overall?.total_cost)} icon="💸" color="amber" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">
              <Card>
                <Section title="Requests by category" />
                {(maint?.byCategory || []).map((c, i) => {
                  const pct = Math.min(100, (c.total / (maint?.overall?.total || 1)) * 100);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize', width: 90, flexShrink: 0 }}>{c.category}</span>
                      <div style={{ flex: 1, height: 6, background: 'var(--canvas-200)', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', borderRadius: 100, transition: 'width 0.6s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono,monospace', flexShrink: 0 }}>{c.total}</span>
                    </div>
                  );
                })}
              </Card>
              <Card>
                <Section title="Top problem units" />
                {!(maint?.topUnits || []).length
                  ? <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No data</p>
                  : (maint.topUnits || []).slice(0, 5).map((u, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div><p style={{ fontSize: 13, fontWeight: 600 }}>{u.unit_number}</p><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.property_name}</p></div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 13, fontWeight: 700 }}>{u.request_count} requests</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono,monospace' }}>{fmt(u.total_cost)}</p>
                      </div>
                    </div>
                  ))
                }
              </Card>
            </div>
          </>
        )}

        {/* ── Occupancy trend ── */}
        {tab === 'occupancy' && (
          <>
            <KpiCard label="Total units today" value={occ?.current_total || 0} icon="🏢" color="brand" />
            <Card>
              <Section title="Occupancy rate — 12 months" />
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={occ?.trend || []}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [`${v}%`, 'Occupancy']} />
                  <Line type="monotone" dataKey="occupancy_rate" stroke="#D97706" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#D97706', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Unit type</th><th>Total</th><th>Occupied</th><th>Occupancy</th><th style={{ textAlign: 'right' }}>Avg rent</th></tr></thead>
                <tbody>
                  {(occ?.byType || []).map((t, i) => (
                    <tr key={i}>
                      <td style={{ textTransform: 'capitalize' }}>{t.type?.replace(/_/g, ' ')}</td>
                      <td>{t.total}</td>
                      <td>{t.occupied}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 5, background: 'var(--canvas-200)', borderRadius: 100, overflow: 'hidden' }}>
                            <div style={{ width: `${t.total > 0 ? Math.round((t.occupied/t.total)*100) : 0}%`, height: '100%', background: '#D97706', borderRadius: 100 }} />
                          </div>
                          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>{t.total > 0 ? Math.round((t.occupied/t.total)*100) : 0}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}>{fmt(t.avg_rent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Rent roll ── */}
        {tab === 'rentroll' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary btn-sm" onClick={() => exportToCsv((rr?.tenancies || []).map(r => ({ Tenant: r.tenant_name, Unit: r.unit_number, Property: r.property_name, 'Rent/mo': r.rent_amount, 'Lease end': r.end_date || '', 'Last paid': r.last_payment_date || '' })), 'rent-roll')}>
                Export CSV
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tenant</th><th>Unit</th><th>Property</th><th style={{ textAlign: 'right' }}>Rent/mo</th><th>Lease end</th><th>Last paid</th></tr></thead>
                <tbody>
                  {rrLoading
                    ? [...Array(6)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 14, width: '70%' }} /></td>)}</tr>)
                    : (rr?.tenancies || []).map((r, i) => {
                      const daysAgo = r.last_payment_date ? Math.floor((Date.now() - new Date(r.last_payment_date)) / 86400000) : null;
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{r.tenant_name}</td>
                          <td>{r.unit_number}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.property_name}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: '#16A34A', fontWeight: 700 }}>{fmt(r.rent_amount)}</td>
                          <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.end_date ? fmtDate(r.end_date) : '—'}</td>
                          <td>
                            {daysAgo === null
                              ? <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 700 }}>Never</span>
                              : <span style={{ fontSize: 12, fontWeight: 700, color: daysAgo <= 35 ? '#16A34A' : daysAgo <= 65 ? '#D97706' : '#DC2626', fontFamily: 'JetBrains Mono,monospace' }}>
                                  {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                                </span>
                            }
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
                {rr?.summary && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={3} style={{ paddingTop: '0.625rem', fontSize: 12, color: 'var(--text-muted)' }}>{rr.summary.count} active tenancies</td>
                      <td style={{ textAlign: 'right', paddingTop: '0.625rem', fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: '#16A34A' }}>{fmt(rr.summary.total_monthly_rent)}/mo</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}

        {/* ── Ratings ── */}
        {tab === 'ratings' && (
          <Card>
            <Section title="Tenant satisfaction ratings" />
            {!(ratings?.stats || []).length
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>No ratings yet</p>
              : (ratings.stats || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, width: 140, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{s.category?.replace(/_/g, ' ')}</p>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ fontSize: 18, color: n <= Math.round(s.avg_rating) ? '#FBBF24' : '#E5E7EB' }}>★</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono,monospace' }}>
                    {Number(s.avg_rating).toFixed(1)} ({s.count})
                  </span>
                </div>
              ))
            }
          </Card>
        )}

      </div>
    </AppLayout>
  );
}
