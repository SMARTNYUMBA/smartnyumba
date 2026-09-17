import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api';

const PLANS = [
  {
    id: 'starter', name: 'Starter', price: 'KES 2,999/mo',
    color: '#0ea5e9', limits: '50 units · 5 users · 3 properties',
    features: ['Core property management', 'M-Pesa payments', '200 SMS/month', 'PDF reports & invoices'],
  },
  {
    id: 'professional', name: 'Professional', price: 'KES 9,999/mo',
    color: '#10b981', badge: 'Most Popular', limits: '500 units · 25 users · 20 properties',
    features: ['Everything in Starter', '2,000 SMS/month', 'WhatsApp notifications', 'API access', 'Bulk SMS campaigns', 'Advanced analytics'],
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 'Contact us',
    color: '#f59e0b', limits: 'Unlimited everything',
    features: ['Everything in Professional', 'White-label branding', 'Custom domain', 'SSO integration', 'Dedicated support', 'SLA guarantee'],
  },
];

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #2a2d3a', borderTopColor: '#6c63ff', animation: 'spin 0.8s linear infinite' }} />
  </div>
);

export default function Billing() {
  const [upgrading, setUpgrading] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then(r => r.data),
  });

  const { data: invoiceData } = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: () => api.get('/billing/invoices').then(r => r.data),
  });

  const upgrade = async (planId) => {
    if (planId === 'enterprise') {
      window.open('mailto:sales@smartnyumba.co.ke?subject=Enterprise Plan Enquiry', '_blank');
      return;
    }
    setUpgrading(planId);
    try {
      const r = await api.post('/billing/initiate', { plan: planId });
      if (r.data.payment_url) {
        window.location.href = r.data.payment_url;
      } else if (r.data.manual) {
        toast.success(r.data.message, { duration: 8000 });
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not initiate payment');
    } finally { setUpgrading(null); }
  };

  if (isLoading) return <Spinner />;

  const { org, plan, usage, trial_days_remaining, is_expired } = data || {};
  const currentPlan = org?.plan || 'trial';

  const usageItems = [
    { label: 'Units', used: usage?.units || 0, max: plan?.max_units || 20, icon: '🚪' },
    { label: 'Users', used: usage?.users || 0, max: plan?.max_users || 3,  icon: '👥' },
    { label: 'SMS this month', used: usage?.sms_this_month || 0, max: plan?.sms_included || 0, icon: '💬' },
  ];

  return (
    <div style={s.page}>
      <h1 style={s.pageTitle}>Billing & Subscription</h1>
      <p style={s.pageSub}>Manage your plan, view usage, and download invoices.</p>

      {/* Trial banner */}
      {currentPlan === 'trial' && (
        <div style={{ ...s.banner, ...(is_expired ? s.bannerDanger : s.bannerWarn) }}>
          {is_expired
            ? '⛔ Your trial has expired. Choose a plan to continue using SmartNyumba Pro.'
            : `⏳ Trial: ${trial_days_remaining} day${trial_days_remaining === 1 ? '' : 's'} remaining. Upgrade now to keep your data.`}
        </div>
      )}

      {/* Current plan card */}
      <div style={s.currentCard}>
        <div style={s.currentLeft}>
          <div style={s.currentLabel}>Current Plan</div>
          <div style={s.currentPlan}>{plan?.name || 'Trial'}</div>
          <div style={s.currentOrg}>{org?.name}</div>
        </div>
        <div style={s.usageGrid}>
          {usageItems.map(item => {
            const pct = item.max > 0 ? Math.min((item.used / item.max) * 100, 100) : 0;
            const warn = pct >= 80;
            return (
              <div key={item.label} style={s.usageItem}>
                <div style={s.usageTop}>
                  <span style={s.usageLabel}>{item.icon} {item.label}</span>
                  <span style={{ ...s.usageCount, color: warn ? '#f59e0b' : '#9ca3af' }}>
                    {item.used} / {item.max === 99999 ? '∞' : item.max}
                  </span>
                </div>
                <div style={s.usageTrack}>
                  <div style={{ ...s.usageFill, width: `${pct}%`, background: warn ? '#f59e0b' : '#6c63ff' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan cards */}
      <h2 style={s.sectionTitle}>Available Plans</h2>
      <div style={s.planGrid}>
        {PLANS.map(p => {
          const isCurrent = currentPlan === p.id;
          return (
            <div key={p.id} style={{ ...s.planCard, ...(isCurrent ? { borderColor: p.color } : {}) }}>
              {p.badge && <div style={{ ...s.badge, background: p.color }}>{p.badge}</div>}
              <h3 style={{ ...s.planName, color: p.color }}>{p.name}</h3>
              <div style={s.planPrice}>{p.price}</div>
              <div style={s.planLimits}>{p.limits}</div>
              <ul style={s.featureList}>
                {p.features.map(f => <li key={f} style={s.featureItem}><span style={{ color: p.color }}>✓</span> {f}</li>)}
              </ul>
              <button
                style={{ ...s.planBtn, ...(isCurrent ? s.planBtnCurrent : { background: p.color }), opacity: upgrading ? 0.7 : 1 }}
                disabled={isCurrent || !!upgrading}
                onClick={() => !isCurrent && upgrade(p.id)}
              >
                {upgrading === p.id ? 'Redirecting…' : isCurrent ? '✓ Current Plan' : p.id === 'enterprise' ? 'Contact Sales' : `Upgrade to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Invoice history */}
      {invoiceData?.invoices?.length > 0 && (
        <>
          <h2 style={s.sectionTitle}>Invoice History</h2>
          <div style={s.table}>
            <div style={s.tableHead}>
              <span>Date</span><span>Description</span><span>Amount</span><span>Status</span>
            </div>
            {invoiceData.invoices.map(inv => (
              <div key={inv.id} style={s.tableRow}>
                <span style={s.cell}>{new Date(inv.created_at).toLocaleDateString('en-KE')}</span>
                <span style={s.cell}>{inv.description}</span>
                <span style={s.cell}>KES {Number(inv.amount).toLocaleString()}</span>
                <span style={{ ...s.cell }}>
                  <span style={{ ...s.statusBadge, ...(inv.status === 'paid' ? s.statusPaid : s.statusPending) }}>
                    {inv.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:          { padding: '1.5rem', maxWidth: 900, margin: '0 auto' },
  pageTitle:     { fontSize: 22, fontWeight: 700, color: '#e8eaf0', marginBottom: 4 },
  pageSub:       { fontSize: 13, color: '#7c8498', marginBottom: '1.5rem' },
  banner:        { borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem', fontSize: 13, fontWeight: 500 },
  bannerWarn:    { background: '#3b2d0f', color: '#fbbf24', border: '1px solid #92400e' },
  bannerDanger:  { background: '#3b1f1f', color: '#f87171', border: '1px solid #991b1b' },
  currentCard:   { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' },
  currentLeft:   { minWidth: 160 },
  currentLabel:  { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 },
  currentPlan:   { fontSize: 22, fontWeight: 700, color: '#6c63ff', marginBottom: 4 },
  currentOrg:    { fontSize: 13, color: '#9ca3af' },
  usageGrid:     { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  usageItem:     {},
  usageTop:      { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  usageLabel:    { fontSize: 12, color: '#9ca3af' },
  usageCount:    { fontSize: 12, fontWeight: 600 },
  usageTrack:    { height: 5, background: '#2a2d3a', borderRadius: 3, overflow: 'hidden' },
  usageFill:     { height: '100%', borderRadius: 3, transition: 'width .6s ease' },
  sectionTitle:  { fontSize: 16, fontWeight: 600, color: '#e8eaf0', marginBottom: '1rem' },
  planGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '1rem', marginBottom: '2rem' },
  planCard:      { background: '#1a1d27', border: '1.5px solid #2a2d3a', borderRadius: 12, padding: '1.5rem', position: 'relative' },
  badge:         { position: 'absolute', top: -10, right: 14, fontSize: 10, fontWeight: 700, color: '#fff', padding: '2px 8px', borderRadius: 20 },
  planName:      { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  planPrice:     { fontSize: 15, fontWeight: 600, color: '#e8eaf0', marginBottom: 4 },
  planLimits:    { fontSize: 11, color: '#6b7280', marginBottom: '0.875rem', paddingBottom: '0.875rem', borderBottom: '1px solid #2a2d3a' },
  featureList:   { listStyle: 'none', padding: 0, margin: '0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: 4 },
  featureItem:   { fontSize: 12, color: '#9ca3af', display: 'flex', gap: 6 },
  planBtn:       { width: '100%', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff' },
  planBtnCurrent:{ background: '#20232f', color: '#6c63ff', cursor: 'default' },
  table:         { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, overflow: 'hidden' },
  tableHead:     { display: 'grid', gridTemplateColumns: '120px 1fr 120px 100px', padding: '10px 16px', background: '#20232f', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' },
  tableRow:      { display: 'grid', gridTemplateColumns: '120px 1fr 120px 100px', padding: '10px 16px', borderTop: '1px solid #2a2d3a', alignItems: 'center' },
  cell:          { fontSize: 13, color: '#9ca3af' },
  statusBadge:   { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' },
  statusPaid:    { background: '#0f2b1f', color: '#34d399' },
  statusPending: { background: '#3b2d0f', color: '#fbbf24' },
};
