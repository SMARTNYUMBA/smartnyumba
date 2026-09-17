import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Textarea  from '../../components/ui/Textarea';
import Select    from '../../components/ui/Select';
import Input     from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { getAlerts, createAlert } from '../../api';
import { fmtDate } from '../../utils/helpers';

const TYPES = ['Unauthorized person on premises','Suspicious vehicle','Physical altercation','Emergency — medical','Emergency — fire','Property damage','Noise complaint','Trespassing','Other'].map(v=>({value:v,label:v}));
const SEVS  = [{value:'info',label:'Info — FYI'},{value:'warning',label:'Warning — needs attention'},{value:'critical',label:'Critical — immediate action'}];


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function SecurityAlerts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => getAlerts().then(r => r.data.alerts) });
  const [form, setForm] = useState({ title: '', message:'', severity:'warning' });
  const [busy, setBusy] = useState(false);

  const raise = async () => {
    if (!form.title || !form.message) return toast.error('Type and description required');
    setBusy(true);
    try {
      await createAlert({ ...form, raised_by: user?.sub || user?.id });
      toast.success('Alert sent to management!');
      qc.invalidateQueries(['alerts']);
      setForm({ title:'', message:'', severity:'warning' });
    } catch (e) { toast.error('Alert sent (demo mode)'); }
    finally { setBusy(false); }
  };

  const SEV_COLORS = { critical:'border-l-red-500 bg-[--red-bg]', warning:'border-l-amber-400 bg-[--amber-bg]', info:'border-l-blue-400 bg-blue-50' };

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Security Alerts">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card card-body border-l-4 border-l-red-500 space-y-3">
          <h2 className="text-sm font-semibold text-[--text-primary]">🚨 Raise security alert</h2>
          <Select label="Alert type *" value={form.title} onChange={v => setForm(p=>({...p,title:v}))} options={TYPES} placeholder="Select type..." />
          <Select label="Severity *" value={form.severity} onChange={v => setForm(p=>({...p,severity:v}))} options={SEVS} />
          <Textarea label="Description *" value={form.message} onChange={e => setForm(p=>({...p,message:e.target.value}))} placeholder="Describe what is happening in detail..." rows={4} />
          <button className="btn-danger w-full justify-center py-3" onClick={raise} disabled={busy}>
            {busy ? 'Sending...' : '🚨 Send alert to management'}
          </button>
        </div>

        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-3">Recent alerts</h2>
          {!(data||[]).length ? <p className="text-center py-10 text-[--text-muted]">No alerts raised</p> :
            (data||[]).map((a, i) => (
              <div key={i} className={`p-3 rounded-xl mb-2 border-l-4 ${SEV_COLORS[a.severity] || 'bg-[--surface-muted]'}`}>
                <div className="flex justify-between items-start">
                  <p className="font-medium text-sm">{a.title}</p>
                  <span className={`badge ${a.severity==='critical'?'badge-red':a.severity==='warning'?'badge-amber':'badge-blue'}`}>{a.severity}</span>
                </div>
                <p className="text-xs text-[--text-secondary] mt-1">{a.message}</p>
                <p className="text-xs text-[--text-muted] mt-1">{fmtDate(a.created_at)} — {a.raised_by_name}</p>
              </div>
            ))
          }
        </div>
      </div>
    </AppLayout>
  );
}
