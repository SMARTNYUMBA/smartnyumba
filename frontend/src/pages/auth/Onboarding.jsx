import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api';

const STEPS = [
  { id: 1, icon: '🏢', title: 'Add your first property',  sub: 'Enter the name and address of a property you manage.' },
  { id: 2, icon: '🚪', title: 'Add a unit',               sub: 'Add at least one rentable unit in that property.' },
  { id: 3, icon: '👤', title: 'Invite your caretaker',    sub: 'Optional — send an invite link to your on-site caretaker.' },
  { id: 4, icon: '🎉', title: 'You\'re ready!',           sub: 'Your account is fully set up. Start adding tenants.' },
];

export default function Onboarding() {
  const navigate   = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [propertyId, setPropertyId] = useState(null);

  // Step forms state
  const [prop,  setProp]  = useState({ name: '', address: '', county: '', type: 'apartment' });
  const [unit,  setUnit]  = useState({ unit_number: '', bedrooms: '1', monthly_rent: '', deposit: '' });
  const [caret, setCaret] = useState({ full_name: '', email: '', phone: '' });

  const setP = k => e => setProp(p => ({ ...p, [k]: e.target.value }));
  const setU = k => e => setUnit(p => ({ ...p, [k]: e.target.value }));
  const setC = k => e => setCaret(p => ({ ...p, [k]: e.target.value }));

  const submitProperty = async () => {
    if (!prop.name.trim()) return toast.error('Property name is required');
    setBusy(true);
    try {
      const r = await api.post('/properties', prop);
      setPropertyId(r.data.property?.id || r.data.id);
      setStep(2);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create property'); }
    finally { setBusy(false); }
  };

  const submitUnit = async () => {
    if (!unit.unit_number.trim()) return toast.error('Unit number is required');
    if (!unit.monthly_rent)       return toast.error('Monthly rent is required');
    setBusy(true);
    try {
      await api.post('/units', { ...unit, property_id: propertyId });
      setStep(3);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create unit'); }
    finally { setBusy(false); }
  };

  const submitCaretaker = async () => {
    if (caret.email || caret.phone) {
      setBusy(true);
      try {
        await api.post('/users', { ...caret, role: 'caretaker', property_id: propertyId });
      } catch (e) { toast.error(e.response?.data?.error || 'Could not invite caretaker'); }
      finally { setBusy(false); }
    }
    setStep(4);
  };

  const finish = () => {
    // Mark onboarding done so it doesn't show again
    try { localStorage.setItem('snp_onboarded', '1'); } catch {}
    navigate('/dashboard');
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.logo}>🏢 SmartNyumba Pro</span>
          <span style={s.stepLabel}>Step {step} of {STEPS.length}</span>
        </div>

        {/* Progress bar */}
        <div style={s.track}>
          <div style={{ ...s.fill, width: `${progress}%` }} />
        </div>

        {/* Step indicators */}
        <div style={s.steps}>
          {STEPS.map(st => (
            <div key={st.id} style={s.stepDot}>
              <div style={{ ...s.dot, ...(step > st.id ? s.dotDone : step === st.id ? s.dotActive : s.dotIdle) }}>
                {step > st.id ? '✓' : st.id}
              </div>
              <div style={{ ...s.dotLabel, color: step >= st.id ? '#e8eaf0' : '#4b5563' }}>{st.title.split(' ').slice(0, 2).join(' ')}</div>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={s.content}>
          <div style={s.stepIcon}>{STEPS[step - 1].icon}</div>
          <h2 style={s.title}>{STEPS[step - 1].title}</h2>
          <p style={s.sub}>{STEPS[step - 1].sub}</p>

          {/* Step 1 — Property */}
          {step === 1 && (
            <div style={s.form}>
              <Field label="Property Name *" placeholder="Sunrise Apartments" value={prop.name} onChange={setP('name')} />
              <Field label="Address *" placeholder="14 Moi Avenue, Westlands, Nairobi" value={prop.address} onChange={setP('address')} />
              <div style={s.row}>
                <Field label="County" placeholder="Nairobi" value={prop.county} onChange={setP('county')} />
                <div style={s.field}>
                  <label style={s.label}>Property Type</label>
                  <select style={s.input} value={prop.type} onChange={setP('type')}>
                    <option value="apartment">Apartment Block</option>
                    <option value="maisonette">Maisonettes</option>
                    <option value="bungalow">Bungalows</option>
                    <option value="bedsitter">Bedsitters</option>
                    <option value="commercial">Commercial</option>
                    <option value="mixed">Mixed Use</option>
                  </select>
                </div>
              </div>
              <Btn label={busy ? 'Saving…' : 'Add Property & Continue →'} onClick={submitProperty} disabled={busy} />
            </div>
          )}

          {/* Step 2 — Unit */}
          {step === 2 && (
            <div style={s.form}>
              <div style={s.row}>
                <Field label="Unit Number *" placeholder="A1, 101, Ground Floor…" value={unit.unit_number} onChange={setU('unit_number')} />
                <div style={s.field}>
                  <label style={s.label}>Bedrooms</label>
                  <select style={s.input} value={unit.bedrooms} onChange={setU('bedrooms')}>
                    {['Bedsitter', '1', '2', '3', '4', '5+'].map(b => <option key={b} value={b}>{b === 'Bedsitter' ? 'Bedsitter' : `${b} Bedroom${b === '1' ? '' : 's'}`}</option>)}
                  </select>
                </div>
              </div>
              <div style={s.row}>
                <Field label="Monthly Rent (KES) *" placeholder="15000" type="number" value={unit.monthly_rent} onChange={setU('monthly_rent')} />
                <Field label="Deposit (KES)" placeholder="30000" type="number" value={unit.deposit} onChange={setU('deposit')} />
              </div>
              <Btn label={busy ? 'Saving…' : 'Add Unit & Continue →'} onClick={submitUnit} disabled={busy} />
            </div>
          )}

          {/* Step 3 — Caretaker */}
          {step === 3 && (
            <div style={s.form}>
              <Field label="Caretaker Full Name" placeholder="James Otieno" value={caret.full_name} onChange={setC('full_name')} />
              <div style={s.row}>
                <Field label="Phone (254…)" placeholder="254712345678" value={caret.phone} onChange={setC('phone')} />
                <Field label="Email" placeholder="caretaker@email.com" value={caret.email} onChange={setC('email')} />
              </div>
              <Btn label={busy ? 'Inviting…' : (caret.email || caret.phone) ? 'Invite Caretaker →' : 'Skip for now →'} onClick={submitCaretaker} disabled={busy} />
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 4 && (
            <div style={{ textAlign: 'center' }}>
              <div style={s.successBadge}>✅ Setup Complete!</div>
              <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: '1.5rem' }}>
                Your SmartNyumba Pro account is ready. Here's what to do next:
              </p>
              <div style={s.nextList}>
                {[
                  '🏠 Add more properties and units',
                  '👥 Add tenants and create tenancies',
                  '🧾 Generate your first invoice',
                  '💰 Enable M-Pesa payments',
                ].map(item => <div key={item} style={s.nextItem}>{item}</div>)}
              </div>
              <button style={s.btn} onClick={finish}>Go to Dashboard →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, type = 'text' }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <input style={s.input} type={type} placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  );
}

function Btn({ label, onClick, disabled }) {
  return (
    <button style={{ ...s.btn, opacity: disabled ? 0.7 : 1 }} onClick={onClick} disabled={disabled} type="button">
      {label}
    </button>
  );
}

const s = {
  page:        { minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' },
  card:        { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 560 },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  logo:        { fontSize: 16, fontWeight: 700, color: '#e8eaf0' },
  stepLabel:   { fontSize: 12, color: '#6b7280' },
  track:       { height: 4, background: '#2a2d3a', borderRadius: 2, marginBottom: '1.5rem', overflow: 'hidden' },
  fill:        { height: '100%', background: 'linear-gradient(90deg,#6c63ff,#00d4aa)', borderRadius: 2, transition: 'width .5s ease' },
  steps:       { display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' },
  stepDot:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 },
  dot:         { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 },
  dotDone:     { background: '#00d4aa', color: '#fff' },
  dotActive:   { background: '#6c63ff', color: '#fff' },
  dotIdle:     { background: '#2a2d3a', color: '#6b7280' },
  dotLabel:    { fontSize: 10, textAlign: 'center', maxWidth: 60 },
  content:     { textAlign: 'center' },
  stepIcon:    { fontSize: 48, marginBottom: '0.75rem' },
  title:       { fontSize: 20, fontWeight: 700, color: '#e8eaf0', marginBottom: 6 },
  sub:         { fontSize: 13, color: '#7c8498', marginBottom: '1.5rem' },
  form:        { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  row:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' },
  field:       { display: 'flex', flexDirection: 'column', gap: 4 },
  label:       { fontSize: 12, fontWeight: 500, color: '#9ca3af' },
  input:       { background: '#20232f', border: '1px solid #2a2d3a', borderRadius: 8, padding: '10px 12px', color: '#e8eaf0', fontSize: 14, outline: 'none', width: '100%' },
  btn:         { width: '100%', background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem' },
  successBadge:{ display: 'inline-block', background: '#0f2b1f', color: '#34d399', padding: '8px 20px', borderRadius: 20, fontSize: 14, fontWeight: 600, marginBottom: '1rem' },
  nextList:    { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.5rem', textAlign: 'left' },
  nextItem:    { background: '#20232f', border: '1px solid #2a2d3a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#9ca3af' },
};
