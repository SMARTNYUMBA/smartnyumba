import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout  from '../../components/layout/AppLayout';
import Modal      from '../../components/ui/Modal';
import api, { getReadings, getProperties, getUnits } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function AdminUtilities() {
  const qc = useQueryClient();
  const [filterProp, setFilterProp] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ unit_id:'', utility_type:'water', current_reading:'', previous_reading:'0', rate_per_unit:'', reading_date: new Date().toISOString().slice(0,10) });
  const [busy, setBusy]   = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const { data: readings, isLoading } = useQuery({
    queryKey: ['readings', filterProp],
    queryFn:  () => getReadings(filterProp ? { property_id: filterProp } : {}).then(r => r.data.readings || []),
  });
  const { data: props } = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r => r.data.properties || []) });
  const { data: units } = useQuery({ queryKey:['units'], queryFn: () => getUnits({}).then(r => r.data.units || []) });

  const propUnits = form.property_id
    ? (units||[]).filter(u => String(u.property_id) === String(form.property_id))
    : units||[];

  const save = async () => {
    if (!form.unit_id || !form.current_reading) return toast.error('Unit and reading required');
    setBusy(true);
    try {
      await api.post('/utilities', form);
      toast.success('Reading recorded!');
      setModal(false);
      setForm({ unit_id:'', utility_type:'water', current_reading:'', previous_reading:'0', rate_per_unit:'', reading_date: new Date().toISOString().slice(0,10) });
      qc.invalidateQueries(['readings']);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <AppLayout title="Utilities / Meter Readings" actions={
      <button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Record reading</button>
    }>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-44 text-sm" value={filterProp} onChange={e => setFilterProp(e.target.value)}>
            <option value="">All properties</option>
            {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-[--text-muted]">Loading…</div>
          ) : !(readings||[]).length ? (
            <div className="p-12 text-center"><p className="text-3xl mb-2">💧</p><p className="text-[--text-muted]">No readings yet</p></div>
          ) : (
            <div className="overflow-x-auto">
              <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Unit</th><th>Property</th><th>Type</th><th>Previous</th><th>Current</th><th>Units</th><th>Amount</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {(readings||[]).map(r => (
                    <tr key={r.id}>
                      <td className="font-mono">{r.unit_number}</td>
                      <td>{r.property_name}</td>
                      <td className="capitalize">{r.utility_type}</td>
                      <td>{r.previous_reading}</td>
                      <td className="font-semibold">{r.current_reading}</td>
                      <td>{r.units_consumed}</td>
                      <td className="font-bold text-[--brand]">{fmt(r.total_amount)}</td>
                      <td className="text-[--text-muted] text-sm">{fmtDate(r.reading_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Record meter reading" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving…':'Record'}</button></>}>
        <div className="p-5 flex flex-col gap-3">
          <div className="form-group">
            <label className="label">Property</label>
            <select className="input" value={form.property_id||''} onChange={e => setForm(f => ({...f, property_id: e.target.value, unit_id:''}))}>
              <option value="">All properties</option>
              {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Unit *</label>
            <select className="input" value={form.unit_id} onChange={set('unit_id')}>
              <option value="">Select unit…</option>
              {propUnits.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number} — {u.property_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Utility type</label>
            <select className="input" value={form.utility_type} onChange={set('utility_type')}>
              <option value="water">Water</option>
              <option value="electricity">Electricity</option>
              <option value="gas">Gas</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="form-group">
              <label className="label">Previous reading</label>
              <input className="input" type="number" value={form.previous_reading} onChange={set('previous_reading')} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="label">Current reading *</label>
              <input className="input" type="number" value={form.current_reading} onChange={set('current_reading')} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="form-group">
              <label className="label">Rate per unit</label>
              <input className="input" type="number" value={form.rate_per_unit} onChange={set('rate_per_unit')} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="label">Reading date</label>
              <input className="input" type="date" value={form.reading_date} onChange={set('reading_date')} />
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
