import { useState, useRef } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Avatar    from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { updateProfile, changePassword, uploadPhoto, getMe } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

const TABS = ['Profile', 'Password', 'My tenancy'];

export default function TenantProfile() {
  const { user } = useAuth();
  const p        = user?.profile || {};
  const fileRef  = useRef();

  const [tab,  setTab]  = useState(0);
  const [form, setForm] = useState({
    full_name:         user?.full_name || '',
    email:             user?.email     || '',
    phone:             user?.phone     || '',
    emergency_contact: p.emergency_contact || '',
    emergency_phone:   p.emergency_phone   || '',
    vehicle_plate:     p.vehicle_plate     || '',
  });
  const [pw,   setPw]   = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [show, setShow] = useState({});
  const [busy, setBusy] = useState(false);

  const set   = k => e => setForm(f => ({ ...f, [k]: k === 'vehicle_plate' ? e.target.value.toUpperCase() : e.target.value }));
  const setPwK = k => e => setPw(f => ({ ...f, [k]: e.target.value }));

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateProfile(form);
      const { data } = await getMe();
      if (data?.user) { /* auth context will re-sync on next load */ }
      toast.success('Profile updated');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const savePassword = async () => {
    if (pw.new_password !== pw.confirm_password) return toast.error('Passwords do not match');
    if (pw.new_password.length < 8) return toast.error('Minimum 8 characters');
    setBusy(true);
    try {
      await changePassword({ current_password: pw.current_password, new_password: pw.new_password });
      toast.success('Password changed');
      setPw({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e) { toast.error(e.response?.data?.error || 'Incorrect password'); }
    finally { setBusy(false); }
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await uploadPhoto(fd);
      toast.success('Photo updated');
    } catch { toast.error('Upload failed'); }
  };

  return (
    <AppLayout title="My Profile">
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

        {/* Avatar */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={user?.full_name} size="xl" src={user?.profile_photo} />
            <button onClick={() => fileRef.current?.click()}
              style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: 'var(--brand)', border: '2px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg viewBox="0 0 20 20" fill="white" style={{ width: 12, height: 12 }}>
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
          </div>
          <div>
            <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>{user?.full_name}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.email}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Unit {p.unit_number || '—'} · {p.property_name || '—'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              style={{ flex: 1, padding: '0.4rem 0', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                background: tab === i ? 'var(--text-primary)' : 'transparent',
                color: tab === i ? 'white' : 'var(--text-muted)' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {tab === 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Full name',  key: 'full_name',  type: 'text' },
              { label: 'Email',      key: 'email',      type: 'email' },
              { label: 'Phone',      key: 'phone',      type: 'tel' },
              { label: 'Emergency contact name',  key: 'emergency_contact', type: 'text', placeholder: 'e.g. Jane Doe' },
              { label: 'Emergency contact phone', key: 'emergency_phone',   type: 'tel',  placeholder: 'e.g. 0722 000 000' },
              { label: 'Vehicle plate',           key: 'vehicle_plate',     type: 'text', placeholder: 'e.g. KCA 123A' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input className="input" type={type} value={form[key] || ''} onChange={set(key)} placeholder={placeholder} />
              </div>
            ))}
            <button className="btn-primary" disabled={busy} onClick={saveProfile} style={{ width: '100%' }}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}

        {/* Password tab */}
        {tab === 1 && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Current password', key: 'current_password' },
              { label: 'New password',     key: 'new_password' },
              { label: 'Confirm new password', key: 'confirm_password' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" style={{ paddingRight: '2.5rem' }}
                    type={show[key] ? 'text' : 'password'}
                    value={pw[key]} onChange={setPwK(key)} placeholder="••••••••" />
                  <button type="button" onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {show[key] ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            ))}
            <div style={{ background: 'var(--surface-muted)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: 12, color: 'var(--text-muted)' }}>
              Password must be at least 8 characters and include a number.
            </div>
            <button className="btn-primary" disabled={busy} onClick={savePassword} style={{ width: '100%' }}>
              {busy ? 'Changing…' : 'Change password'}
            </button>
          </div>
        )}

        {/* My tenancy tab */}
        {tab === 2 && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
            {[
              ['Unit number',    p.unit_number     || '—'],
              ['Property',       p.property_name   || '—'],
              ['Property type',  p.property_type   || '—'],
              ['Rent per month', p.rent_amount ? fmt(p.rent_amount) : '—'],
              ['Lease start',    p.start_date  ? fmtDate(p.start_date) : '—'],
              ['Lease end',      p.end_date    ? fmtDate(p.end_date)   : 'Ongoing'],
              ['Manager name',   p.manager_name  || '—'],
              ['Manager phone',  p.manager_phone || '—'],
              ['Manager email',  p.manager_email || '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
