import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import KpiCard     from '../../components/ui/KpiCard';
import { getParkingSlots, updateSlotStatus, createParkingSlot, assignSlot, getProperties, getUsers, getUnits } from '../../api';

const STATUS_COLORS = { vacant:'bg-green-100 text-green-800 border border-[--green-bg]', occupied:'bg-red-100 text-red-800 border border-[--red-bg]', reserved:'bg-amber-100 text-amber-800 border border-[--amber-bg]', blocked:'bg-[--surface-muted] text-[--text-secondary] border border-[--border]' };

const ASSIGNEE_TYPES = [
  {value:'tenant',   label:'Tenant / Unit'},
  {value:'visitor',  label:'Visitor'},
  {value:'security', label:'Security'},
  {value:'caretaker',label:'Caretaker'},
  {value:'manager',  label:'Manager'},
  {value:'unassigned',label:'Release slot (make vacant)'},
];

export default function Parking() {
  const qc = useQueryClient();
  const { data: slots, isLoading } = useQuery({ queryKey:['parking'], queryFn: () => getParkingSlots().then(r=>r.data.slots) });
  const { data: props }  = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: users }  = useQuery({ queryKey:['users'],      queryFn: () => getUsers().then(r=>r.data.users) });
  const { data: units }  = useQuery({ queryKey:['units'],      queryFn: () => getUnits({ status:'occupied' }).then(r=>r.data.units) });

  const [addModal,   setAddModal]   = useState(false);
  const [assignModal,setAssignModal] = useState(null); // slot object
  const [filterProp, setFilterProp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [newSlot, setNewSlot]       = useState({ property_id:'', slot_number:'', type:'resident' });
  const [assignForm, setAssignForm] = useState({ assignee_type:'tenant', user_id:'', unit_id:'', vehicle_plate:'', visitor_name:'' });
  const [busy, setBusy] = useState(false);

  const allSlots = slots || [];
  const filteredSlots = allSlots.filter(s => {
    if (filterProp && String(s.property_id) !== String(filterProp)) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const stats = (allSlots).reduce((acc,s)=>{acc[s.status]=(acc[s.status]||0)+1;return acc;},{});
  const propOpts = (props||[]).map(p=>({value:p.id,label:p.name}));
  const userOpts = (users||[]).filter(u=>u.is_active).map(u=>({value:u.id,label:`${u.full_name} (${u.role})`}));
  const unitOpts = (units||[]).map(u=>({value:u.id,label:`Unit ${u.unit_number} — ${u.property_name} — ${u.tenant_name||'Vacant'}`}));

  const addSlot = async () => {
    if (!newSlot.property_id||!newSlot.slot_number) return toast.error('Property and slot number required');
    setBusy(true);
    try { await createParkingSlot(newSlot); toast.success('Slot added!'); qc.invalidateQueries(['parking']); setAddModal(false); }
    catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const doAssign = async () => {
    setBusy(true);
    try {
      const payload = { ...assignForm };
      if (payload.vehicle_plate) payload.vehicle_plate = payload.vehicle_plate.toUpperCase().trim();
      await assignSlot(assignModal.id, payload);
      toast.success(assignForm.assignee_type==='unassigned' ? 'Slot released' : `Slot assigned to ${assignForm.assignee_type}`);
      qc.invalidateQueries(['parking']);
      setAssignModal(null);
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <AppLayout title="Parking Management" actions={<button className="btn-primary btn-sm" onClick={()=>setAddModal(true)}>+ Add slot</button>}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total slots" value={slots?.length||0}  icon="🚗" color="brand" />
        <KpiCard label="Vacant"      value={stats.vacant||0}   icon="✅" color="green" />
        <KpiCard label="Occupied"    value={stats.occupied||0} icon="🔴" color="red"   />
        <KpiCard label="Reserved"    value={stats.reserved||0} icon="🟡" color="amber" />
      </div>

      <div className="card card-body">
        <div className="flex gap-2 mb-3 flex-wrap">
          <select className="input w-40 text-sm" value={filterProp} onChange={e=>setFilterProp(e.target.value)}>
            <option value="">All properties</option>
            {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input w-36 text-sm" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <span className="text-xs text-[--text-muted] self-center">{filteredSlots.length} slots</span>
        </div>
        <h2 className="text-sm font-semibold text-[--text-primary] mb-3">Click a slot to assign or release it</h2>
        <div className="flex gap-4 text-xs text-[--text-muted] mb-4 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-200 inline-block"></span>Vacant</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span>Occupied</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 inline-block"></span>Reserved</span>
        </div>
        {isLoading ? <p className="text-[--text-muted]">Loading...</p> : (
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {filteredSlots.map(s => (
              <button key={s.id} onClick={() => { setAssignModal(s); setAssignForm({ assignee_type: s.assigned_to_type==='unassigned'?'tenant':s.assigned_to_type, user_id: s.assigned_to_user_id||'', unit_id: s.assigned_to_unit_id||'', vehicle_plate: s.assigned_vehicle_plate||'', visitor_name: s.assigned_visitor_name||'' }); }}
                title={s.assigned_to_type==='unassigned' ? 'Vacant' : [
                  s.assigned_unit && `Unit ${s.assigned_unit}`,
                  s.assigned_user_name,
                  s.assigned_visitor_name,
                  s.assigned_vehicle_plate,
                ].filter(Boolean).join(' — ') || s.assigned_to_type}
                className={`p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-105 ${STATUS_COLORS[s.status]}`}>
                <div className="text-xs font-bold">{s.slot_number}</div>
                {/* BUG FIX: this used to fall back to the generic assignee
                    type ("tenant") for any tenant assignment, since
                    assigned_user_name was never populated for that case
                    (see the server-side fix in parking.js#assign) — the
                    single most common assignment type showed no actual
                    occupant identity at all. Now prefers, in order: the
                    unit number (tenant), the visitor's name, the staff
                    member's name, falling back to the role only if
                    nothing more specific is available. */}
                <div className="text-[10px] mt-0.5 capitalize truncate">
                  {s.assigned_to_type==='unassigned'
                    ? 'free'
                    : s.assigned_to_type==='tenant' && s.assigned_unit
                      ? `Unit ${s.assigned_unit}`
                      : s.assigned_to_type==='visitor' && s.assigned_visitor_name
                        ? s.assigned_visitor_name.split(' ')[0]
                        : s.assigned_user_name?.split(' ')[0] || s.assigned_to_type}
                </div>
                {s.assigned_vehicle_plate && (
                  <div className="text-[9px] mt-0.5 opacity-70 truncate">{s.assigned_vehicle_plate}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add slot modal */}
      <Modal open={addModal} onClose={()=>setAddModal(false)} title="Add parking slot" size="sm">
        <div className="p-5 space-y-2">
          <Select label="Property *" value={newSlot.property_id} onChange={v=>setNewSlot(n=>({...n,property_id:v}))} options={propOpts} placeholder="Select..." />
          <Input label="Slot number *" value={newSlot.slot_number} onChange={e=>setNewSlot(n=>({...n,slot_number:e.target.value}))} placeholder="e.g. P1, A-01" />
          <Select label="Type" value={newSlot.type} onChange={v=>setNewSlot(n=>({...n,type:v}))} options={[{value:'resident',label:'Resident'},{value:'visitor',label:'Visitor'},{value:'reserved',label:'Reserved'}]} />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setAddModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={addSlot} disabled={busy}>{busy?'Adding...':'Add slot'}</button>
        </div>
      </Modal>

      {/* Assign slot modal */}
      <Modal open={!!assignModal} onClose={()=>setAssignModal(null)} title={`Slot ${assignModal?.slot_number} — ${assignModal?.property_name}`}>
        <div className="p-5 flex flex-col gap-3">
          {assignModal?.assigned_to_type !== 'unassigned' && (
            <div className="alert-info text-sm">
              Currently assigned to: <strong className="capitalize">{assignModal?.assigned_to_type}</strong>
              {/* BUG FIX: this only ever showed assigned_user_name, which
                  was always empty for a tenant assignment — showed just
                  "Currently assigned to: tenant" with no way to tell
                  which tenant or unit. Now shows whichever identifying
                  details are actually available. */}
              {assignModal?.assigned_unit && ` — Unit ${assignModal.assigned_unit}`}
              {assignModal?.assigned_user_name && ` (${assignModal.assigned_user_name})`}
              {assignModal?.assigned_visitor_name && ` (${assignModal.assigned_visitor_name})`}
              {assignModal?.assigned_vehicle_plate && ` — ${assignModal.assigned_vehicle_plate}`}
            </div>
          )}
          <Select label="Assign to *" value={assignForm.assignee_type} onChange={v=>setAssignForm(f=>({...f,assignee_type:v}))} options={ASSIGNEE_TYPES} />
          {assignForm.assignee_type !== 'unassigned' && assignForm.assignee_type !== 'visitor' && (
            <Select label={assignForm.assignee_type==='tenant'?'Select unit':'Select user'} value={assignForm.assignee_type==='tenant'?assignForm.unit_id?.toString():assignForm.user_id?.toString()}
              onChange={v => { if(assignForm.assignee_type==='tenant') setAssignForm(f=>({...f,unit_id:v})); else setAssignForm(f=>({...f,user_id:v})); }}
              options={assignForm.assignee_type==='tenant'?unitOpts:userOpts.filter(u=>u.label.includes(assignForm.assignee_type))} placeholder="Select..." />
          )}
          {assignForm.assignee_type === 'visitor' && (
            <Input label="Visitor name" value={assignForm.visitor_name} onChange={e=>setAssignForm(f=>({...f,visitor_name:e.target.value}))} />
          )}
          {assignForm.assignee_type !== 'unassigned' && (
            <Input label="Vehicle plate" value={assignForm.vehicle_plate} onChange={e=>setAssignForm(f=>({...f,vehicle_plate:e.target.value.toUpperCase()}))} placeholder="KXX 000A" className="uppercase" />
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setAssignModal(null)}>Cancel</button>
          <button className={assignForm.assignee_type==='unassigned'?'btn-danger':'btn-primary'} onClick={doAssign} disabled={busy}>
            {busy?'Saving...':assignForm.assignee_type==='unassigned'?'Release slot':'Assign slot'}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
