import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout  from '../../components/layout/AppLayout';
import Modal      from '../../components/ui/Modal';
import Input      from '../../components/ui/Input';
import Textarea   from '../../components/ui/Textarea';
import { Table }  from '../../components/ui/Table';
import api, { getProperties, createProperty, updateProperty, getUsers } from '../../api';
import { fmt } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { name:'', location:'', address:'', description:'', manager_id:'', owner_id:'', management_fee_pct:'0' };

export default function Properties() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: users }     = useQuery({ queryKey:['users'],       queryFn: () => getUsers().then(r=>r.data.users) });
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(EMPTY);
  const [busy, setBusy]     = useState(false);
  const set  = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const setV = k => v => setForm(p=>({...p,[k]:v}));

  const [selectedProp, setSelectedProp] = useState(null);
  const { data: propDetail } = useQuery({
    queryKey: ['property-detail', selectedProp?.id],
    queryFn:  () => selectedProp ? api.get('/properties/' + selectedProp.id).then(r => r.data.property) : null,
    enabled:  !!selectedProp,
  });

  const managers = (users||[]).filter(u=>u.role==='property_manager'||u.role==='super_admin');
  const owners   = (users||[]).filter(u=>u.role==='owner');

  const save = async () => {
    if (!form.name) return toast.error('Property name is required');
    setBusy(true);
    try {
      if (form.id) await updateProperty(form.id, form);
      else await createProperty(form);
      toast.success('Property saved!');
      qc.invalidateQueries(['properties']);
      setModal(null);
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const occ = (r) => r.total_units > 0 ? Math.round((r.occupied_units/r.total_units)*100) : 0;

  const cols = [
    { label:'Property',  render: r => <div><p style={{fontWeight:700,fontSize:13}}>{r.name}</p><p style={{fontSize:11,color:"var(--text-muted)"}}>{r.location||"—"}</p></div> },
    { label:'Units', render: r => <div><p style={{fontFamily:"JetBrains Mono,monospace",fontSize:13,fontWeight:600}}>{r.occupied_units||0}/{r.total_units||0}</p><div style={{width:72,height:5,background:"var(--canvas-200)",borderRadius:100,overflow:"hidden",marginTop:4}}><div style={{width:`${occ(r)}%`,height:"100%",background:occ(r)>=80?"var(--green)":occ(r)>=50?"var(--brand)":"var(--red)",borderRadius:100}}/></div></div> },
    { label:'Potential revenue', render: r => <span style={{fontFamily:"Fraunces,serif",fontStyle:"italic",fontWeight:700,fontSize:14,color:"var(--green)"}}>{r.potential_monthly_revenue?fmt(r.potential_monthly_revenue):"—"}/mo</span> },
    { label:'Outstanding', render: r => r.outstanding>0 ? <span style={{fontFamily:"Fraunces,serif",fontStyle:"italic",fontWeight:700,fontSize:14,color:"var(--red)"}}>{fmt(r.outstanding)}</span> : <span style={{fontSize:12,fontWeight:700,color:"var(--green)"}}>Clear ✓</span> },
    { label:'Manager',   render: r => r.manager_name||'—' },
    { label:'Mgmt fee',  render: r => r.management_fee_pct > 0 ? `${r.management_fee_pct}%` : '—' },
    { label:'', render: r => (
      <><button className="btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setForm({...r,manager_id:r.manager_id||'',owner_id:r.owner_id||'',management_fee_pct:r.management_fee_pct||'0'});setModal('edit');}}>Edit</button>
        <button className="btn-ghost btn-sm text-[--red]" onClick={async e=>{
          e.stopPropagation();
          if (!window.confirm('Delete this property? This will fail if active tenancies exist.')) return;
          try {
            await api.delete('/properties/'+r.id);
            toast.success('Property deleted');
            qc.invalidateQueries(['properties']);
          } catch(err2) { toast.error(err2.response?.data?.error||'Delete failed'); }
        }}>🗑</button></>
    )},
  ];

  return (
    <AppLayout title="Properties" actions={<button className="btn-primary btn-sm" onClick={()=>{setForm(EMPTY);setModal('add');}}>+ Add property</button>}>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)"}}>
        <Table columns={cols} data={data} loading={isLoading} onRow={r=>setSelectedProp(r)} />
      </div>

      {/* Property detail drawer */}
      {selectedProp && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedProp(null)}>
          <div className="w-full max-w-sm bg-[--surface] shadow-2xl h-full overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[--border] flex items-center justify-between sticky top-0 bg-[--surface] z-10">
              <div>
                <h3 className="font-semibold text-[--text-primary]">{selectedProp.name}</h3>
                <p className="text-xs text-[--text-muted]">{selectedProp.location||''}</p>
              </div>
              <button onClick={() => setSelectedProp(null)} className="text-[--text-muted] hover:text-[--text-secondary] text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Total units', selectedProp.total_units||0],
                  ['Occupied', selectedProp.occupied_units||0],
                  ['Vacant', selectedProp.vacant_units||0],
                  ['Occupancy', `${selectedProp.total_units > 0 ? Math.round((selectedProp.occupied_units/selectedProp.total_units)*100) : 0}%`],
                ].map(([label,val]) => (
                  <div key={label} className="bg-[--surface-muted] rounded-xl p-3">
                    <p className="text-xs text-[--text-muted]">{label}</p>
                    <p className="font-bold text-[--text-primary] text-lg">{val}</p>
                  </div>
                ))}
              </div>

              {/* Manager & Owner */}
              <div className="space-y-2 text-sm">
                {[
                  ['Manager', selectedProp.manager_name],
                  ['Owner', selectedProp.owner_name||'—'],
                  ['Mgmt fee', selectedProp.management_fee_pct > 0 ? `${selectedProp.management_fee_pct}%` : '—'],
                ].map(([label,val]) => (
                  <div key={label} className="flex justify-between py-1.5 border-b border-[--border]">
                    <span className="text-[--text-muted]">{label}</span>
                    <span className="font-medium text-[--text-primary]">{val||'—'}</span>
                  </div>
                ))}
              </div>

              {/* Staff */}
              <div>
                <p className="text-xs font-bold text-[--text-muted] uppercase tracking-wide mb-2">👥 Staff</p>
                {!propDetail ? (
                  <p className="text-xs text-[--text-muted]">Loading…</p>
                ) : !(propDetail.staff||[]).length ? (
                  <p className="text-xs text-[--text-muted] italic">No staff assigned to this property</p>
                ) : (
                  <div className="space-y-2">
                    {(propDetail.staff||[]).map(s => (
                      <div key={s.id} className="flex items-center gap-2.5 p-2 bg-[--surface-muted] rounded-xl">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-[--brand-dark]">
                          {s.full_name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[--text-primary] truncate">{s.full_name}</p>
                          <p className="text-xs text-[--text-muted] capitalize">{s.role?.replace('_',' ')}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-[--red]'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit button */}
              <button className="btn-primary w-full"
                onClick={() => { setForm({...selectedProp,manager_id:selectedProp.manager_id||'',owner_id:selectedProp.owner_id||'',management_fee_pct:selectedProp.management_fee_pct||'0'}); setModal('edit'); setSelectedProp(null); }}>
                ✏️ Edit property
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='edit'?'Edit property':'Add property'} size="lg">
        <div className="p-5 grid grid-cols-2 gap-x-4">
          <div className="col-span-2"><Input label="Property name *" value={form.name} onChange={set('name')} placeholder="e.g. Westlands Heights Estate" /></div>
          <Input label="Location" value={form.location||''} onChange={set('location')} placeholder="e.g. Westlands, Nairobi" />
          <Input label="Full address" value={form.address||''} onChange={set('address')} />

          {/* Manager */}
          <div className="form-group">
            <label className="label">Property Manager</label>
            <select className="input" value={form.manager_id||''} onChange={set('manager_id')}>
              <option value="">Select manager...</option>
              {managers.map(u=><option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>

          {/* Owner */}
          <div className="form-group">
            <label className="label">Property Owner</label>
            <select className="input" value={form.owner_id||''} onChange={set('owner_id')}>
              <option value="">Select owner (optional)...</option>
              {owners.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          <Input label="Management fee (%)" type="number" min="0" max="100" step="0.5"
            value={form.management_fee_pct||'0'} onChange={set('management_fee_pct')}
            placeholder="e.g. 10 for 10%" />

          <div className="col-span-2"><Textarea label="Description" value={form.description||''} onChange={set('description')} /></div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving...':'Save property'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
