import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal     from '../../components/ui/Modal';
import Input     from '../../components/ui/Input';
import Textarea  from '../../components/ui/Textarea';
import Select    from '../../components/ui/Select';
import Badge     from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDate } from '../../utils/helpers';

const CATS = ['maintenance','billing','noise','security','neighbour','facility','other'].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}));
const PRIS = ['low','normal','urgent'].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}));

const STATUS_COLORS = { open:'badge-blue', in_progress:'badge-amber', resolved:'badge-green', closed:'badge-gray' };

export default function TenantCases() {
  const { profile: p } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ title:'', description:'', category:'other', priority:'normal' });
  const [busy, setBusy]   = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const { data, isLoading } = useQuery({
    queryKey: ['my-cases'],
    queryFn: () => api.get('/cases').then(r => r.data.cases),
  });

  const submit = async () => {
    if (!form.title) return toast.error('Title required');
    if (!p?.tenancy_id) return toast.error('No active tenancy found. Contact your property manager.');
    setBusy(true);
    try {
      await api.post('/cases', { ...form, tenancy_id: p.tenancy_id });
      toast.success('Case submitted! Our team will respond shortly.');
      qc.invalidateQueries(['my-cases']);
      setModal(false);
      setForm({ title:'', description:'', category:'other', priority:'normal' });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit'); }
    finally { setBusy(false); }
  };

  const open       = (data||[]).filter(c => !['resolved','closed'].includes(c.status));
  const resolved   = (data||[]).filter(c =>  ['resolved','closed'].includes(c.status));

  return (
    <AppLayout title="My Cases" actions={
      <button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Raise a case</button>
    }>
      {!p?.tenancy_id && (
        <div className="alert-warning mb-4 text-sm">
          ⚠️ No active tenancy found. You cannot raise cases until your tenancy is set up. Contact your property manager.
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-3 mb-6">
          <h2 className="text-sm font-semibold text-[--text-secondary] uppercase tracking-wide">Open Cases</h2>
          {open.map((c, i) => (
            <div key={i} className="card card-body border-l-4 border-l-brand-400">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold">{c.title}</p>
                    <span className={`badge ${STATUS_COLORS[c.status]||'badge-gray'}`}>{c.status?.replace('_',' ')}</span>
                    <span className="badge badge-gray">{c.priority}</span>
                  </div>
                  {c.description && <p className="text-sm text-[--text-muted] mt-1">{c.description}</p>}
                  <p className="text-xs text-[--text-muted] mt-2">Submitted {fmtDate(c.created_at)}</p>
                </div>
                <span className="text-xs bg-[--surface-muted] px-2 py-1 rounded-full capitalize flex-shrink-0">{c.category}</span>
              </div>
              {c.resolution_notes && (
                <div className="mt-3 pt-3 border-t border-[--border]">
                  <p className="text-xs font-medium text-[--text-muted]">Resolution notes:</p>
                  <p className="text-sm text-[--text-secondary] mt-1">{c.resolution_notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <h2 className="text-sm font-semibold text-[--text-secondary] uppercase tracking-wide">Resolved Cases</h2>
          {resolved.map((c, i) => (
            <div key={i} className="card card-body opacity-70 border-l-4 border-l-green-400">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-[--text-muted] mt-0.5">{fmtDate(c.created_at)} · <span className="capitalize">{c.category}</span></p>
                </div>
                <span className="badge badge-green">Resolved</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !(data||[]).length && (
        <div className="card card-body text-center py-16">
          <div className="text-4xl mb-3">🎫</div>
          <p className="font-medium text-[--text-secondary]">No cases raised yet</p>
          <p className="text-sm text-[--text-muted] mt-1">Use cases to report issues, disputes or requests to management</p>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Raise a case">
        <div className="p-5 flex flex-col gap-3">
          <div className="alert-info text-xs">Your case will be sent to your property management team and tracked until resolved.</div>
          <Input label="Subject *" value={form.title} onChange={set('title')} placeholder="Briefly describe the issue" />
          <Textarea label="Details" value={form.description} onChange={set('description')} rows={4} placeholder="Provide as much detail as possible..." />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.category} onChange={v => setForm(f=>({...f,category:v}))} options={CATS} />
            <Select label="Priority"  value={form.priority} onChange={v => setForm(f=>({...f,priority:v}))}  options={PRIS} />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy || !p?.tenancy_id}>
            {busy ? 'Submitting...' : 'Submit case'}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
