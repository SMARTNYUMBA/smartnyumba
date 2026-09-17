import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetPasswordByLink } from '../../api';

/**
 * /reset-password?token=<rawToken>
 * Handles the email password reset link flow.
 * Token is extracted from the URL, validated on submit.
 */
export default function ResetPasswordByLink() {
  const [params]        = useSearchParams();
  const token           = params.get('token');
  const navigate        = useNavigate();

  const [newPw,  setNewPw]  = useState('');
  const [confirm,setConfirm]= useState('');
  const [show,   setShow]   = useState(false);
  const [busy,   setBusy]   = useState(false);
  const [done,   setDone]   = useState(false);

  // Redirect to forgot-password if no token in URL
  useEffect(() => {
    if (!token) navigate('/forgot-password', { replace: true });
  }, [token, navigate]);

  const passwordStrength = (pw) => {
    if (!pw) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8)   score++;
    if (pw.length >= 12)  score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
      { score: 0, label: '',          color: '' },
      { score: 1, label: 'Weak',      color: 'bg-red-400' },
      { score: 2, label: 'Fair',      color: 'bg-amber-400' },
      { score: 3, label: 'Good',      color: 'bg-yellow-400' },
      { score: 4, label: 'Strong',    color: 'bg-green-400' },
      { score: 5, label: 'Very strong', color: 'bg-green-600' },
    ];
    return levels[Math.min(score, 5)];
  };

  const strength = passwordStrength(newPw);

  const handleSubmit = async e => {
    e.preventDefault();
    if (newPw.length < 8) return toast.error('Password must be at least 8 characters');
    if (newPw !== confirm) return toast.error('Passwords do not match');
    setBusy(true);
    try {
      await resetPasswordByLink({ token, new_password: newPw });
      setDone(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      const msg = err.response?.data?.error || 'Reset link is invalid or has expired';
      toast.error(msg);
      if (msg.includes('expired') || msg.includes('invalid')) {
        setTimeout(() => navigate('/forgot-password', { replace: true }), 2000);
      }
    } finally { setBusy(false); }
  };

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[--brand] rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">SN</div>
          <h1 className="text-xl font-bold text-white">Create new password</h1>
          <p className="text-brand-300 text-sm mt-1">Choose a strong password for your account</p>
        </div>

        <div className="bg-[--surface] rounded-2xl shadow-2xl p-8">
          {done ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto">✅</div>
              <h3 className="font-semibold text-[--text-primary]">Password updated!</h3>
              <p className="text-sm text-[--text-muted]">Redirecting you to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New password */}
              <div>
                <label className="label" htmlFor="new-pw">New password</label>
                <div className="relative">
                  <input
                    id="new-pw"
                    className="input pr-10"
                    type={show ? 'text' : 'password'}
                    placeholder="Min 8 characters"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    required
                    autoFocus
                    autoComplete="new-password"
                    aria-describedby="pw-strength"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(s=>!s)}
                    className="absolute right-3 top-2.5 text-[--text-muted] hover:text-[--text-secondary]"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? '🙈' : '👁️'}
                  </button>
                </div>

                {/* Strength meter */}
                {newPw && (
                  <div id="pw-strength" className="mt-2" aria-live="polite">
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4,5].map(i => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i <= strength.score ? strength.color : 'bg-[--canvas-200]'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-[--text-muted]">{strength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="label" htmlFor="confirm-pw">Confirm password</label>
                <input
                  id="confirm-pw"
                  className={`input ${confirm && confirm !== newPw ? 'border-red-400 focus:ring-red-300' : ''}`}
                  type={show ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={confirm && confirm !== newPw ? 'true' : undefined}
                />
                {confirm && confirm !== newPw && (
                  <p className="text-xs text-[--red] mt-1" role="alert">Passwords do not match</p>
                )}
              </div>

              {/* Requirements checklist */}
              <ul className="text-xs space-y-1 text-[--text-muted]" aria-label="Password requirements">
                {[
                  [newPw.length >= 8,       'At least 8 characters'],
                  [/[A-Z]/.test(newPw),     'One uppercase letter'],
                  [/[0-9]/.test(newPw),     'One number'],
                ].map(([met, label]) => (
                  <li key={label} className={`flex items-center gap-2 ${met ? 'text-[--green]' : ''}`}>
                    <span aria-hidden="true">{met ? '✓' : '○'}</span> {label}
                  </li>
                ))}
              </ul>

              <button
                className="btn-primary w-full justify-center py-3"
                disabled={busy || newPw !== confirm || newPw.length < 8}
              >
                {busy ? 'Saving…' : 'Set new password'}
              </button>

              <p className="text-center text-xs text-[--text-muted]">
                <Link to="/forgot-password" className="text-[--brand] hover:underline">Request a new link</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
