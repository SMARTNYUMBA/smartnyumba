import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api';

const PLANS = [
  {
    id: 'trial',
    name: '14-Day Free Trial',
    price: 'Free',
    sub: 'No credit card required',
    color: '#6c63ff',
    limits: 'Up to 20 units · 3 users · 2 properties',
    features: ['All core features', 'M-Pesa payments', 'SMS & Email alerts', 'PDF reports'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 'KES 2,999',
    sub: 'per month',
    color: '#0ea5e9',
    limits: 'Up to 50 units · 5 users · 3 properties',
    features: ['Everything in Trial', '200 SMS/month', 'Maintenance tracking', 'Visitor logbook'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 'KES 9,999',
    sub: 'per month',
    color: '#10b981',
    badge: 'Most Popular',
    limits: 'Up to 500 units · 25 users · 20 properties',
    features: ['Everything in Starter', '2,000 SMS/month', 'WhatsApp alerts', 'API access', 'Bulk SMS', 'Advanced reports'],
  },
];

export default function OrgSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=plan, 2=details
  const [plan, setPlan] = useState('trial');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    org_name: '', full_name: '', email: '', phone: '', password: '', confirm_password: '',
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (form.password !== form.confirm_password) return toast.error('Passwords do not match');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      await api.post('/organisations/register', { ...form, plan });
      toast.success('Account created! Redirecting to login…');
      setTimeout(() => navigate('/login?registered=1'), 1500);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Registration failed. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoMark}>🏢</span>
          <span style={styles.logoText}>SmartNyumba Pro</span>
        </div>

        <h1 style={styles.title}>
          {step === 1 ? 'Choose your plan' : 'Create your account'}
        </h1>
        <p style={styles.sub}>
          {step === 1
            ? 'Start free. Upgrade anytime. Cancel anytime.'
            : 'Set up your organisation in under 2 minutes.'}
        </p>

        {/* Step 1 — Plan selection */}
        {step === 1 && (
          <div>
            <div style={styles.planGrid}>
              {PLANS.map(p => (
                <div
                  key={p.id}
                  style={{ ...styles.planCard, ...(plan === p.id ? { borderColor: p.color, background: `${p.color}10` } : {}) }}
                  onClick={() => setPlan(p.id)}
                >
                  {p.badge && <div style={{ ...styles.badge, background: p.color }}>{p.badge}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ ...styles.radioOuter, borderColor: plan === p.id ? p.color : '#374151' }}>
                      {plan === p.id && <div style={{ ...styles.radioInner, background: p.color }} />}
                    </div>
                    <span style={styles.planName}>{p.name}</span>
                  </div>
                  <div style={{ ...styles.planPrice, color: p.color }}>{p.price}</div>
                  <div style={styles.planSub}>{p.sub}</div>
                  <div style={styles.planLimits}>{p.limits}</div>
                  <ul style={styles.featureList}>
                    {p.features.map(f => (
                      <li key={f} style={styles.featureItem}>
                        <span style={{ color: p.color }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button style={styles.btn} onClick={() => setStep(2)}>
              Continue with {PLANS.find(p => p.id === plan)?.name} →
            </button>
          </div>
        )}

        {/* Step 2 — Account details */}
        {step === 2 && (
          <form onSubmit={submit}>
            <div style={styles.selectedPlan}>
              Selected: <strong>{PLANS.find(p => p.id === plan)?.name}</strong>
              <button type="button" style={styles.changePlan} onClick={() => setStep(1)}>Change</button>
            </div>

            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Organisation / Company Name *</label>
                <input style={styles.input} placeholder="Sunrise Properties Ltd" value={form.org_name} onChange={set('org_name')} required />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Your Full Name *</label>
                <input style={styles.input} placeholder="John Kamau" value={form.full_name} onChange={set('full_name')} required />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Phone (254...) *</label>
                <input style={styles.input} placeholder="254712345678" value={form.phone} onChange={set('phone')} required />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Email Address *</label>
                <input style={styles.input} type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Password *</label>
                <input style={styles.input} type="password" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} required />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Confirm Password *</label>
                <input style={styles.input} type="password" placeholder="Repeat password" value={form.confirm_password} onChange={set('confirm_password')} required />
              </div>
            </div>

            <p style={styles.terms}>
              By creating an account you agree to our{' '}
              <a href="/terms" style={styles.link}>Terms of Service</a> and{' '}
              <a href="/privacy" style={styles.link}>Privacy Policy</a>.
            </p>

            <button style={{ ...styles.btn, opacity: busy ? 0.7 : 1 }} disabled={busy} type="submit">
              {busy ? 'Creating account…' : 'Create Account →'}
            </button>
          </form>
        )}

        <p style={styles.loginPrompt}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' },
  card: { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '2.5rem', width: '100%', maxWidth: 780 },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' },
  logoMark: { fontSize: 28 },
  logoText: { fontSize: 20, fontWeight: 700, color: '#e8eaf0' },
  title: { fontSize: 24, fontWeight: 700, color: '#e8eaf0', marginBottom: 6 },
  sub: { fontSize: 14, color: '#7c8498', marginBottom: '1.75rem' },
  planGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem', marginBottom: '1.5rem' },
  planCard: { border: '1.5px solid #2a2d3a', borderRadius: 12, padding: '1.25rem', cursor: 'pointer', position: 'relative', transition: 'all .2s' },
  badge: { position: 'absolute', top: -10, right: 12, fontSize: 10, fontWeight: 700, color: '#fff', padding: '2px 8px', borderRadius: 20 },
  radioOuter: { width: 18, height: 18, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioInner: { width: 8, height: 8, borderRadius: '50%' },
  planName: { fontSize: 14, fontWeight: 600, color: '#e8eaf0' },
  planPrice: { fontSize: 22, fontWeight: 700, marginTop: 8 },
  planSub: { fontSize: 11, color: '#7c8498', marginBottom: 6 },
  planLimits: { fontSize: 11, color: '#9ca3af', marginBottom: 10, borderBottom: '1px solid #2a2d3a', paddingBottom: 8 },
  featureList: { listStyle: 'none', padding: 0, margin: 0 },
  featureItem: { fontSize: 12, color: '#9ca3af', padding: '2px 0', display: 'flex', gap: 6 },
  selectedPlan: { background: '#20232f', border: '1px solid #2a2d3a', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1.25rem', fontSize: 13, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 8 },
  changePlan: { marginLeft: 'auto', background: 'none', border: 'none', color: '#6c63ff', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem', marginBottom: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 500, color: '#9ca3af' },
  input: { background: '#20232f', border: '1px solid #2a2d3a', borderRadius: 8, padding: '10px 12px', color: '#e8eaf0', fontSize: 14, outline: 'none' },
  terms: { fontSize: 12, color: '#6b7280', marginBottom: '1.25rem', marginTop: '.5rem' },
  btn: { width: '100%', background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: '1rem' },
  loginPrompt: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  link: { color: '#6c63ff', textDecoration: 'none' },
};
