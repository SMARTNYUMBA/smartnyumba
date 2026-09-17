import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Input     from '../../components/ui/Input';
import Avatar    from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { updateProfile, changePassword, uploadPhoto, getMe, tokenStore } from '../../api';
import { fmt, fmtDate, roleName } from '../../utils/helpers';

export default function ProfilePage() {
  const { user, signIn, refreshUser } = useAuth() || {};
  const p   = user?.profile || {};
  const fileRef = useRef();

  const resolveField = (k) => user?.[k] || p?.[k] || '';

  const [tab,  setTab]  = useState('profile');
  const [form, setForm] = useState({
    full_name:         user?.full_name         || '',
    email:             user?.email             || '',
    phone:             user?.phone             || '',
    id_type:           resolveField('id_type') || 'national_id',
    id_number:         resolveField('id_number'),
    passport_number:   resolveField('passport_number'),
    emergency_contact: resolveField('emergency_contact'),
    emergency_phone:   resolveField('emergency_phone'),
    vehicle_plate:     user?.vehicle_plate || p?.vehicle_plate || '',
  });
  const [pwForm, setPwForm] = useState({ current_password:'', new_password:'', confirm_password:'' });
  const [showPw, setShowPw] = useState({});
  const [busy, setBusy] = useState(false);
  const set   = k => e => setForm(f => ({ ...f, [k]: k === 'vehicle_plate' ? e.target.value.toUpperCase() : e.target.value }));
  const setPw = k => e => setPwForm(f => ({ ...f, [k]: e.target.value }));

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateProfile(form);
      toast.success('Profile updated!');
      const { data: meData } = await getMe();
      if (meData?.user) {
        const updated = meData.user;
        tokenStore.setUser(updated);
      }
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save'); }
    finally { setBusy(false); }
  };

  const savePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm_password) return toast.error('Passwords do not match');
    if (pwForm.new_password.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      await changePassword({ current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success('Password changed!');
      setPwForm({ current_password:'', new_password:'', confirm_password:'' });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const handlePhoto = async e => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('photo', file);
    try {
      const { data } = await uploadPhoto(fd);
      toast.success('Photo updated! ✅');
      // Update in-memory + storage then refresh from server
      const updated = { ...user, profile_photo: data.photo_url };
      tokenStore.setUser(updated);
      // refreshUser fetches fresh /auth/me and pushes to all components
      if (refreshUser) await refreshUser();
    } catch { toast.error('Failed to upload photo'); }
  };

  return (
    <AppLayout title="My Profile">
      <div className="max-w-2xl space-y-5">

        {/* Header card */}
        <div className="card card-body">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar name={user?.full_name} size="lg" src={user?.profile_photo || null} />
              <button onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-brand-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-brand-700 transition shadow">
                📷
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-[--text-primary]">{user?.full_name}</h2>
              <p className="text-sm text-[--brand] font-medium">{roleName(user?.role)}</p>
              <p className="text-xs text-[--text-muted] mt-0.5">{user?.email}</p>
            </div>
          </div>

          {/* Info grid */}
          <div className="mt-4 pt-4 border-t border-[--border] grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-[--text-muted] uppercase tracking-wide">Member since</p>
              <p className="font-semibold mt-0.5">{fmtDate(user?.created_at)}</p>
            </div>
            {/* Tenant info */}
            {p.unit_number && (
              <div>
                <p className="text-xs text-[--text-muted] uppercase tracking-wide">Unit</p>
                <p className="font-semibold mt-0.5">{p.unit_number}</p>
              </div>
            )}
            {p.property_name && (
              <div>
                <p className="text-xs text-[--text-muted] uppercase tracking-wide">Property</p>
                <p className="font-semibold mt-0.5">{p.property_name}</p>
              </div>
            )}
            {p.rent_amount && (
              <div>
                <p className="text-xs text-[--text-muted] uppercase tracking-wide">Monthly rent</p>
                <p className="font-semibold mt-0.5 text-[--green]">{fmt(p.rent_amount)}/mo</p>
              </div>
            )}
            {/* Staff assigned property */}
            {user?.property_id && !p.unit_number && (
              <div>
                <p className="text-xs text-[--text-muted] uppercase tracking-wide">Assigned property</p>
                <p className="font-semibold mt-0.5">{user?.property_name || `Property #${user.property_id}`}</p>
              </div>
            )}
            {user?.last_login && (
              <div>
                <p className="text-xs text-[--text-muted] uppercase tracking-wide">Last login</p>
                <p className="font-semibold mt-0.5">{fmtDate(user.last_login)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[--surface-muted] p-1 rounded-xl">
          {[{id:'profile',label:'Personal details'},{id:'password',label:'Change password'}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${tab===t.id?'bg-[--surface] shadow text-[--text-primary]':'text-[--text-muted] hover:text-[--text-primary]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="card card-body space-y-4">

            {/* Basic info */}
            <div>
              <h3 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide mb-3">Basic information</h3>
              <Input label="Full name *" value={form.full_name} onChange={set('full_name')} />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Input label="Email" type="email" value={form.email} onChange={set('email')} />
                <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX" />
              </div>
            </div>

            {/* Identity */}
            <div className="pt-3 border-t border-[--border]">
              <h3 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide mb-3">Identity document</h3>
              <div className="flex gap-3 mb-3">
                {[{v:'national_id',l:'🪪 National ID'},{v:'passport',l:'📕 Passport'}].map(({v,l}) => (
                  <label key={v} className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition ${form.id_type===v?'border-brand-500 bg-[--brand-light]':'border-[--border]'}`}>
                    <input type="radio" name="id_type" value={v} checked={form.id_type===v} onChange={set('id_type')} className="accent-brand-600" />
                    <span className="text-sm font-medium">{l}</span>
                  </label>
                ))}
              </div>
              {form.id_type === 'national_id'
                ? <Input label="National ID number" value={form.id_number} onChange={set('id_number')} placeholder="e.g. 12345678" />
                : <Input label="Passport number"    value={form.passport_number} onChange={set('passport_number')} placeholder="e.g. A1234567" />
              }
            </div>

            {/* Emergency contact — visible to ALL roles */}
            <div className="pt-3 border-t border-[--border]">
              <h3 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide mb-1">Emergency contact</h3>
              <p className="text-xs text-[--text-muted] mb-3">This information may be accessed by property management staff in case of emergency.</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Contact name"  value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Next of kin full name" />
                <Input label="Contact phone" type="tel" value={form.emergency_phone} onChange={set('emergency_phone')} placeholder="07XX XXX XXX" />
              </div>
            </div>

            {/* Vehicle */}
            <div className="pt-3 border-t border-[--border]">
              <h3 className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide mb-3">Vehicle (optional)</h3>
              <div className="relative">
                <Input label="Vehicle plate" value={form.vehicle_plate}
                  onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value.toUpperCase() }))}
                  placeholder="KXX 000A" />
                <p className="text-xs text-[--text-muted] mt-1">Always stored in uppercase automatically.</p>
              </div>
            </div>

            <button className="btn-primary w-full mt-2" onClick={saveProfile} disabled={busy}>
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}

        {tab === 'password' && (
          <div className="card card-body space-y-3">
            {[['current_password','Current password'],['new_password','New password'],['confirm_password','Confirm new password']].map(([k,label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <div className="relative">
                  <input className="input pr-10" type={showPw[k]?'text':'password'} value={pwForm[k]} onChange={setPw(k)} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPw(s=>({...s,[k]:!s[k]}))} className="absolute right-3 top-2.5 text-[--text-muted] text-sm">
                    {showPw[k] ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            ))}
            {/* Password strength indicator */}
            {pwForm.new_password && (() => {
              const p = pwForm.new_password;
              const strength = [p.length>=8, /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
              const labels = ['','Weak','Fair','Good','Strong'];
              const colors = ['','bg-red-400','bg-amber-400','bg-blue-500','bg-green-500'];
              const textColors = ['','text-[--red]','text-[--amber]','text-[--blue]','text-[--green]'];
              return (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i<=strength ? colors[strength] : 'bg-[--canvas-200]'}`} />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${textColors[strength]}`}>{labels[strength]} password</p>
                </div>
              );
            })()}
            <div className="alert-info text-xs">
              Use 8+ characters with uppercase, number, and symbol for a strong password.
            </div>
            <button className="btn-primary w-full" onClick={savePassword} disabled={busy}>
              {busy ? 'Changing...' : 'Change password'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
