import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import Badge       from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api, { getMaintenance, createMaintenance } from '../../api';
import { fmtDate, priorityColor } from '../../utils/helpers';

const CATS = ['plumbing','electrical','structural','appliance','pest','cleaning','security','other'].map(v=>({value:v,label:v}));
const PRIS = ['low','normal','urgent','emergency'].map(v=>({value:v,label:v}));

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(s => (
        <button key={s} type="button" onClick={()=>onChange(s)}
          className={`text-2xl transition-transform hover:scale-110 ${s<=value?'text-amber-400':'text-[--border]'}`}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function TenantMaintenance() {
  const { user, profile: p } = useAuth();
  // profile from useAuth
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey:['my-maintenance'],
    queryFn: () => getMaintenance({ tenancy_id: p.tenancy_id }).then(r=>r.data.requests),
    enabled: !!p.tenancy_id,
  });
  const [modal, setModal]   = useState(false);
  const [rateModal, setRateModal] = useState(null);
  const [form, setForm]     = useState({ title:'', description:'', category:'other', priority:'normal' });
  const [rating, setRating] = useState({ stars:5, comment:'' });
  const [busy, setBusy]     = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const submit = async () => {
    if (!form.title) return toast.error('Title required');
    if (!p.unit_id) return toast.error('No unit found. Contact your manager.');
    setBusy(true);
    try {
      await createMaintenance({ ...form, unit_id: p.unit_id, tenancy_id: p.tenancy_id });
      toast.success('Request submitted!');
      qc.invalidateQueries(['my-maintenance']);
      setModal(false);
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const submitRating = async () => {
    setBusy(true);
    try {
      await api.post('/ratings', { request_id: rateModal.id, rating: rating.stars, comment: rating.comment });
      toast.success('Thank you for your feedback! ⭐');
      qc.invalidateQueries(['my-maintenance']);
      setRateModal(null);
    } catch (e) { toast.error(e.response?.data?.error||'Already rated'); }
    finally { setBusy(false); }
  };

  const completed = (data||[]).filter(r=>r.status==='completed');
  const open      = (data||[]).filter(r=>r.status!=='completed'&&r.status!=='cancelled');

  return (
    <AppLayout title="Maintenance Requests" actions={<button className="btn-primary btn-sm" onClick={()=>setModal(true)}>+ New request</button>}>
      {open.length > 0 && (
        <div className="space-y-3 mb-5">
          <h2 className="text-sm font-semibold text-[--text-secondary] uppercase tracking-wide">Active requests</h2>
          {open.map((req,i) => (
            <div key={i} className="card card-body">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${req.priority==='emergency'?'bg-[--red-bg]':req.priority==='urgent'?'bg-orange-50':'bg-[--amber-bg]'}`}>🔧</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{req.title}</p>
                    <span className={priorityColor(req.priority)}>{req.priority}</span>
                    <Badge status={req.status} />
                  </div>
                  {req.description && <p className="text-sm text-[--text-muted] mt-1">{req.description}</p>}
                  <p className="text-xs text-[--text-muted] mt-1">Submitted {fmtDate(req.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <h2 className="text-sm font-semibold text-[--text-secondary] uppercase tracking-wide">Completed — rate our service</h2>
          {completed.map((req,i) => (
            <div key={i} className="card card-body border-l-4 border-l-green-400">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[--green-bg] rounded-xl flex items-center justify-center text-xl flex-shrink-0">✅</div>
                <div className="flex-1">
                  <p className="font-semibold">{req.title}</p>
                  <p className="text-xs text-[--text-muted]">Resolved {fmtDate(req.resolved_at)}</p>
                </div>
                <button className="btn-secondary btn-sm" onClick={()=>{setRateModal(req);setRating({stars:5,comment:''});}}>
                  ⭐ Rate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !(data||[]).length && (
        <div className="card card-body text-center py-16">
          <div className="text-4xl mb-3">🔧</div>
          <p className="font-medium text-[--text-secondary]">No maintenance requests</p>
        </div>
      )}

      {/* Submit request modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title="Submit maintenance request">
        <div className="p-5 space-y-1">
          <Input label="Issue title *" value={form.title} onChange={set('title')} placeholder="e.g. Leaking tap in kitchen" />
          <Textarea label="Description" value={form.description} onChange={set('description')} rows={4} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} options={CATS} />
            <Select label="Priority" value={form.priority} onChange={v=>setForm(f=>({...f,priority:v}))} options={PRIS} />
          </div>
          {form.priority==='emergency'&&<div className="alert-danger text-xs">Emergency — our team will respond immediately</div>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>{busy?'Submitting...':'Submit'}</button>
        </div>
      </Modal>

      {/* Rating modal */}
      <Modal open={!!rateModal} onClose={()=>setRateModal(null)} title="Rate our service" size="sm">
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-[--text-secondary]">How satisfied are you with the resolution of <strong>"{rateModal?.title}"</strong>?</p>
          <div className="flex flex-col items-center gap-2 py-2">
            <StarRating value={rating.stars} onChange={v=>setRating(r=>({...r,stars:v}))} />
            <p className="text-sm text-[--text-muted]">{['','Poor','Fair','Good','Very good','Excellent!'][rating.stars]}</p>
          </div>
          <div>
            <label className="label">Additional comments (optional)</label>
            <textarea className="input resize-none" rows={3} value={rating.comment} onChange={e=>setRating(r=>({...r,comment:e.target.value}))} placeholder="Tell us how we did..." />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setRateModal(null)}>Skip</button>
          <button className="btn-primary" onClick={submitRating} disabled={busy}>{busy?'Submitting...':'Submit rating'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
