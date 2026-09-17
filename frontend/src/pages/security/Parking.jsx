import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout  from '../../components/layout/AppLayout';
import Modal      from '../../components/ui/Modal';
import Input      from '../../components/ui/Input';
import Select     from '../../components/ui/Select';
import { Table }  from '../../components/ui/Table';
import Badge      from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { getParkingSlots, assignSlot, getUnits } from '../../api';

// BUG FIX (whole file): this page was checking slot.status === 'available',
// but the real status values are 'vacant' | 'occupied' | 'reserved' |
// 'maintenance' — 'available' never matches anything, so the Assign
// button never appeared for any slot and the "Available" stat always
// showed 0. It also read r.tenant_name / r.vehicle_plate directly off
// the slot, but the API returns assigned_unit / assigned_user_name /
// assigned_vehicle_plate / assigned_visitor_name — so even when a slot
// WAS occupied, this table showed "—" for both Tenant and Vehicle,
// regardless of who was actually parked there. And doAssign() never
// sent assignee_type at all, which the backend requires — so even
// clicking Assign (on the rare slot where the button did appear, e.g.
// after a manual DB edit) would fail outright with "assignee_type
// required". Rewritten against the actual API contract.

export default function SecurityParking() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [assignModal, setAssignModal] = useState(null);
  const [assignForm,  setAssignForm]  = useState({ assignee_type: 'tenant', unit_id: '', vehicle_plate: '', visitor_name: '' });
  const [busy, setBusy] = useState(false);

  const { data: slots, isLoading } = useQuery({
    queryKey: ['parking-slots', user?.property_id],
    queryFn: () => getParkingSlots().then(r => r.data.slots),
  });

  const { data: units } = useQuery({
    queryKey: ['units-occupied', user?.property_id],
    queryFn: () => getUnits({ status: 'occupied', property_id: user?.property_id || undefined }).then(r => r.data.units),
  });

  // Filter to security guard's assigned property
  const mySlots = (slots||[]).filter(s =>
    !user?.property_id || String(s.property_id) === String(user.property_id)
  );

  const unitOpts = (units||[]).map(u => ({
    value: u.id,
    label: `Unit ${u.unit_number}${u.tenant_name ? ' — ' + u.tenant_name : ''}`,
  }));

  const doAssign = async () => {
    if (!assignForm.vehicle_plate) return toast.error('Vehicle plate required');
    if (assignForm.assignee_type === 'tenant' && !assignForm.unit_id) return toast.error('Select a unit');
    if (assignForm.assignee_type === 'visitor' && !assignForm.visitor_name) return toast.error('Visitor name required');
    setBusy(true);
    try {
      await assignSlot(assignModal.id, assignForm);
      toast.success('Slot assigned!');
      qc.invalidateQueries(['parking-slots']);
      setAssignModal(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const doVacate = async (id) => {
    try {
      // BUG FIX: this used to call updateSlotStatus(id, {status:'available'}),
      // a status the backend doesn't recognize, and — separately — it
      // never cleared the occupant fields at all, so a "vacated" slot
      // would still show the previous occupant's name/plate. Releasing
      // through assignSlot's assignee_type:'unassigned' path is the
      // same action the admin portal uses, and correctly clears
      // everything.
      await assignSlot(id, { assignee_type: 'unassigned' });
      toast.success('Slot vacated');
      qc.invalidateQueries(['parking-slots']);
    } catch { toast.error('Failed'); }
  };

  const available = mySlots.filter(s => s.status === 'vacant').length;
  const occupied  = mySlots.filter(s => s.status === 'occupied').length;

  const occupantLabel = (r) => {
    if (r.assigned_to_type === 'unassigned' || !r.assigned_to_type) return null;
    if (r.assigned_to_type === 'tenant') return r.assigned_unit ? `Unit ${r.assigned_unit}${r.assigned_user_name ? ' — ' + r.assigned_user_name : ''}` : r.assigned_user_name;
    if (r.assigned_to_type === 'visitor') return r.assigned_visitor_name || 'Visitor';
    return r.assigned_user_name || r.assigned_to_type;
  };

  const cols = [
    { label: 'Slot',     render: r => <span className="font-bold text-lg">{r.slot_number}</span> },
    { label: 'Type',     render: r => <span className="capitalize text-sm text-[--text-muted]">{r.type}</span> },
    { label: 'Status',   render: r => <Badge status={r.status} label={r.status} /> },
    { label: 'Occupant', render: r => occupantLabel(r) || <span className="text-[--text-muted]">—</span> },
    { label: 'Vehicle',  render: r => r.assigned_vehicle_plate
        ? <span className="font-mono text-sm bg-[--surface-muted] px-2 py-1 rounded">{r.assigned_vehicle_plate}</span>
        : '—' },
    { label: '', render: r => (
      <div className="flex gap-1">
        {r.status === 'vacant' && (
          <button className="btn-primary btn-sm" onClick={e => { e.stopPropagation(); setAssignModal(r); setAssignForm({ assignee_type: 'tenant', unit_id:'', vehicle_plate:'', visitor_name:'' }); }}>
            Assign
          </button>
        )}
        {r.status === 'occupied' && (
          <button className="btn-danger btn-sm" onClick={e => { e.stopPropagation(); doVacate(r.id); }}>
            Vacate
          </button>
        )}
      </div>
    )},
  ];

  return (
    <AppLayout title="Parking">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card card-body text-center">
          <p className="text-3xl font-bold text-[--brand]">{mySlots.length}</p>
          <p className="text-xs text-[--text-muted] mt-1">Total slots</p>
        </div>
        <div className="card card-body text-center">
          <p className="text-3xl font-bold text-[--green]">{available}</p>
          <p className="text-xs text-[--text-muted] mt-1">Available</p>
        </div>
        <div className="card card-body text-center">
          <p className="text-3xl font-bold text-[--text-secondary]">{occupied}</p>
          <p className="text-xs text-[--text-muted] mt-1">Occupied</p>
        </div>
      </div>

      {user?.property_id && (
        <div className="alert-info text-xs mb-4">📍 Showing slots for your assigned property only.</div>
      )}

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={mySlots} loading={isLoading} emptyMsg="No parking slots found" />
        </div>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Assign slot ${assignModal?.slot_number}`} size="sm">
        <div className="p-5 flex flex-col gap-3">
          <Select label="Assign to" value={assignForm.assignee_type}
            onChange={v => setAssignForm(f => ({ ...f, assignee_type: v }))}
            options={[{value:'tenant',label:'Tenant'},{value:'visitor',label:'Visitor'}]} />
          {assignForm.assignee_type === 'tenant' ? (
            <Select label="Unit *" value={assignForm.unit_id}
              onChange={v => setAssignForm(f => ({ ...f, unit_id: v }))}
              options={unitOpts} placeholder="Select unit..." />
          ) : (
            <Input label="Visitor name *" value={assignForm.visitor_name} onChange={e => setAssignForm(f=>({...f,visitor_name:e.target.value}))} />
          )}
          <Input label="Vehicle plate *" value={assignForm.vehicle_plate} onChange={e => setAssignForm(f=>({...f,vehicle_plate:e.target.value.toUpperCase()}))} placeholder="KXX 000A" />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setAssignModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={doAssign} disabled={busy}>{busy ? 'Assigning...' : 'Assign slot'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
