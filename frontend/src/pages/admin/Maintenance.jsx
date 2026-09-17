// frontend/src/pages/admin/Maintenance.jsx  — ENHANCED
// Additions:
//   • Photo upload (before/after/report) on maintenance requests
//   • Preventive maintenance schedules tab
//   • SLA countdown badges

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
import ExportBar, { exportToCsv } from '../../components/ui/ExportBar';
import api, { getMaintenance, createMaintenance, updateMaintenance, getProperties, getUnits, getUsers } from '../../api';
import { fmtDate, fmtDateTime, priorityColor } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

const CATS  = ['plumbing','electrical','structural','appliance','pest','cleaning','security','other'].map(v=>({value:v,label:v}));
const PRIS  = ['low','normal','urgent','emergency'].map(v=>({value:v,label:v}));
const STATS = ['open','assigned','in_progress','completed','cancelled'].map(v=>({value:v,label:v.replace('_',' ')}));
const PHOTO_TYPES = [{value:'report',label:'Report'},{value:'before',label:'Before'},{value:'after',label:'After'}];

const SLA_HOURS = { emergency:2, urgent:24, normal:72, low:168 };

function SlaStatus({ created_at, priority, status }) {
  if (['completed','cancelled'].includes(status)) return null;
  const hours = (Date.now() - new Date(created_at)) / 3600000;
  const sla   = SLA_HOURS[priority] || 72;
  const pct   = Math.min(100, (hours / sla) * 100);
  const breached = hours > sla;
  return (
    <div className="mt-1">
      <div className="flex justify-between items-center mb-0.5">
        <span style={{fontSize:11,color:"var(--text-muted)"}}>SLA</span>
        <span className={`text-xs font-medium ${breached?'text-[--red]':'text-[--text-muted]'}`}>
          {breached ? 'BREACHED' : `${Math.round(sla-hours)}h left`}
        </span>
      </div>
      <div className="w-full bg-[--surface-muted] rounded-full h-1">
        <div className={`h-1 rounded-full transition-all ${breached?'bg-[--red]':pct>75?'bg-[--amber]':'bg-[--green]'}`}
          style={{width:`${pct}%`}}/>
      </div>
    </div>
  );
}

