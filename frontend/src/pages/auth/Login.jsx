import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { login } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { roleHome } from '../../utils/helpers';

// ── Animated Kenyan skyline + brand mark ────────────────────
const BrandPanel = () => (
  <div style={{
    background: 'linear-gradient(145deg, #0C1117 0%, #1D2837 60%, #111827 100%)',
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '3rem', position: 'relative', overflow: 'hidden',
  }}>
    {/* Decorative circles */}
    <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(217,119,6,0.06)', pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(245,158,11,0.05)', pointerEvents: 'none' }} />

    {/* Logo mark */}
    <div style={{ width: 60, height: 60, background: '#D97706', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 8px 32px rgba(217,119,6,0.4)' }}>
      <svg viewBox="0 0 20 20" fill="white" style={{ width: 28, height: 28 }}>
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4a1 1 0 001-1v-3h2v3a1 1 0 001 1h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
      </svg>
    </div>

    <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 800, fontSize: 36, color: 'white', letterSpacing: '-0.03em', marginBottom: '0.5rem', textAlign: 'center' }}>
      Smart<span style={{ color: '#FCD34D' }}>Nyumba</span>
    </h1>
    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: '3rem' }}>
      Property management built for Kenya — M-Pesa, Africa's Talking, and everything in between.
    </p>

    {/* Feature pills */}
    {[
      { icon: '💳', label: 'M-Pesa STK Push payments' },
      { icon: '📲', label: 'SMS & WhatsApp notifications' },
      { icon: '📊', label: 'P&L reports & rent roll' },
      { icon: '🔧', label: 'Maintenance & visitor management' },
    ].map((f, i) => (
      <div key={i} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '0.625rem 1rem', width: '100%', maxWidth: 300,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{f.icon}</span>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{f.label}</span>
      </div>
    ))}

    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: '2rem' }}>
      © {new Date().getFullYear()} SmartNyumba Pro v2.1
    </p>
  </div>
);

export default function Login() {
  const [form, setForm]       = useState({ identifier: '', password: '' });
  const [show, setShow]       = useState(false);
  const [busy, setBusy]       = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otp, setOtp]         = useState('');
  const { signIn }            = useAuth();
  const navigate              = useNavigate();
  const submittedRef          = useRef(false);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (submittedRef.current) return;
    if (!form.identifier || !form.password) return toast.error('Enter email/phone and password');
    submittedRef.current = true;
    setBusy(true);
    try {
      const { data } = await login(form);
      if (data.requires_mfa) {
        setTempToken(data.temp_token);
        setMfaStep(true);
        toast.success('OTP sent to your phone');
        submittedRef.current = false;
        setBusy(false);
        return;
      }
      signIn(data);
      setBusy(false);
      navigate(roleHome(data.user.role), { replace: true });
      setTimeout(() => toast.success(`Welcome back, ${data.user.full_name.split(' ')[0]}!`), 100);
    } catch (loginErr) {
      toast.error(loginErr.response?.data?.error || 'Login failed');
      submittedRef.current = false;
      setBusy(false);
    }
  };

  const verifyOtp = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!otp || otp.length !== 6) return toast.error('Enter the 6-digit OTP');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/mfa/verify', { temp_token: tempToken, otp });
      const { data: me } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${data.access_token}` } });
      signIn({ ...data, user: me.user });
      navigate(roleHome(me.user.role), { replace: true });
      setTimeout(() => toast.success(`Welcome back, ${me.user.full_name.split(' ')[0]}!`), 100);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally { setBusy(false); }
  };

  const resendOtp = async () => {
    try { await api.post('/auth/mfa/resend', { temp_token: tempToken }); toast.success('New OTP sent'); }
    catch { toast.error('Failed to resend OTP'); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F5F4F0' }}>

      {/* Left brand panel — hidden on mobile */}
      <div className="hidden lg:flex" style={{ width: 420, flexShrink: 0 }}>
        <BrandPanel />
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Mobile logo */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: 48, height: 48, background: '#D97706', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
              <svg viewBox="0 0 20 20" fill="white" style={{ width: 24, height: 24 }}>
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4a1 1 0 001-1v-3h2v3a1 1 0 001 1h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
              </svg>
            </div>
            <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 800, fontSize: 28, color: '#111', letterSpacing: '-0.02em' }}>
              Smart<span style={{ color: '#D97706' }}>Nyumba</span>
            </h1>
          </div>

          {!mfaStep ? (
            <form onSubmit={submit} className="animate-fade-in">
              <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 26, color: '#111', letterSpacing: '-0.02em', marginBottom: '0.375rem' }}>
                Welcome back
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: '2rem' }}>
                Sign in to your SmartNyumba account
              </p>

              <div className="form-group">
                <label className="label">Email or phone number</label>
                <input className="input" type="text" value={form.identifier}
                  onChange={set('identifier')} placeholder="admin@example.com or 0700000000"
                  autoComplete="username" autoFocus />
              </div>

              <div className="form-group">
                <label className="label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" style={{ paddingRight: '2.75rem' }}
                    type={show ? 'text' : 'password'} value={form.password}
                    onChange={set('password')} placeholder="••••••••" autoComplete="current-password" />
                  <button type="button" onClick={() => setShow(s => !s)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                    {show
                      ? <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
                      : <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                    }
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem', marginTop: '-0.5rem' }}>
                <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 500 }}>
                  Forgot password?
                </Link>
              </div>

              <button type="submit" disabled={busy} className="btn-brand btn-lg" style={{ width: '100%' }}>
                {busy
                  ? <><svg className="animate-spin" style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Signing in…</>
                  : 'Sign in'
                }
              </button>

              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <Link to="/signup" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  New organisation? <span style={{ color: 'var(--brand)', fontWeight: 600 }}>Start free trial →</span>
                </Link>
              </div>
            </form>

          ) : (
            /* ── OTP step ── */
            <form onSubmit={verifyOtp} className="animate-slide-up">
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ width: 52, height: 52, background: 'var(--brand-light)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', border: '1px solid #FDE68A' }}>
                  <svg viewBox="0 0 20 20" fill="#D97706" style={{ width: 24, height: 24 }}>
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                  </svg>
                </div>
                <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 24, color: '#111', marginBottom: '0.375rem' }}>
                  Two-step verification
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  Enter the 6-digit code sent to your phone
                </p>
              </div>

              <input
                className="input"
                style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.35em', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, padding: '0.875rem', marginBottom: '1rem' }}
                type="text" inputMode="numeric" value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                maxLength={6} placeholder="000000" autoFocus />

              <button type="submit" disabled={busy || otp.length !== 6} className="btn-brand btn-lg" style={{ width: '100%', marginBottom: '1rem' }}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <button type="button" onClick={resendOtp} style={{ color: 'var(--brand)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Resend code
                </button>
                <button type="button"
                  onClick={() => { setMfaStep(false); setOtp(''); setTempToken(''); submittedRef.current = false; }}
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Back to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
