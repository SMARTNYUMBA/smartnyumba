import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Badge from '../../components/ui/Badge';

const PLAN_COLORS = { starter: 'gray', professional: 'blue', enterprise: 'purple', trial: 'purple' };

export default function OrgSettings() {
  const qc      = useQueryClient();
  const fileRef = useRef();
  const [form, setForm] = useState({ name:'', timezone:'Africa/Nairobi', currency:'KES', billing_email:'', primary_colour:'#D97706' });
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile,    setLogoFile]    = useState(null);
  const [uploading,   setUploading]   = useState(false);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const { data } = useQuery({
    queryKey: ['my-org'],
    queryFn: () => api.get('/organisations/me').then(r => r.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data?.org) {
      setForm(f => ({ ...f, ...data.org }));
      if (data.org.logo_url) setLogoPreview(data.org.logo_url);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: body => api.patch('/organisations/me', body),
    onSuccess: () => { toast.success('Organisation updated'); qc.invalidateQueries(['my-org']); },
    onError: e => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const pickLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', logoFile);
      const { data: resp } = await api.post('/organisations/me/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLogoPreview(resp.logo_url);
      setLogoFile(null);
      qc.invalidateQueries(['my-org']);
      toast.success('Logo updated');
    } catch(e) { toast.error(e.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const { org, usage, limits } = data || {};

  return (
    <AppLayout title="Organisation Settings">
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

        {/* Plan / usage */}
        {usage && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { label: 'Plan', val: <Badge status={org?.plan} label={org?.plan?.toUpperCase()} /> },
              { label: 'Units used', val: `${usage.units} / ${limits?.max_units < 99999 ? limits.max_units : '∞'}` },
              { label: 'Users', val: `${usage.users} / ${limits?.max_users < 9999 ? limits.max_users : '∞'}` },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</p>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Logo */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, marginBottom: '1rem' }}>Organisation logo</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 80, height: 80, borderRadius: 14, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--surface-muted)', flexShrink: 0 }}>
              {logoPreview
                ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 28 }}>🏢</span>
              }
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                PNG or JPG, max 2MB. Appears on invoices, receipts, and email headers.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  Choose file
                </button>
                {logoFile && (
                  <button className="btn-brand btn-sm" onClick={uploadLogo} disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Upload logo'}
                  </button>
                )}
                {logoPreview && !logoFile && (
                  <button className="btn-ghost btn-sm"
                    onClick={() => { setLogoPreview(null); setLogoFile(null); save.mutate({ logo_url: null }); }}>
                    Remove
                  </button>
                )}
              </div>
              {logoFile && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Selected: {logoFile.name}</p>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={pickLogo} />
        </div>

        {/* General settings */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>General</h2>
          <div>
            <label className="label">Organisation name</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Acme Properties Ltd" />
          </div>
          <div>
            <label className="label">Billing email</label>
            <input className="input" type="email" value={form.billing_email || ''} onChange={set('billing_email')} placeholder="billing@yourcompany.com" />
            <p className="hint">Receives monthly KPI digest and plan expiry reminders.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Timezone</label>
              <select className="input" value={form.timezone} onChange={set('timezone')}>
                <option value="Africa/Nairobi">Africa/Nairobi (EAT +3)</option>
                <option value="Africa/Lagos">Africa/Lagos (WAT +1)</option>
                <option value="Africa/Johannesburg">Africa/Johannesburg (SAST +2)</option>
                <option value="Africa/Dar_es_Salaam">Africa/Dar es Salaam (EAT +3)</option>
                <option value="UTC">UTC +0</option>
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={set('currency')}>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="UGX">UGX — Ugandan Shilling</option>
                <option value="TZS">TZS — Tanzanian Shilling</option>
                <option value="USD">USD — US Dollar</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Brand colour</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.primary_colour || '#D97706'} onChange={set('primary_colour')}
                style={{ width: 40, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
              <input className="input" style={{ flex: 1 }} value={form.primary_colour || '#D97706'} onChange={set('primary_colour')} placeholder="#D97706" />
            </div>
            <p className="hint">Used on invoice headers and tenant portal accent colour.</p>
          </div>
          <button className="btn-primary" style={{ width: '100%' }}
            disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>

      </div>
    </AppLayout>
  );
}
