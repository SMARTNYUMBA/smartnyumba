import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { requestOtp, resetPassword, forgotPasswordEmail } from '../../api';

export default function ForgotPassword() {
  const navigate = useNavigate();

  // Which method: 'choose' | 'email' | 'sms'
  const [method, setMethod] = useState('choose');
  const [step,   setStep]   = useState(1); // SMS: 1=phone, 2=otp+pw

  // SMS state
  const [phone, setPhone] = useState('');
  const [otp,   setOtp]   = useState('');
  const [newPw, setNewPw] = useState('');
  const [show,  setShow]  = useState(false);

  // Email state
  const [email,      setEmail]      = useState('');
  const [emailSent,  setEmailSent]  = useState(false);

  const [busy, setBusy] = useState(false);

  // ── SMS: Step 1 — send OTP ────────────────────────────────
  const sendOtp = async e => {
    e.preventDefault();
    if (!phone) return toast.error('Enter your phone number');
    setBusy(true);
    try {
      await requestOtp({ phone: phone.trim() });
      toast.success('OTP sent to your phone!');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send OTP. Check your phone number.');
    } finally { setBusy(false); }
  };

  // ── SMS: Step 2 — verify OTP + set new password ───────────
  const doReset = async e => {
    e.preventDefault();
    if (!otp || !newPw) return toast.error('Enter the OTP and your new password');
    if (newPw.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      await resetPassword({ phone, otp, new_password: newPw });
      toast.success('Password reset! You can now log in.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid or expired OTP');
    } finally { setBusy(false); }
  };

  // ── Email: send reset link ────────────────────────────────
  const sendEmailLink = async e => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email address');
    setBusy(true);
    try {
      await forgotPasswordEmail({ email: email.trim().toLowerCase() });
      setEmailSent(true);
      toast.success('Reset link sent — check your inbox!');
    } catch (err) {
      // Always show success to avoid email enumeration
      setEmailSent(true);
      toast.success('If that email is registered, a reset link has been sent.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[--brand] rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg">
            SN
          </div>
          <h1 className="text-xl font-bold text-white">Reset your password</h1>
          <p className="text-brand-300 text-sm mt-1">Choose how you'd like to reset it</p>
        </div>

        <div className="bg-[--surface] rounded-2xl shadow-2xl p-8">

          {/* ── Step 0: Choose method ── */}
          {method === 'choose' && (
            <div className="space-y-4">
              <p className="text-sm text-[--text-secondary] text-center mb-6">
                How would you like to verify your identity?
              </p>

              {/* Email option */}
              <button
                onClick={() => setMethod('email')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[--border] hover:border-brand-400 hover:bg-[--brand-light] transition-all text-left group">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0 group-hover:bg-brand-100">
                  📧
                </div>
                <div>
                  <p className="font-semibold text-[--text-primary] text-sm">Email reset link</p>
                  <p className="text-xs text-[--text-muted] mt-0.5">
                    We'll email you a secure link to reset your password
                  </p>
                </div>
                <span className="ml-auto text-[--text-muted] group-hover:text-[--brand]">›</span>
              </button>

              {/* SMS option */}
              <button
                onClick={() => setMethod('sms')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[--border] hover:border-brand-400 hover:bg-[--brand-light] transition-all text-left group">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0 group-hover:bg-brand-100">
                  📱
                </div>
                <div>
                  <p className="font-semibold text-[--text-primary] text-sm">SMS OTP</p>
                  <p className="text-xs text-[--text-muted] mt-0.5">
                    We'll text you a 6-digit code to verify and reset
                  </p>
                </div>
                <span className="ml-auto text-[--text-muted] group-hover:text-[--brand]">›</span>
              </button>

              <p className="text-center text-xs text-[--text-muted] pt-2">
                <Link to="/login" className="text-[--brand] hover:underline">← Back to login</Link>
              </p>
            </div>
          )}

          {/* ── Email flow ── */}
          {method === 'email' && (
            emailSent ? (
              /* Success state */
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto">
                  ✅
                </div>
                <h3 className="font-semibold text-[--text-primary]">Check your inbox</h3>
                <p className="text-sm text-[--text-muted]">
                  We sent a reset link to <strong className="text-[--text-primary]">{email}</strong>.
                  The link expires in <strong>1 hour</strong>.
                </p>
                <div className="bg-[--amber-bg] border border-[--amber-bg] rounded-xl p-3 text-xs text-amber-800">
                  💡 Don't see it? Check your spam folder, or{' '}
                  <button onClick={() => { setEmailSent(false); }} className="underline font-medium">
                    try again
                  </button>.
                </div>
                <p className="text-xs text-[--text-muted]">
                  <Link to="/login" className="text-[--brand] hover:underline">← Back to login</Link>
                </p>
              </div>
            ) : (
              /* Email input form */
              <form onSubmit={sendEmailLink} className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <button type="button" onClick={() => setMethod('choose')}
                    className="text-[--text-muted] hover:text-[--text-secondary] text-lg leading-none">
                    ←
                  </button>
                  <div>
                    <h2 className="font-semibold text-[--text-primary] text-sm">Reset via email</h2>
                    <p className="text-xs text-[--text-muted]">We'll send a secure reset link</p>
                  </div>
                </div>

                <div>
                  <label className="label">Email address</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>

                <button className="btn-primary w-full justify-center py-3" disabled={busy}>
                  {busy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending link...
                    </span>
                  ) : 'Send reset link →'}
                </button>

                <p className="text-center text-xs text-[--text-muted]">
                  <Link to="/login" className="text-[--brand] hover:underline">← Back to login</Link>
                </p>
              </form>
            )
          )}

          {/* ── SMS flow ── */}
          {method === 'sms' && (
            step === 1 ? (
              /* Phone number form */
              <form onSubmit={sendOtp} className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <button type="button" onClick={() => setMethod('choose')}
                    className="text-[--text-muted] hover:text-[--text-secondary] text-lg leading-none">
                    ←
                  </button>
                  <div>
                    <h2 className="font-semibold text-[--text-primary] text-sm">Reset via SMS</h2>
                    <p className="text-xs text-[--text-muted]">Enter your registered phone number</p>
                  </div>
                </div>

                <div>
                  <label className="label">Phone number</label>
                  <input
                    className="input"
                    type="tel"
                    placeholder="07XX XXX XXX"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    autoFocus
                    autoComplete="tel"
                  />
                </div>

                <button className="btn-primary w-full justify-center py-3" disabled={busy}>
                  {busy ? 'Sending OTP...' : 'Send OTP →'}
                </button>

                <p className="text-center text-xs text-[--text-muted]">
                  <Link to="/login" className="text-[--brand] hover:underline">← Back to login</Link>
                </p>
              </form>
            ) : (
              /* OTP + new password form */
              <form onSubmit={doReset} className="space-y-4">
                <div className="alert-info text-sm">
                  OTP sent to <strong>{phone}</strong>. Valid for 10 minutes.
                </div>

                <div>
                  <label className="label">6-digit OTP</label>
                  <input
                    className="input tracking-widest text-center text-xl font-mono"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label">New password</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={show ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShow(s => !s)}
                      className="absolute right-3 top-2.5 text-[--text-muted] hover:text-[--text-secondary]">
                      {show ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {/* Simple strength bar */}
                  {newPw && (
                    <div className="flex gap-1 mt-2">
                      {[1,2,3,4].map(i => {
                        const score = [newPw.length>=8, /[A-Z]/.test(newPw), /[0-9]/.test(newPw), /[^A-Za-z0-9]/.test(newPw)].filter(Boolean).length;
                        return <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i<=score ? (score<2?'bg-red-400':score<3?'bg-amber-400':'bg-green-500') : 'bg-[--canvas-200]'}`} />;
                      })}
                    </div>
                  )}
                </div>

                <button className="btn-primary w-full justify-center py-3" disabled={busy}>
                  {busy ? 'Resetting...' : 'Reset password'}
                </button>

                <button type="button" onClick={() => setStep(1)}
                  className="text-xs text-[--text-muted] hover:underline w-full text-center">
                  ← Didn't receive OTP? Go back
                </button>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  );
}
