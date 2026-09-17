import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';

const PLANS = [
  { id:'starter',      name:'Starter',      price:'KES 2,999/mo', units:50,  users:5,  desc:'Perfect for small portfolios' },
  { id:'professional', name:'Professional', price:'KES 9,999/mo', units:500, users:25, desc:'For growing agencies' },
  { id:'enterprise',   name:'Enterprise',   price:'Custom',       units:'∞', users:'∞',desc:'For large property groups' },
];

export default function Register() {
  const nav = useNavigate();
  const [step, setStep]   = useState(1);
  const [busy, setBusy]   = useState(false);
  const [form, setForm]   = useState({
    org_name:'', plan:'professional',
    owner_name:'', owner_email:'', owner_phone:'', owner_password:'', confirm_pw:'',
  });
  const set = (k) => (e) => setForm(p=>({...p,[k]:e.target.value}));

  const submit = async () => {
    if (form.owner_password !== form.confirm_pw)
      return toast.error('Passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.post('/organisations/register', {
        org_name: form.org_name, plan: form.plan,
        owner_name: form.owner_name, owner_email: form.owner_email,
        owner_phone: form.owner_phone, owner_password: form.owner_password,
      });
      // Store tokens
      if (data.access_token) {
        sessionStorage.setItem('snp_access', data.access_token);
      }
      toast.success('Organisation created! Let\'s set it up.');
      nav('/onboarding/step/1');
    } catch(e) {
      toast.error(e.response?.data?.error || 'Registration failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-white mb-1">SmartNyumba <span className="text-indigo-400">Pro</span></div>
          <p className="text-[--text-muted] text-sm">Start your 14-day free trial — no card required</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          {/* Progress */}
          <div className="flex gap-2 mb-8">
            {[1,2,3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${step>=s?'bg-indigo-500':'bg-slate-700'}`}/>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-white font-semibold text-lg">Choose your plan</h2>
              <div className="space-y-3">
                {PLANS.map(p => (
                  <label key={p.id} className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${form.plan===p.id?'border-indigo-500 bg-indigo-950/40':'border-slate-700 hover:border-slate-600'}`}>
                    <input type="radio" name="plan" value={p.id} checked={form.plan===p.id} onChange={set('plan')} className="mt-1"/>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{p.name}</span>
                        <span className="text-indigo-400 font-semibold text-sm">{p.price}</span>
                      </div>
                      <p className="text-[--text-muted] text-sm mt-0.5">{p.desc}</p>
                      <p className="text-[--text-muted] text-xs mt-1">{p.units} units · {p.users} users</p>
                    </div>
                  </label>
                ))}
              </div>
              <button className="btn-primary w-full mt-2" onClick={()=>setStep(2)}>Continue →</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-white font-semibold text-lg">Your organisation</h2>
              <div>
                <label className="label">Company / Organisation name</label>
                <input className="input w-full" placeholder="e.g. Acme Realty Ltd" value={form.org_name} onChange={set('org_name')}/>
              </div>
              <div>
                <label className="label">Your full name</label>
                <input className="input w-full" placeholder="John Doe" value={form.owner_name} onChange={set('owner_name')}/>
              </div>
              <div>
                <label className="label">Work email</label>
                <input className="input w-full" type="email" placeholder="you@company.com" value={form.owner_email} onChange={set('owner_email')}/>
              </div>
              <div>
                <label className="label">Phone (07XX XXX XXX)</label>
                <input className="input w-full" type="tel" placeholder="0712 345 678" value={form.owner_phone} onChange={set('owner_phone')}/>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={()=>setStep(1)}>← Back</button>
                <button className="btn-primary flex-1" onClick={()=>{ if (!form.org_name||!form.owner_name) return toast.error('All fields required'); setStep(3); }}>Continue →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-white font-semibold text-lg">Set your password</h2>
              <div>
                <label className="label">Password</label>
                <input className="input w-full" type="password" placeholder="Min 8 chars, 1 uppercase, 1 number" value={form.owner_password} onChange={set('owner_password')}/>
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input className="input w-full" type="password" placeholder="Repeat password" value={form.confirm_pw} onChange={set('confirm_pw')}/>
              </div>
              <div className="bg-slate-800 rounded-lg p-3 text-sm text-[--text-muted]">
                <p>✓ 14-day free trial, cancel anytime</p>
                <p>✓ No credit card required to start</p>
                <p>✓ All data stored securely in East Africa</p>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={()=>setStep(2)}>← Back</button>
                <button className="btn-primary flex-1" onClick={submit} disabled={busy}>
                  {busy ? 'Creating...' : 'Create account'}
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-[--text-muted] text-sm mt-6">
            Already have an account? <Link to="/login" className="text-indigo-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
