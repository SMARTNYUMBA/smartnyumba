// frontend/src/pages/admin/Settings.jsx  — ENHANCED
// Additions:
//   • Late fee configuration (%, grace period, waive button)
//   • WhatsApp toggle + AT credentials
//   • 2FA toggle for current admin account
//   • Email SMTP configuration section

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Input     from '../../components/ui/Input';
import api, { getSettings, updateSettings } from '../../api';

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey:['settings'], queryFn: () => getSettings().then(r=>r.data.settings) });
  const [form, setForm]     = useState({});
  const [busy, setBusy]     = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaOtp, setMfaOtp]   = useState('');
  const [showMfaOtp, setShowMfaOtp] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const set    = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const toggle = async (k) => {
    const newVal = form[k] === '1' ? '0' : '1';
    setForm(p => ({ ...p, [k]: newVal }));
    try {
      await updateSettings({ [k]: newVal });
      toast.success('Setting saved');
    } catch { toast.error('Failed to save setting'); }
  };

  const save = async () => {
    setBusy(true);
    try { await updateSettings(form); toast.success('Settings saved!'); qc.invalidateQueries(['settings']); }
    catch { toast.error('Failed to save'); }
    finally { setBusy(false); }
  };

  const enableMfa = async () => {
    setMfaBusy(true);
    try {
      await api.post('/auth/mfa/enable');
      toast.success('OTP sent to your phone — enter it below to activate 2FA');
      setShowMfaOtp(true);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setMfaBusy(false); }
  };

  const confirmMfa = async () => {
    if (!mfaOtp) return toast.error('Enter the OTP from your phone');
    setMfaBusy(true);
    try {
      await api.post('/auth/mfa/confirm-enable', { otp: mfaOtp });
      toast.success('2FA enabled successfully!');
      setShowMfaOtp(false); setMfaOtp('');
    } catch (e) { toast.error(e.response?.data?.error || 'Invalid OTP'); }
    finally { setMfaBusy(false); }
  };

  const disableMfa = async () => {
    const pw = prompt('Enter your password to disable 2FA:');
    if (!pw) return;
    try {
      await api.post('/auth/mfa/disable', { password: pw });
      toast.success('2FA disabled');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const Toggle = ({ k, label, desc }) => (
    <div className="flex items-center justify-between py-3 border-b border-[--border]">
      <div>
        <p className="text-sm font-medium text-[--text-primary]">{label}</p>
        {desc && <p className="text-xs text-[--text-muted] mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => toggle(k)} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form[k]==='1'?'bg-brand-600':'bg-[--canvas-200]'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[--surface] rounded-full shadow transition-transform ${form[k]==='1'?'translate-x-5':''}`} />
      </button>
    </div>
  );

  // FIX: moved cronLogs query ABOVE early return — hooks must always be called unconditionally
  const { data: cronLogs } = useQuery({
    queryKey: ['cron-logs'],
    queryFn:  () => api.get('/cron-logs', { params: { limit: 20 } }).then(r => r.data.logs || []),
    refetchInterval: 60000,
  });

  if (isLoading) return <AppLayout title="System Settings"><p className="p-6 text-[--text-muted]">Loading settings...</p></AppLayout>;

  return (
    <AppLayout title="System Settings" actions={
      <button className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy?'Saving...':'Save all settings'}</button>
    }>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* General */}
        <div className="card card-body space-y-4">
          <h2 className="text-sm font-semibold text-[--text-primary]">General</h2>
          <div><label className="label">System name</label><input className="input" value={form.system_name||''} onChange={set('system_name')} /></div>
          <div><label className="label">Currency</label><input className="input" value={form.currency||'KES'} onChange={set('currency')} /></div>
          <div><label className="label">Auto invoice day (1–28)</label>
            <input className="input" type="number" min="1" max="28" value={form.auto_invoice_day||'1'} onChange={set('auto_invoice_day')} />
            <p className="text-xs text-[--text-muted] mt-1">Invoices are auto-generated on this day each month</p>
          </div>
        </div>

        {/* Features */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-2">Features</h2>
          <Toggle k="mpesa_enabled"      label="M-Pesa payments"      desc="Enable M-Pesa STK push for online rent payment" />
          <Toggle k="sms_enabled"        label="SMS notifications"    desc="Africa's Talking SMS alerts" />
          <Toggle k="whatsapp_enabled"   label="WhatsApp notifications" desc="Send receipts and reminders via WhatsApp" />
          <Toggle k="late_fees_enabled"  label="Auto late fees"        desc="Automatically apply penalty invoices after grace period" />
          <Toggle k="mpesa_stk_enabled"  label="M-Pesa STK push"      desc="Live STK push (requires Daraja credentials below)" />
        </div>

        {/* Late fee configuration */}
        <div className="card card-body space-y-4">
          <h2 className="text-sm font-semibold text-[--text-primary]">Late fee configuration</h2>
          <div className={form.late_fees_enabled !== '1' ? 'opacity-50 pointer-events-none' : ''}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Grace period (days)</label>
                <input className="input" type="number" min="0" max="30" value={form.grace_period_days||'5'} onChange={set('grace_period_days')} />
                <p className="text-xs text-[--text-muted] mt-1">Days after due date before late fee applies</p>
              </div>
              <div>
                <label className="label">Late fee percentage (%)</label>
                <input className="input" type="number" min="0" max="50" step="0.5" value={form.late_fee_percent||'5'} onChange={set('late_fee_percent')} />
                <p className="text-xs text-[--text-muted] mt-1">% of outstanding balance per penalty cycle</p>
              </div>
            </div>
            <div className="mt-3 p-3 bg-[--amber-bg] rounded-xl text-xs text-amber-700">
              ⚠️ Late fees run daily via cron. A {form.late_fee_percent||5}% fee is added after {form.grace_period_days||5} days overdue. Fees can be waived per-invoice from the Invoices page.
            </div>
          </div>
        </div>

        {/* M-Pesa Daraja */}
        <div className="card card-body space-y-3">
          <h2 className="text-sm font-semibold text-[--text-primary]">M-Pesa (Daraja API)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Environment</label>
              <select className="input" value={form.mpesa_env||'sandbox'} onChange={set('mpesa_env')}>
                <option value="sandbox">Sandbox (testing)</option>
                <option value="production">Production (live)</option>
              </select>
            </div>
            <div><label className="label">Shortcode / Paybill</label>
              <input className="input" value={form.mpesa_shortcode||''} onChange={set('mpesa_shortcode')} placeholder="e.g. 174379" />
            </div>
            <div><label className="label">Consumer Key</label>
              <input className="input" type="password" value={form.mpesa_consumer_key||''} onChange={set('mpesa_consumer_key')} placeholder="From Daraja portal" />
            </div>
            <div><label className="label">Consumer Secret</label>
              <input className="input" type="password" value={form.mpesa_consumer_secret||''} onChange={set('mpesa_consumer_secret')} placeholder="From Daraja portal" />
            </div>
            <div className="col-span-2"><label className="label">Callback URL</label>
              <input className="input" value={form.mpesa_callback_url||''} onChange={set('mpesa_callback_url')} placeholder="https://yourdomain.com/api/mpesa/callback" />
            </div>
          </div>
        </div>

        {/* Email / SMTP */}
        <div className="card card-body space-y-3">
          <h2 className="text-sm font-semibold text-[--text-primary]">Email (SMTP)</h2>
          <Toggle k="email_enabled" label="Email notifications" desc="Send receipt emails and reminders" />
          <div className={form.email_enabled !== '1' ? 'opacity-50 pointer-events-none' : ''}>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div><label className="label">SMTP host</label><input className="input" value={form.smtp_host||''} onChange={set('smtp_host')} placeholder="smtp.gmail.com" /></div>
              <div><label className="label">SMTP port</label><input className="input" value={form.smtp_port||'587'} onChange={set('smtp_port')} /></div>
              <div><label className="label">Email address</label><input className="input" value={form.smtp_user||''} onChange={set('smtp_user')} placeholder="your@email.com" /></div>
              <div><label className="label">App password</label><input className="input" type="password" value={form.smtp_pass||''} onChange={set('smtp_pass')} /></div>
              <div className="col-span-2"><label className="label">From name</label><input className="input" value={form.smtp_from_name||'SmartNyumba'} onChange={set('smtp_from_name')} /></div>
            </div>
            <button className="btn-secondary btn-sm mt-2" onClick={async () => {
              try {
                await api.post('/settings/test-email');
                toast.success('Test email sent! Check your inbox.');
              } catch(e) { toast.error(e.response?.data?.error || 'Failed to send test email'); }
            }}>📧 Send test email</button>
          </div>
        </div>

        {/* Africa's Talking */}
        <div className="card card-body space-y-3">
          <h2 className="text-sm font-semibold text-[--text-primary]">Africa's Talking (SMS + WhatsApp)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Username</label><input className="input" value={form.at_username||''} onChange={set('at_username')} placeholder="sandbox or your username" /></div>
            <div><label className="label">API key</label><input className="input" type="password" value={form.at_api_key||''} onChange={set('at_api_key')} placeholder="From AT dashboard" /></div>
            <div><label className="label">SMS sender ID</label><input className="input" value={form.at_sender_id||'SmartNyumba'} onChange={set('at_sender_id')} /></div>
          </div>
        </div>

        {/* Security — 2FA */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-3">Two-factor authentication (2FA)</h2>
          <p className="text-xs text-[--text-muted] mb-4">When enabled, you'll be sent an OTP via SMS on every login. Requires a phone number on your account.</p>
          {!showMfaOtp ? (
            <div className="flex gap-3">
              <button className="btn-primary btn-sm" onClick={enableMfa} disabled={mfaBusy}>
                {mfaBusy ? 'Sending OTP...' : 'Enable 2FA'}
              </button>
              <button className="btn-secondary btn-sm" onClick={disableMfa}>
                Disable 2FA
              </button>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <p className="text-xs text-[--green] font-medium">✓ OTP sent to your phone. Enter it below to activate.</p>
              <div className="flex gap-2">
                <input className="input w-40 font-mono text-center tracking-widest text-lg" placeholder="000000"
                  value={mfaOtp} onChange={e => setMfaOtp(e.target.value)} maxLength={6} />
                <button className="btn-primary btn-sm" onClick={confirmMfa} disabled={mfaBusy}>
                  {mfaBusy ? 'Verifying...' : 'Activate 2FA'}
                </button>
                <button className="btn-secondary btn-sm" onClick={() => { setShowMfaOtp(false); setMfaOtp(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
      {/* ── Cron / background jobs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card card-body">
          <h3 className="font-semibold text-[--text-primary] mb-4">⚙️ Background job log</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(cronLogs||[]).length === 0 ? (
              <p className="text-xs text-[--text-muted] text-center py-4">No cron logs yet</p>
            ) : (cronLogs||[]).map((log, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-[--surface-muted]">
                <div className="flex items-center gap-2">
                  <span className={log.status === 'success' ? 'text-[--green]' : log.status === 'failed' ? 'text-[--red]' : 'text-[--amber]'}>
                    {log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '⏳'}
                  </span>
                  <span className="font-mono font-medium text-[--text-primary]">{log.job_name}</span>
                  {log.rows_affected > 0 && <span className="text-[--text-muted]">({log.rows_affected} rows)</span>}
                </div>
                <span className="text-[--text-muted]">
                  {log.started_at ? new Date(log.started_at).toLocaleString('en-KE', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </AppLayout>
  );
}
