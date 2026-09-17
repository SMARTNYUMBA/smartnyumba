import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../api';
import toast from 'react-hot-toast';

const STEPS = ['Organisation','First Property','First Unit','Done'];

export default function Onboarding() {
  const nav = useNavigate();
  const qc  = useQueryClient();
  const [step, setStep]   = useState(1);
  const [busy, setBusy]   = useState(false);
  const [ids,  setIds]    = useState({ property_id: null, unit_id: null });

  const [orgForm,  setOrgForm]  = useState({ timezone:'Africa/Nairobi', currency:'KES' });
  const [propForm, setPropForm] = useState({ name:'', location:'', type:'apartment', total_units:'' });
  const [unitForm, setUnitForm] = useState({ unit_number:'', floor:'1', type:'one_bedroom', rent_amount:'', deposit_amount:'' });

  const setO = k => e => setOrgForm(p=>({...p,[k]:e.target.value}));
  const setP = k => e => setPropForm(p=>({...p,[k]:e.target.value}));
  const setU = k => e => setUnitForm(p=>({...p,[k]:e.target.value}));

  const saveOrg = async () => {
    setBusy(true);
    try {
      await api.patch('/organisations/me', orgForm);
      setStep(2);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const saveProperty = async () => {
    if (!propForm.name) return toast.error('Property name required');
    setBusy(true);
    try {
      const { data } = await api.post('/properties', propForm);
      setIds(p=>({...p, property_id: data.id}));
      setStep(3);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const saveUnit = async () => {
    if (!unitForm.unit_number || !unitForm.rent_amount) return toast.error('Unit number and rent required');
    setBusy(true);
    try {
      await api.post('/units', { ...unitForm, property_id: ids.property_id });
      qc.invalidateQueries(['properties']);
      qc.invalidateQueries(['units']);
      setStep(4);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const finish = () => nav('/admin/dashboard');

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-white mb-1">SmartNyumba <span className="text-indigo-400">Pro</span></div>
          <p className="text-[--text-muted] text-sm">Let's get your account set up — takes about 3 minutes</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-between mb-8 px-2">
          {STEPS.map((label,i)=>{
            const n = i+1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={label} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                  ${done?'bg-emerald-500 text-white':active?'bg-indigo-500 text-white':'bg-slate-700 text-[--text-muted]'}`}>
                  {done ? '✓' : n}
                </div>
                <span className={`text-xs ${active?'text-white':done?'text-emerald-400':'text-[--text-muted]'}`}>{label}</span>
                {i < STEPS.length-1 && <div className={`h-0.5 w-full mt-0 hidden sm:block ${done?'bg-emerald-500':'bg-slate-700'}`}/>}
              </div>
            );
          })}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

          {/* Step 1 — Org settings */}
          {step===1 && (
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <h2 className="text-white font-semibold text-lg">Organisation settings</h2>
              <div>
                <label className="label text-[--text-muted]">Timezone</label>
                <select className="input w-full bg-slate-800 border-slate-700 text-white" value={orgForm.timezone} onChange={setO('timezone')}>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                  <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
                  <option value="Africa/Johannesburg">Africa/Johannesburg (SAST, UTC+2)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="label text-[--text-muted]">Currency</label>
                <select className="input w-full bg-slate-800 border-slate-700 text-white" value={orgForm.currency} onChange={setO('currency')}>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="UGX">UGX — Ugandan Shilling</option>
                  <option value="TZS">TZS — Tanzanian Shilling</option>
                  <option value="USD">USD — US Dollar</option>
                </select>
              </div>
              <button className="btn-primary w-full" onClick={saveOrg} disabled={busy}>
                {busy ? 'Saving...' : 'Continue →'}
              </button>
            </div>
          )}

          {/* Step 2 — First property */}
          {step===2 && (
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <h2 className="text-white font-semibold text-lg">Add your first property</h2>
              <div>
                <label className="label text-[--text-muted]">Property name <span className="text-red-400">*</span></label>
                <input className="input w-full bg-slate-800 border-slate-700 text-white" placeholder="e.g. Westlands Heights" value={propForm.name} onChange={setP('name')}/>
              </div>
              <div>
                <label className="label text-[--text-muted]">Location / Address</label>
                <input className="input w-full bg-slate-800 border-slate-700 text-white" placeholder="e.g. Westlands, Nairobi" value={propForm.location} onChange={setP('location')}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-[--text-muted]">Type</label>
                  <select className="input w-full bg-slate-800 border-slate-700 text-white" value={propForm.type} onChange={setP('type')}>
                    <option value="apartment">Apartment block</option>
                    <option value="townhouse">Townhouse complex</option>
                    <option value="commercial">Commercial</option>
                    <option value="mixed">Mixed use</option>
                  </select>
                </div>
                <div>
                  <label className="label text-[--text-muted]">Total units</label>
                  <input className="input w-full bg-slate-800 border-slate-700 text-white" type="number" placeholder="e.g. 24" value={propForm.total_units} onChange={setP('total_units')}/>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={()=>setStep(1)}>← Back</button>
                <button className="btn-primary flex-1" onClick={saveProperty} disabled={busy}>
                  {busy ? 'Saving...' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — First unit */}
          {step===3 && (
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <h2 className="text-white font-semibold text-lg">Add your first unit</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-[--text-muted]">Unit number <span className="text-red-400">*</span></label>
                  <input className="input w-full bg-slate-800 border-slate-700 text-white" placeholder="e.g. A1" value={unitForm.unit_number} onChange={setU('unit_number')}/>
                </div>
                <div>
                  <label className="label text-[--text-muted]">Floor</label>
                  <input className="input w-full bg-slate-800 border-slate-700 text-white" type="number" placeholder="1" value={unitForm.floor} onChange={setU('floor')}/>
                </div>
              </div>
              <div>
                <label className="label text-[--text-muted]">Unit type</label>
                <select className="input w-full bg-slate-800 border-slate-700 text-white" value={unitForm.type} onChange={setU('type')}>
                  <option value="bedsitter">Bedsitter</option>
                  <option value="one_bedroom">1 Bedroom</option>
                  <option value="two_bedroom">2 Bedrooms</option>
                  <option value="three_bedroom">3 Bedrooms</option>
                  <option value="studio">Studio</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-[--text-muted]">Monthly rent (KES) <span className="text-red-400">*</span></label>
                  <input className="input w-full bg-slate-800 border-slate-700 text-white" type="number" placeholder="15000" value={unitForm.rent_amount} onChange={setU('rent_amount')}/>
                </div>
                <div>
                  <label className="label text-[--text-muted]">Deposit (KES)</label>
                  <input className="input w-full bg-slate-800 border-slate-700 text-white" type="number" placeholder="30000" value={unitForm.deposit_amount} onChange={setU('deposit_amount')}/>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={()=>setStep(2)}>← Back</button>
                <button className="btn-primary flex-1" onClick={saveUnit} disabled={busy}>
                  {busy ? 'Saving...' : 'Continue →'}
                </button>
              </div>
              <button className="w-full text-center text-[--text-muted] text-sm hover:text-[--text-muted]" onClick={()=>setStep(4)}>
                Skip for now →
              </button>
            </div>
          )}

          {/* Step 4 — Done */}
          {step===4 && (
            <div className="text-center space-y-5">
              <div className="text-5xl">🎉</div>
              <h2 className="text-white font-semibold text-xl">You're all set!</h2>
              <p className="text-[--text-muted] text-sm leading-relaxed">
                Your organisation is configured. Next steps: invite your property managers,
                add tenants, and start collecting rent.
              </p>
              <div className="space-y-2 text-left bg-slate-800 rounded-xl p-4">
                {[
                  '✅ Organisation created',
                  ids.property_id ? '✅ First property added' : '⏭ Property — add later',
                  '✅ Account ready',
                ].map((t,i)=><p key={i} className="text-sm text-[--text-muted]">{t}</p>)}
              </div>
              <button className="btn-primary w-full" onClick={finish}>Go to dashboard →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
