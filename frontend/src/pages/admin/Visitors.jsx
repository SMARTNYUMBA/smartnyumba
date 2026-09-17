import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import Badge       from '../../components/ui/Badge';
import KpiCard     from '../../components/ui/KpiCard';
import { getVisitors, checkInVisitor, checkOutVisitor, getUnits, getProperties } from '../../api';
import { fmtTime, fmtDate } from '../../utils/helpers';

export default function Visitors() {
  const qc = useQueryClient();
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState('today');
  const { data, isLoading } = useQuery({ queryKey: ['visitors', date, period], queryFn: () => getVisitors(period === 'today' ? { date } : { period }).then(r => r.data) });
  const { data: units } = useQuery({ queryKey: ['units','occupied'], queryFn: () => getUnits({ status:'occupied' }).then(r => r.data.units) });
  const { data: props } = useQuery({ queryKey: ['properties'], queryFn: () => getProperties().then(r => r.data.properties) });
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ property_id:'', unit_id:'', name:'', phone:'', id_number:'', vehicle_plate:'', purpose:'' });
  const [busy, setBusy]   = useState(false);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const unitOpts = (units||[])
    .filter(u => !form.property_id || String(u.property_id) === String(form.property_id))
    .map(u => ({ value: u.id, label: `${u.unit_number} — ${u.property_name}` }));
  const propOpts = (props||[]).map(p => ({ value: p.id, label: p.name }));

  const checkIn = async () => {
    if (!form.property_id || !form.name) return toast.error('Property and visitor name required');
    setBusy(true);
    try { await checkInVisitor(form); toast.success(`${form.name} checked in!`); qc.invalidateQueries(['visitors']); setModal(false); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const doCheckOut = async (id, name) => {
    try { await checkOutVisitor(id); toast.success(`${name} checked out`); qc.invalidateQueries(['visitors']); }
    catch (e) { toast.error('Failed'); }
  };

  const on_site = (data?.visitors||[]).filter(v => v.status === 'checked_in').length;

  const cols = [
    { label:'Visitor', render: r => <span style={{fontWeight:600,fontSize:13}}>{r.name}</span> },
    { label:'Phone',   render: r => r.phone || '—' },
    { label:'Visiting',render: r => `${r.unit_number || '—'} (${r.property_name})` },
    { label:'Vehicle', render: r => r.vehicle_plate || '—' },
    { label:'Purpose', render: r => r.purpose || '—' },
    { label:'In',      render: r => fmtTime(r.check_in) },
    { label:'Out',     render: r => r.check_out ? fmtTime(r.check_out) : '—' },
    { label:'Status',  render: r => <Badge status={r.status} label={r.status.replace('_',' ')} /> },
    { label:'', render: r => r.status === 'checked_in' && (
      <button className="btn-danger btn-sm" onClick={e => { e.stopPropagation(); doCheckOut(r.id, r.name); }}>Check out</button>
    )},
  ];

  return (
    <AppLayout title="Visitors" actions={<button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Check in visitor</button>}>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Currently on site" value={on_site}             icon="👋" color="green" />
        <KpiCard label="Total today"       value={data?.visitors?.length||0} icon="📋" color="brand" />
        <KpiCard label="Checked out"       value={(data?.visitors?.length||0) - on_site} icon="✅" color="slate" />
      </div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {[
            {id:'today',  label:'Today'},
            {id:'week',   label:'7 days'},
            {id:'month',  label:'30 days'},
            {id:'on_site',label:'🟢 On site'},
          ].map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${period===p.id?'bg-brand-600 text-white':'bg-[--surface-muted] text-[--text-secondary] hover:bg-[--canvas-200]'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'today' && (
          <input type="date" className="input w-auto text-sm" value={date} onChange={e => setDate(e.target.value)} />
        )}
      </div>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={data?.visitors} loading={isLoading} /></div>

      <Modal open={modal} onClose={() => setModal(false)} title="Check in visitor">
        <div className="p-5 space-y-1">
          <Select label="Property *" value={form.property_id} onChange={v => setForm(p=>({...p,property_id:v,unit_id:''}))} options={propOpts} placeholder="Select property..." />
          <Select label="Visiting unit" value={form.unit_id} onChange={v => setForm(p=>({...p,unit_id:v}))} options={unitOpts} placeholder="Select unit..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Visitor name *" value={form.name}    onChange={set('name')}    placeholder="Full name" />
            <Input label="Phone"          value={form.phone}   onChange={set('phone')}   placeholder="07XX XXX XXX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="ID number"      value={form.id_number}    onChange={set('id_number')} />
            <Input label="Vehicle plate"  value={form.vehicle_plate} onChange={set('vehicle_plate')} placeholder="KXX 000A" />
          </div>
          <Input label="Purpose" value={form.purpose} onChange={set('purpose')} placeholder="e.g. Social visit" />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={checkIn} disabled={busy}>{busy?'Checking in...':'Check in'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
