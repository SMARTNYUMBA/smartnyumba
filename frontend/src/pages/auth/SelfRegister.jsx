import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api';

export default function SelfRegister() {
  const { slug }   = useParams();
  const navigate   = useNavigate();
  const [property, setProperty] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [done,     setDone]     = useState(false);
  const [form,     setForm]     = useState({
    full_name:'', phone:'', email:'', password:'', confirm_password:'',
    id_number:'', emergency_contact:'', emergency_phone:'',
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get(`/auth/invite/${slug}`)
      .then(r => setProperty(r.data.property))
      .catch(() => toast.error('Invalid or expired invite link'))
      .finally(() => setLoading(false));
  }, [slug]);

  const submit = async e => {
    e.preventDefault();
    if (form.password !== form.confirm_password) return toast.error('Passwords do not match');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      await api.post('/auth/self-register', { ...form, property_slug: slug });
      setDone(true);
    } catch(err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setBusy(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[--brand] rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">SN</div>
          <h1 className="text-xl font-bold text-white">
            {property ? `Join ${property.name}` : 'Tenant Registration'}
          </h1>
          {property?.location && <p className="text-brand-300 text-sm mt-1">{property.location}</p>}
        </div>

        <div className="bg-[--surface] rounded-2xl shadow-2xl p-8">
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="text-5xl">🎉</div>
              <h2 className="font-bold text-[--text-primary]">Registration submitted!</h2>
              <p className="text-sm text-[--text-muted]">
                Your account is pending approval. You will receive an SMS once approved.
              </p>
              <Link to="/login" className="btn-primary block text-center">Go to login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="font-semibold text-[--text-primary]">Create your account</h2>

              <div>
                <label className="label">Full name *</label>
                <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="John Doe" required />
              </div>
              <div>
                <label className="label">Phone number *</label>
                <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX" required />
              </div>
              <div>
                <label className="label">Email address</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" />
              </div>
              <div>
                <label className="label">National ID number</label>
                <input className="input" value={form.id_number} onChange={set('id_number')} placeholder="e.g. 12345678" />
              </div>
              <div className="divider" />
              <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide">Emergency Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Contact name</label>
                  <input className="input" value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Next of kin" />
                </div>
                <div>
                  <label className="label">Contact phone</label>
                  <input className="input" type="tel" value={form.emergency_phone} onChange={set('emergency_phone')} placeholder="07XX XXX XXX" />
                </div>
              </div>
              <div className="divider" />
              <div>
                <label className="label">Password *</label>
                <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" required autoComplete="new-password" />
              </div>
              <div>
                <label className="label">Confirm password *</label>
                <input className={`input ${form.confirm_password && form.confirm_password !== form.password ? 'border-red-400' : ''}`}
                  type="password" value={form.confirm_password} onChange={set('confirm_password')} placeholder="Repeat password" required autoComplete="new-password" />
              </div>

              <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
                {busy ? 'Submitting…' : 'Register'}
              </button>
              <p className="text-center text-xs text-[--text-muted]">
                Already have an account? <Link to="/login" className="text-[--brand] hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
