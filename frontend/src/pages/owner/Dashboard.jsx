import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import { Link }  from 'react-router-dom';
import api       from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const Section = ({ title, to }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.875rem' }}>
    <h2 style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</h2>
    {to && <Link to={to} style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>View all →</Link>}
  </div>
);

export default function OwnerDashboard() {
  const { data: dash, isLoading } = useQuery({
    queryKey: ['owner-dashboard'],
    queryFn: () => api.get('/owner/dashboard').then(r => r.data),
  });
  const { data: remits } = useQuery({
    queryKey: ['owner-remittances'],
    queryFn: () => api.get('/owner/remittances', { params: { limit: 5 } }).then(r => r.data.remittances).catch(() => []),
  });
  const { data: expenses } = useQuery({
    queryKey: ['owner-expenses'],
    queryFn: () => api.get('/expenses', { params: { limit: 5 } }).then(r => r.data.expenses).catch(() => []),
  });

  const d = dash || {};

  return (
    <AppLayout title="Owner Portfolio">
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Hero income strip */}
        <div style={{ background: 'linear-gradient(135deg, #0C1117 0%, #1D2837 60%, #283548 100%)', borderRadius: 18, padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(217,119,6,0.1)', pointerEvents: 'none' }} />
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Net income this month</p>
          <p style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontWeight: 800, fontSize: 40, color: (d.net_income || 0) >= 0 ? '#86EFAC' : '#FCA5A5', letterSpacing: '-0.03em', marginBottom: 12 }}>
            {fmt(d.net_income || 0)}
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              ['Gross collected', fmt(d.gross_collected)],
              ['Management fee', fmt(d.management_fee)],
              ['Total expenses', fmt(d.total_expenses)],
            ].map(([l, v]) => (
              <div key={l}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{l}</p>
                <p style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="lg:grid-cols-4">
          <KpiCard label="Properties"     value={d.total_properties || 0}  icon="🏢" color="slate"  loading={isLoading} />
          <KpiCard label="Units"          value={d.total_units || 0}        icon="🔑" color="blue"   loading={isLoading} sub={`${d.occupied_units||0} occupied`} />
          <KpiCard label="Active tenants" value={d.active_tenants || 0}     icon="👥" color="green"  loading={isLoading} />
          <KpiCard label="Outstanding"    value={fmt(d.outstanding)}         icon="⚠️" color="amber"  loading={isLoading} />
        </div>

        {/* Revenue by property chart */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
          <Section title="Revenue by property" to="/owner/properties" />
          {!(d.by_property || []).length
            ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={d.by_property || []} barSize={32}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#F0EEE9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#9C9991', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [fmt(v), 'Collected']} />
                  <Bar dataKey="collected" fill="#D97706" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Remittances + Expenses */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Recent remittances" to="/owner/remittances" />
            {!(remits || []).length
              ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>No remittances yet</div>
              : (remits || []).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: i < (remits||[]).length - 1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.property_name || 'Remittance'}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono,monospace' }}>{fmtDate(r.remittance_date || r.created_at)}</p>
                  </div>
                  <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#16A34A' }}>{fmt(r.amount)}</p>
                </div>
              ))
            }
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Recent expenses" to="/owner/expenses" />
            {!(expenses || []).length
              ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>No expenses recorded</div>
              : (expenses || []).map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: i < (expenses||[]).length - 1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{e.category?.replace(/_/g,' ')}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.description || e.property_name}</p>
                  </div>
                  <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#DC2626' }}>{fmt(e.amount)}</p>
                </div>
              ))
            }
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
