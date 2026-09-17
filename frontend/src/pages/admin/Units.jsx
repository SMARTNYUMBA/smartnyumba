import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal     from '../../components/ui/Modal';
import Input     from '../../components/ui/Input';
import Select    from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import Badge     from '../../components/ui/Badge';
import { getUnits, getProperties, createUnit, updateUnit } from '../../api';
import { fmt, statusColor } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

const UNIT_TYPES = [
  {value:'bedsitter',label:'Bedsitter'},{value:'one_bedroom',label:'1 Bedroom'},
  {value:'two_bedroom',label:'2 Bedroom'},{value:'three_bedroom',label:'3 Bedroom'},
  {value:'studio',label:'Studio'},{value:'penthouse',label:'Penthouse'},
  {value:'shop',label:'Shop'},{value:'office',label:'Office'},
];
const STATUSES = [
  {value:'vacant',label:'Vacant'},{value:'occupied',label:'Occupied'},
  {value:'reserved',label:'Reserved'},{value:'under_maintenance',label:'Maintenance'},
];
const EMPTY = { property_id:'', unit_number:'', floor:'1', type:'one_bedroom', rent_amount:'', deposit_amount:'0', status:'vacant' };

export default function Units() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ property_id:'', status:'' });
  const { data, isLoading } = useQuery({ queryKey: ['units', filters], queryFn: () => getUnits(filters).then(r => r.data.units) });
  const { data: props } = useQuery({ queryKey: ['properties'], queryFn: () => getProperties().then(r => r.data.properties) });
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY);
  const [busy, setBusy]   = useState(false);
  const set = k => v => setForm(p => ({ ...p, [k]: v }));
  const setE = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.property_id || !form.unit_number || !form.rent_amount) return toast.error('Property, unit number and rent required');
    setBusy(true);
    try {
      if (form.id) await updateUnit(form.id, form); else await createUnit(form);
      toast.success('Unit saved!');
      qc.invalidateQueries(['units']);
      setModal(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const propOpts = (props || []).map(p => ({ value: p.id, label: p.name }));

  const cols = [
    { label:'Unit',     render: r => <span style={{fontWeight:700,fontSize:13}}>{r.unit_number}</span> },
    { label:'Property', render: r => r.property_name },
    { label:'Floor',    render: r => `Floor ${r.floor}` },
    { label:'Type',     render: r => r.type?.replace(/_/g,' ') },
    { label:'Rent',     render: r => fmt(r.rent_amount) },
    { label:'Status',   render: r => <Badge status={r.status} /> },
    { label:'Tenant',   render: r => r.tenant_name || <span className="text-[--text-muted]">—</span> },
    { label:'', render: r => <button className="btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setForm({ ...r, property_id: r.property_id?.toString() }); setModal('edit'); }}>Edit</button> },
  ];

  return (
    <AppLayout title="Units" actions={<button className="btn-primary btn-sm" onClick={() => { setForm(EMPTY); setModal('add'); }}>+ Add unit</button>}>
      <div className="flex gap-3 mb-4">
        <select className="input w-auto" value={filters.property_id} onChange={e => setFilters(f => ({...f, property_id: e.target.value}))}>
          <option value="">All properties</option>
          {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-auto" value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={data} loading={isLoading} /></div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={form.id ? 'Edit unit' : 'Add unit'}>
        <div className="p-5 grid grid-cols-2 gap-x-4">
          <div className="col-span-2"><Select label="Property *" value={form.property_id} onChange={set('property_id')} options={propOpts} placeholder="Select property..." /></div>
          <Input label="Unit number *" value={form.unit_number} onChange={setE('unit_number')} placeholder="e.g. A1" />
          <Input label="Floor" type="number" value={form.floor} onChange={setE('floor')} min="1" />
          <Select label="Type" value={form.type} onChange={set('type')} options={UNIT_TYPES} />
          <Select label="Status" value={form.status} onChange={set('status')} options={STATUSES} />
          <Input label="Rent (KES) *" type="number" value={form.rent_amount} onChange={setE('rent_amount')} />
          <Input label="Deposit (KES)" type="number" value={form.deposit_amount} onChange={setE('deposit_amount')} />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save unit'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
