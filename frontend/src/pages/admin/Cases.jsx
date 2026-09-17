import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import Badge       from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api, { getProperties } from '../../api';
import { fmtDate, fmtDateTime, priorityColor } from '../../utils/helpers';

const CATS  = ['noise','damage','billing','maintenance','security','neighbour','management','parking','other'].map(v=>({value:v,label:v.replace('_',' ')}));
const PRIS  = ['low','normal','urgent','emergency'].map(v=>({value:v,label:v}));
const STATS = ['open','in_progress','resolved','closed'].map(v=>({value:v,label:v.replace('_',' ')}));

export default function Cases() {
  const { user } = useAuth() || {};
  const qc = useQueryClient();
  const [propFilter, setPropFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal]   = useState(null);
  const { data: propsData } = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: rawCases, isLoading } = useQuery({ queryKey:['cases'], queryFn: () => api.get('/cases').then(r=>r.data.cases) });
  const data = (rawCases||[]).filter(c =>
    (!propFilter || String(c.property_id) === propFilter) &&
    (!statusFilter || c.status === statusFilter)
  );
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [form, setForm]     = useState({ title:'', description:'', category:'other', priority:'normal' });
  const [comment, setComment] = useState('');
  const [busy, setBusy]     = useState(false);

  const openCase = async (c) => {
    setSelected(c);
    const { data: r } = await api.get(`/cases/${c.id}/comments`);
    setComments(r.comments);
    setModal('view');
  };

  const create = async () => {
    if (!form.title) return toast.error('Title required');
    setBusy(true);
    try {
      await api.post('/cases', form);
      toast.success('Case submitted!');
      qc.invalidateQueries(['cases']);
      setModal(null);
      setForm({ title:'', description:'', category:'other', priority:'normal' });
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const updateCase = async (id, updates) => {
    try { await api.put(`/cases/${id}`, updates); qc.invalidateQueries(['cases']); }
    catch { toast.error('Failed to update'); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/cases/${selected.id}/comments`, { comment });
      setComment('');
      const { data: r } = await api.get(`/cases/${selected.id}/comments`);
      setComments(r.comments);
      toast.success('Comment added');
    } catch(e) { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  const summary = { open:0, in_progress:0, urgent:0, resolved:0 };
  (data||[]).forEach(c => {
    if (summary[c.status]!==undefined) summary[c.status]++;
    if (c.priority==='urgent'||c.priority==='emergency') summary.urgent++;
  });

  const cols = [
    { label:'Case',     render: r => <div><p className="font-medium">{r.title}</p><p className="text-xs text-[--text-muted] capitalize">{r.category}</p></div> },
    { label:'Property', render: r => r.property_name },
    { label:'Raised by',render: r => r.raised_by_name },
    { label:'Priority', render: r => <span className={priorityColor(r.priority)}>{r.priority}</span> },
    { label:'Status',   render: r => <span className={`badge ${r.status==='resolved'?'badge-green':r.status==='open'?'badge-red':'badge-amber'}`}>{r.status.replace('_',' ')}</span> },
    { label:'Date',     render: r => fmtDate(r.created_at) },
    { label:'',         render: r => <button className="btn-ghost btn-sm text-[--brand]" onClick={e=>{e.stopPropagation();openCase(r);}}>View</button> },
  ];

  return (
    <AppLayout title="Cases & Tickets" actions={
      <button className="btn-primary btn-sm" onClick={()=>setModal('add')}>+ Raise case</button>
    }>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="card card-body text-center"><p className="text-2xl font-bold text-[--red]">{summary.open}</p><p className="text-xs text-[--text-muted] mt-1">Open</p></div>
        <div className="card card-body text-center"><p className="text-2xl font-bold text-[--amber]">{summary.in_progress}</p><p className="text-xs text-[--text-muted] mt-1">In progress</p></div>
        <div className="card card-body text-center"><p className="text-2xl font-bold text-orange-600">{summary.urgent}</p><p className="text-xs text-[--text-muted] mt-1">Urgent/Emergency</p></div>
        <div className="card card-body text-center"><p className="text-2xl font-bold text-[--green]">{summary.resolved}</p><p className="text-xs text-[--text-muted] mt-1">Resolved</p></div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="input w-48 text-sm" value={propFilter} onChange={e=>setPropFilter(e.target.value)}>
          <option value="">All properties</option>
          {(propsData||[]).map(p=><option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>
        <select className="input w-36 text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={data} loading={isLoading} emptyMsg="No cases raised" />
      </div>

      {/* Add case */}
      <Modal open={modal==='add'} onClose={()=>setModal(null)} title="Raise a case">
        <div className="p-5 flex flex-col gap-3">
          <Input label="Title *" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Brief description of the issue" />
          <Textarea label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={4} placeholder="Provide full details..." />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} options={CATS} />
            <Select label="Priority" value={form.priority} onChange={v=>setForm(f=>({...f,priority:v}))} options={PRIS} />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={create} disabled={busy}>{busy?'Submitting...':'Submit case'}</button>
        </div>
      </Modal>

      {/* View case */}
      <Modal open={modal==='view'} onClose={()=>setModal(null)} title={`Case: ${selected?.title}`} size="lg">
        {selected && (
          <>
            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-[--text-muted] text-xs">Property</p><p className="font-medium">{selected.property_name}</p></div>
                <div><p className="text-[--text-muted] text-xs">Raised by</p><p className="font-medium">{selected.raised_by_name}</p></div>
                <div><p className="text-[--text-muted] text-xs">Date</p><p className="font-medium">{fmtDate(selected.created_at)}</p></div>
              </div>
              {selected.description && <p className="text-sm text-[--text-secondary] bg-[--surface-muted] rounded-xl p-3">{selected.description}</p>}

              {/* Staff can update status */}
              {['super_admin','property_manager'].includes((user?.role || '')) && (
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Status" value={selected.status} onChange={v=>{ setSelected(s=>({...s,status:v})); updateCase(selected.id,{status:v,priority:selected.priority}); }} options={STATS} />
                  <Select label="Priority" value={selected.priority} onChange={v=>{ setSelected(s=>({...s,priority:v})); updateCase(selected.id,{status:selected.status,priority:v}); }} options={PRIS} />
                </div>
              )}

              {/* Comments */}
              <div>
                <p className="text-sm font-semibold mb-3">Comments ({comments.length})</p>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {!comments.length ? <p className="text-xs text-[--text-muted]">No comments yet</p> :
                    comments.map((c,i) => (
                      <div key={i} className={`flex gap-3 ${c.user_id===(user?.sub || user?.id)?'flex-row-reverse':''}`}>
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-[--brand] flex-shrink-0">
                          {c.full_name?.charAt(0)}
                        </div>
                        <div className={`max-w-xs ${c.user_id===(user?.sub || user?.id)?'text-right':''}`}>
                          <p className="text-xs text-[--text-muted]">{c.full_name} · {fmtDateTime(c.created_at)}</p>
                          <p className={`text-sm mt-0.5 px-3 py-2 rounded-xl ${c.user_id===(user?.sub || user?.id)?'bg-brand-100 text-brand-800':'bg-[--surface-muted] text-[--text-primary]'}`}>{c.comment}</p>
                        </div>
                      </div>
                    ))
                  }
                </div>
                <div className="flex gap-2 mt-3">
                  <input className="input flex-1" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment..." onKeyDown={e=>e.key==='Enter'&&addComment()} />
                  <button className="btn-primary btn-sm" onClick={addComment} disabled={busy}>Send</button>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={()=>setModal(null)}>Close</button>
            </div>
          </>
        )}
      </Modal>
    </AppLayout>
  );
}