export default function Maintenance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters]       = useState({ status:'', property_id:'' });
  const [activeTab, setActiveTab]   = useState('requests');
  const [modal, setModal]           = useState(null);
  const [selected, setSelected]     = useState(null);
  const [photos, setPhotos]         = useState([]);
  const [updateHistory, setUpdateHistory] = useState([]);
  const [page, setPage]  = useState(1);
  const [form, setForm]             = useState({ unit_id:'', title:'', description:'', category:'other', priority:'normal' });
  const [updateForm, setUpdateForm] = useState({ status:'', assigned_to:'', cost:'', notes:'' });
  const [photoForm, setPhotoForm]   = useState({ type:'report', files:[] });
  const [schedForm, setSchedForm]   = useState({ title:'', property_id:'', category:'other', frequency_days:30, start_date:new Date().toISOString().split('T')[0] });
  const [busy, setBusy]             = useState(false);
  const setF = k => e => setFilters(f => ({ ...f, [k]: e.target.value }));

  const { data: maintResp, isLoading } = useQuery({ queryKey:['maintenance', filters, page], queryFn: () => getMaintenance({ ...filters, page, limit: 50 }).then(r=>r.data) });
  const requests   = maintResp?.requests   || [];
  const maint_meta = maintResp?.meta       || {};
  const { data: schedules } = useQuery({ queryKey:['maint-schedules'], queryFn: () => api.get('/maintenance/schedules').then(r=>r.data.schedules).catch(()=>[]) });
  const { data: props }     = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: allUnits }  = useQuery({ queryKey:['units-all'], queryFn: () => getUnits().then(r=>r.data.units) });
  const { data: staff }     = useQuery({
    queryKey: ['users-staff', selected?.property_id],
    queryFn: () => getUsers().then(r => {
      const all = r.data.users || [];
      // Filter to staff in the same property as the selected request, or all if no property
      return all.filter(u => ['caretaker','property_manager','super_admin'].includes(u.role) &&
        (!selected?.property_id || !u.property_id || u.property_id === selected.property_id || u.role === 'super_admin'));
    })
  });

  const unitOpts  = (allUnits||[]).map(u=>({value:u.id,label:`${u.unit_number} - ${u.property_name}`}));
  const staffOpts = (staff||[]).map(u=>({value:u.id,label:`${u.full_name} (${u.role})`}));

  const create = async () => {
    if (!form.unit_id||!form.title) return toast.error('Unit and title required');
    setBusy(true);
    try { await createMaintenance(form); toast.success('Request created!'); qc.invalidateQueries(['maintenance']); setModal(null); }
    catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const update = async () => {
    if (!updateForm.status) return toast.error('Status required');
    setBusy(true);
    try { await updateMaintenance(selected.id, updateForm); toast.success('Updated!'); qc.invalidateQueries(['maintenance']); setModal(null); }
    catch { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  const openDetail = async (r) => {
    setSelected(r);
    setUpdateForm({ status: r.status, assigned_to: r.assigned_to||'', cost: r.cost||'', notes:'' });
    // Load photos
    try {
      const { data: p } = await api.get(`/maintenance/${r.id}/photos`);
      setPhotos(p.photos||[]);
    } catch { setPhotos([]); }
    // Load update history
    try {
      const { data: u } = await api.get(`/maintenance/${r.id}/updates`);
      setUpdateHistory(u.updates||[]);
    } catch { setUpdateHistory([]); }
    setModal('detail');
  };

  const uploadPhotos = async () => {
    if (!photoForm.files.length) return toast.error('Select photos first');
    setBusy(true);
    const fd = new FormData();
    Array.from(photoForm.files).forEach(f => fd.append('photos', f));
    fd.append('type', photoForm.type);
    try {
      await api.post(`/maintenance/${selected.id}/photos`, fd, { headers:{'Content-Type':'multipart/form-data'} });
      toast.success('Photos uploaded!');
      const { data: p } = await api.get(`/maintenance/${selected.id}/photos`);
      setPhotos(p.photos||[]);
      setPhotoForm({ type:'report', files:[] });
    } catch { toast.error('Upload failed'); }
    finally { setBusy(false); }
  };

  const createSchedule = async () => {
    if (!schedForm.title||!schedForm.property_id) return toast.error('Title and property required');
    try {
      await api.post('/maintenance/schedules', schedForm);
      toast.success('Schedule created!');
      qc.invalidateQueries(['maint-schedules']);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const exportData = () => exportToCsv(
    (requests).map(r=>({ '#':r.id, Title:r.title, Category:r.category, Priority:r.priority, Status:r.status, Unit:r.unit_number, Property:r.property_name, Assigned:r.assigned_name||'', Cost:r.cost||'', Created:fmtDate(r.created_at) })),
    'maintenance');

  const cols = [
    { label:'Request', render: r => (
      <div>
        <p className="font-medium">{r.title}</p>
        <p className="text-xs text-[--text-muted]">{r.unit_number} · {r.property_name}</p>
        <SlaStatus created_at={r.created_at} priority={r.priority} status={r.status} />
      </div>
    )},
    { label:'Category',  render: r => <span className="text-xs capitalize text-[--text-muted]">{r.category}</span> },
    { label:'Priority',  render: r => <span className={priorityColor(r.priority)}>{r.priority}</span> },
    { label:'Status',    render: r => <span className={`badge ${r.status==='completed'?'badge-green':r.status==='open'?'badge-amber':r.status==='in_progress'?'badge-blue':'badge-gray'}`}>{r.status.replace('_',' ')}</span> },
    { label:'Assigned',  render: r => r.assigned_name||<span className="text-[--text-muted] text-xs">Unassigned</span> },
    { label:'Cost',      render: r => r.cost ? <span className="text-xs">{r.cost}</span> : '—' },
    { label:'Date',      render: r => <span className="text-xs text-[--text-muted]">{fmtDate(r.created_at)}</span> },
    { label:'', render: r => (
      <button className="btn-ghost btn-sm text-[--brand]" onClick={e=>{e.stopPropagation();openDetail(r);}}>
        Update
      </button>
    )},
  ];

  return (
    <AppLayout title="Maintenance" actions={
      <div className="flex gap-2">
        <ExportBar onCsv={exportData}/>
        <button className="btn-secondary btn-sm" onClick={() => { setSchedForm({title:'',property_id:'',category:'other',frequency_days:30,start_date:new Date().toISOString().split('T')[0]}); setModal('schedule'); }}>
          ⏰ Add schedule
        </button>
        <button className="btn-primary btn-sm" onClick={() => { setForm({unit_id:'',title:'',description:'',category:'other',priority:'normal'}); setModal('add'); }}>
          + New request
        </button>
      </div>
    }>

      {/* Tabs */}
      <div className="flex gap-1 bg-[--surface-muted] p-1 rounded-xl mb-4 w-fit">
        <button onClick={()=>setActiveTab('requests')} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab==='requests'?'bg-[--surface] shadow':'text-[--text-muted]'}`}>
          Requests {requests?.length>0&&<span className="ml-1 bg-[--brand] text-white text-xs px-1.5 rounded-full">{requests.length}</span>}
        </button>
        <button onClick={()=>setActiveTab('schedules')} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab==='schedules'?'bg-[--surface] shadow':'text-[--text-muted]'}`}>
          Preventive schedules {schedules?.length>0&&<span className="ml-1 bg-slate-400 text-white text-xs px-1.5 rounded-full">{schedules.length}</span>}
        </button>
      </div>

      {/* Filters */}
      {activeTab === 'requests' && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <select className="input w-36" value={filters.status} onChange={setF('status')}>
            <option value="">All statuses</option>
            {STATS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="input w-48" value={filters.property_id} onChange={setF('property_id')}>
            <option value="">All properties</option>
            {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {activeTab === 'requests' && (
        <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
          <Table columns={cols} data={requests} loading={isLoading} />
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="card card-body">
          {!(schedules||[]).length
            ? <p className="text-center py-8 text-[--text-muted]">No preventive maintenance schedules yet. Add one to auto-create recurring work orders.</p>
            : <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {(schedules||[]).map((s,i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[--surface-muted] rounded-xl">
                    <div>
                      <p className="font-medium text-[--text-primary]">{s.title}</p>
                      <p className="text-xs text-[--text-muted]">{s.property_name} · {s.category} · every {s.frequency_days} days</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[--text-muted]">Next due</p>
                      <p className={`text-sm font-medium ${new Date(s.next_due)<new Date()?'text-[--red]':'text-[--text-primary]'}`}>{fmtDate(s.next_due)}</p>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Add request modal */}
      <Modal open={modal==='add'} onClose={()=>setModal(null)} title="New maintenance request" size="md">
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label">Unit *</label>
            <select className="input" value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))}>
              <option value="">Select unit...</option>
              {unitOpts.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <Input label="Title *" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Leaking tap in bathroom" />
          <Textarea label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Category</label>
              <select className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {CATS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div><label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>
                {PRIS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={create} disabled={busy}>{busy?'Creating...':'Create'}</button>
        </div>
      </Modal>

      {/* Detail / update modal */}
      {selected && (
        <Modal open={modal==='detail'} onClose={()=>setModal(null)} title={selected.title} size="lg">
          <div className="p-5 flex flex-col gap-4">
            <div className="p-3 bg-[--surface-muted] rounded-xl text-sm">
              <p className="text-[--text-muted]">{selected.unit_number} · {selected.property_name} · {selected.category}</p>
              {selected.description && <p className="mt-1 text-[--text-secondary]">{selected.description}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Status</label>
                <select className="input" value={updateForm.status} onChange={e=>setUpdateForm(f=>({...f,status:e.target.value}))}>
                  {STATS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><label className="label">Assign to</label>
                <select className="input" value={updateForm.assigned_to} onChange={e=>setUpdateForm(f=>({...f,assigned_to:e.target.value}))}>
                  <option value="">Unassigned</option>
                  {staffOpts.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <Input label="Cost (KES)" type="number" value={updateForm.cost} onChange={e=>setUpdateForm(f=>({...f,cost:e.target.value}))} placeholder="0" />
            <Textarea label="Update notes" value={updateForm.notes} onChange={e=>setUpdateForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="What was done?" />

            {/* Update history */}
            {updateHistory.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wide mb-2">Update history</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {updateHistory.map((u, i) => (
                    <div key={i} className="text-xs bg-[--surface-muted] rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-[--text-primary]">{u.updated_by_name || 'Staff'}</span>
                        <span className="text-[--text-muted]">{new Date(u.created_at).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      {u.status && <span className="badge badge-gray mr-1">{u.status.replace('_',' ')}</span>}
                      {u.note && <p className="text-[--text-secondary] mt-1">{u.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo upload */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wide mb-2">Photos</p>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {photos.map((p,i) => (
                    <div key={i} className="relative">
                      <img src={p.url} alt={p.photo_type} className="w-20 h-20 object-cover rounded-lg border" />
                      <span className="absolute bottom-0 left-0 right-0 text-center text-white text-xs bg-black/50 rounded-b-lg py-0.5">{p.photo_type}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <div>
                  <label className="label text-xs">Photo type</label>
                  <select className="input text-sm" value={photoForm.type} onChange={e=>setPhotoForm(f=>({...f,type:e.target.value}))}>
                    {PHOTO_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label text-xs">Select photos</label>
                  <input type="file" multiple accept="image/*"
                    onChange={e=>setPhotoForm(f=>({...f,files:e.target.files}))}
                    className="block w-full text-xs text-[--text-muted] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[--surface-muted] file:text-[--text-secondary] cursor-pointer" />
                </div>
                <button className="btn-secondary btn-sm" onClick={uploadPhotos} disabled={busy||!photoForm.files.length}>
                  Upload
                </button>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={()=>setModal(null)}>Close</button>
            <button className="btn-primary" onClick={update} disabled={busy}>{busy?'Saving...':'Save update'}</button>
          </div>
        </Modal>
      )}

      {/* Add schedule modal */}
      <Modal open={modal==='schedule'} onClose={()=>setModal(null)} title="New preventive maintenance schedule" size="md">
        <div className="p-5 flex flex-col gap-3">
          <Input label="Task title *" value={schedForm.title} onChange={e=>setSchedForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Water pump service" />
          <div><label className="label">Property *</label>
            <select className="input" value={schedForm.property_id} onChange={e=>setSchedForm(f=>({...f,property_id:e.target.value}))}>
              <option value="">Select property...</option>
              {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Category</label>
              <select className="input" value={schedForm.category} onChange={e=>setSchedForm(f=>({...f,category:e.target.value}))}>
                {CATS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div><label className="label">Repeat every (days)</label>
              <input className="input" type="number" min="7" value={schedForm.frequency_days} onChange={e=>setSchedForm(f=>({...f,frequency_days:e.target.value}))} />
            </div>
          </div>
          <Input label="Start date" type="date" value={schedForm.start_date} onChange={e=>setSchedForm(f=>({...f,start_date:e.target.value}))} />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={createSchedule} disabled={busy}>{busy?'Saving...':'Create schedule'}</button>
        </div>
      </Modal>
      {maint_meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="btn-secondary btn-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-[--text-muted]">Page {maint_meta.page} of {maint_meta.pages} ({maint_meta.total} total)</span>
          <button disabled={page>=maint_meta.pages} onClick={()=>setPage(p=>p+1)} className="btn-secondary btn-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </AppLayout>
  );
}
