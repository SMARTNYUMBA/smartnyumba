import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import Badge     from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { getInvoices, getMaintenance, getAnnouncements } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

// ── Section header ────────────────────────────────────────────
const Section = ({ title, to, action = 'View all' }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
    <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
      {title}
    </h2>
    {to && <Link to={to} style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{action} →</Link>}
  </div>
);


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function TenantDashboard() {
  const { user } = useAuth();
  const p = user?.profile || {};

  const { isLoading, data: invoices } = useQuery({
    queryKey: ['my-invoices'],
    queryFn: () => getInvoices({}).then(r => r.data.invoices),
  });
  const { data: maint } = useQuery({
    queryKey: ['my-maintenance'],
    queryFn: () => getMaintenance({ tenancy_id: p.tenancy_id }).then(r => r.data.requests),
    enabled: !!p.tenancy_id,
  });
  const { data: news } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => getAnnouncements().then(r => r.data.announcements),
  });

  const unpaid    = (invoices || []).filter(i => ['unpaid', 'overdue', 'partial'].includes(i.status));
  const balance   = unpaid.reduce((s, i) => s + Number(i.balance), 0);
  const nextDue   = unpaid.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
  const daysLeft  = nextDue ? Math.ceil((new Date(nextDue.due_date) - new Date()) / 86400000) : null;
  const openMaint = (maint || []).filter(m => !['completed', 'cancelled'].includes(m.status)).length;
  const hasOverdue = unpaid.some(i => i.status === 'overdue');

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="My Home">
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Hero card ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0C1117 0%, #1D2837 60%, #283548 100%)',
          borderRadius: 18,
          padding: '1.5rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative circle */}
          <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(217,119,6,0.12)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>Welcome back</p>
              <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 800, fontSize: 30, color: 'white', letterSpacing: '-0.03em', marginBottom: 12 }}>
                {user?.full_name?.split(' ')[0]}
              </h1>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  ['🏠', `Unit ${p.unit_number || '—'}`],
                  ['🏢', p.property_name || '—'],
                  ['💰', `${fmt(p.rent_amount || 0)}/mo`],
                ].map(([icon, label], i) => (
                  <span key={i} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>{icon}</span>{label}
                  </span>
                ))}
              </div>
            </div>

            {/* Balance indicator */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Balance due</p>
              <p style={{
                fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 800,
                fontSize: 32, letterSpacing: '-0.03em',
                color: balance > 0 ? '#FCA5A5' : '#86EFAC',
              }}>
                {balance > 0 ? fmt(balance) : 'Clear'}
              </p>
              {balance > 0 && (
                <Link to="/tenant/payments"
                  style={{ display: 'inline-block', marginTop: 8, background: '#D97706', color: 'white', fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '6px 14px', textDecoration: 'none' }}>
                  Pay now →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Overdue alert ── */}
        {hasOverdue && (
          <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 20 20" fill="#DC2626" style={{ width: 18, height: 18, flexShrink: 0 }}>
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>You have overdue invoices</p>
              <p style={{ fontSize: 12, color: '#9F1239' }}>Please pay to avoid additional late fees.</p>
            </div>
            <Link to="/tenant/payments" style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', flexShrink: 0 }}>Pay →</Link>
          </div>
        )}

        {/* ── KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }} className="sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Outstanding" value={fmt(balance)} icon="💳" color={balance > 0 ? 'red' : 'green'} />
          <KpiCard label="Unpaid invoices" value={unpaid.length} icon="🧾" color={unpaid.length > 0 ? 'amber' : 'green'} />
          <KpiCard
            label="Next due"
            value={nextDue ? fmtDate(nextDue.due_date) : 'None'}
            icon="📅"
            color={daysLeft !== null && daysLeft <= 7 ? 'red' : daysLeft !== null && daysLeft <= 30 ? 'amber' : 'green'}
            sub={daysLeft !== null ? `${daysLeft} days away` : undefined}
          />
          <KpiCard label="Open requests" value={openMaint} icon="🔧" color={openMaint > 0 ? 'amber' : 'green'} />
        </div>

        {/* ── Bottom grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">

          {/* Outstanding invoices */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Outstanding invoices" to="/tenant/invoices" />
            {!unpaid.length ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                All invoices paid!
              </div>
            ) : unpaid.slice(0, 4).map((inv, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: i < Math.min(unpaid.length, 4) - 1 ? '1px solid #F0EEE9' : 'none' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {inv.type?.replace(/_/g, ' ')} #{inv.id}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Due {fmtDate(inv.due_date)}</p>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
                  <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 15, color: '#DC2626' }}>
                    {fmt(inv.balance)}
                  </p>
                  <Badge status={inv.status} label={inv.status} />
                </div>
              </div>
            ))}
            {unpaid.length > 4 && (
              <Link to="/tenant/invoices" style={{ display: 'block', textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
                +{unpaid.length - 4} more
              </Link>
            )}
          </div>

          {/* Maintenance requests */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            <Section title="Maintenance requests" to="/tenant/maintenance" action="New request" />
            {!(maint || []).length ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                No open requests
              </div>
            ) : (maint || []).slice(0, 4).map((r, i) => {
              const pColor = { urgent: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A' }[r.priority] || '#9C9991';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.75rem 0', borderBottom: i < Math.min((maint || []).length, 4) - 1 ? '1px solid #F0EEE9' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: pColor, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</p>
                  </div>
                  <Badge status={r.status} label={r.status?.replace(/_/g, ' ')} />
                </div>
              );
            })}
          </div>

          {/* Announcements */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem', gridColumn: 'span 2' }} className="lg:col-span-2">
            <Section title="Announcements" to="/tenant/announcements" />
            {!(news || []).length ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>No announcements</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {(news || []).slice(0, 3).map((a, i) => (
                  <div key={i} style={{ background: 'var(--surface-muted)', borderRadius: 10, padding: '0.875rem', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{a.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.message || a.body}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmtDate(a.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── Quick actions ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="grid-cols-2 sm:grid-cols-4">
          {[
            { icon: '💳', label: 'Pay rent',     to: '/tenant/payments'    },
            { icon: '🔧', label: 'Report issue', to: '/tenant/maintenance' },
            { icon: '📄', label: 'My invoices',  to: '/tenant/invoices'    },
            { icon: '📋', label: 'My statement', to: '/tenant/statement'   },
          ].map(({ icon, label, to }) => (
            <Link key={to} to={to} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '1rem', textAlign: 'center', textDecoration: 'none',
              transition: 'all 0.15s ease', display: 'block',
            }}
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
