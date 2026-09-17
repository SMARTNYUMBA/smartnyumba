import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import api from '../../api';
import { fmt } from '../../utils/helpers';

const CATS = ['plumbing','electrical','cleaning','security','pest_control','construction','it','other'].map(v=>({value:v,label:v.replace('_',' ')}));

export default function Vendors() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey:['vendors'], queryFn: () => api.get('/vendors').then(r=>r.data.vendors) });
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState({ name:'', category:'other', phone:'', email:'', address:'', notes:'' });
  const [jobs, setJobs]   = useState(null);
  const [busy, setBusy]   = useState(false);
  const setE = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const save = async () => {
    if (!form.name) return toast.error('Vendor name required');
    setBusy(true);
    try {
      if (form.id) await api.put(`/vendors/${form.id}`, form);
      else await api.post('/vendors', form);
      toast.success('Vendor saved!');
      qc.invalidateQueries(['vendors']);
      setModal(null);
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const viewJobs = async (v) => {
    const { data: r } = await api.get(`/vendors/${v.id}/jobs`);
    setJobs({ vendor: v, jobs: r.jobs });
    setModal('jobs');
  };

  const stars = (r) => '⭐'.repeat(r||0) + '☆'.repeat(5-(r||0));

  const cols = [
    { label:'Name',     render: r => <span className="font-semibold">{r.name}</span> },
    { label:'Category', render: r => <span className="badge badge-blue capitalize">{r.category.replace('_',' ')}</span> },
    { label:'Phone',    render: r => r.phone||'—' },
    { label:'Email',    render: r => r.email||'—' },
    { label:'Rating',   render: r => <span className="text-[--amber] text-xs">{stars(r.rating)}</span> },
    { label:'Status',   render: r => <span className={`badge ${r.is_active?'badge-green':'badge-gray'}`}>{r.is_active?'Active':'Inactive'}</span> },
    { label:'', render: r => (
      <div className="flex gap-1">
        <button className="btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setForm(r);setModal('edit');}}>Edit</button>
        <button className="btn-ghost btn-sm text-[--brand]" onClick={e=>{e.stopPropagation();viewJobs(r);}}>Jobs</button>
      </div>
    )},
  ];

  return (
    <AppLayout title="Vendors & Contractors" actions={<button className="btn-primary btn-sm" onClick={()=>{setForm({name:'',category:'other',phone:'',email:'',address:'',notes:''});setModal('add');}}>+ Add vendor</button>}>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={data} loading={isLoading} emptyMsg="No vendors yet" /></div>

      <Modal open={modal==='add'||modal==='edit'} onClose={()=>setModal(null)} title={modal==='edit'?'Edit vendor':'Add vendor'}>
        <div className="p-5 grid grid-cols-2 gap-x-4">
          <div className="col-span-2"><Input label="Vendor / Company name *" value={form.name} onChange={setE('name')} /></div>
          <Select label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} options={CATS} />
          <Input label="Rating (1–5)" type="number" min="1" max="5" value={form.rating||''} onChange={setE('rating')} />
          <Input label="Phone" value={form.phone||''} onChange={setE('phone')} />
          <Input label="Email" type="email" value={form.email||''} onChange={setE('email')} />
          <div className="col-span-2"><Textarea label="Address" value={form.address||''} onChange={setE('address')} rows={2} /></div>
          <div className="col-span-2"><Textarea label="Notes" value={form.notes||''} onChange={setE('notes')} rows={2} /></div>
          {modal==='edit' && <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={form.is_active===1||form.is_active===true} onChange={e=>setForm(f=>({...f,is_active:e.target.checked?1:0}))} />
            <label className="text-sm text-[--text-secondary]">Active</label>
          </div>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving...':'Save vendor'}</button>
        </div>
      </Modal>

      <Modal open={modal==='jobs'} onClose={()=>setModal(null)} title={`Jobs — ${jobs?.vendor?.name}`} size="lg">
        <div className="p-5">
          {!jobs?.jobs?.length ? <p className="text-center py-8 text-[--text-muted]">No jobs assigned to this vendor</p> :
            <div className="table-wrap">
            <table className="table"><thead><tr><th>Title</th><th>Unit</th><th>Priority</th><th>Status</th><th>Quoted</th><th>Actual cost</th></tr></thead>
            <tbody>{jobs.jobs.map((j,i)=>(
              <tr key={i}>
                <td className="font-medium">{j.title}</td>
                <td>{j.unit_number}</td>
                <td><span className={`badge ${j.priority==='emergency'?'badge-red':j.priority==='urgent'?'badge-amber':'badge-gray'}`}>{j.priority}</span></td>
                <td><span className={`badge ${j.status==='completed'?'badge-green':'badge-blue'}`}>{j.status}</span></td>
                <td>{j.quoted_cost?fmt(j.quoted_cost):'—'}</td>
                <td>{j.cost?fmt(j.cost):'—'}</td>
              </tr>
            ))}</tbody></table>
            </div>
          }
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2"><button className="btn-secondary" onClick={()=>setModal(null)}>Close</button></div>
      </Modal>
    </AppLayout>
  );
}
