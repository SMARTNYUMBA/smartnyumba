import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import api, { getProperties, getUnits } from '../../api';
import { fmt } from '../../utils/helpers';

export default function SharedMeters() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey:['shared-meters'], queryFn: () => api.get('/sharedMeters').then(r=>r.data.meters) });
  const { data: props }     = useQuery({ queryKey:['properties'],    queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: allUnits }  = useQuery({ queryKey:['units-all'],     queryFn: () => getUnits().then(r=>r.data.units) });

  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState({ property_id:'', name:'', utility_type:'water', split_method:'equal', unit_ids:[] });
  const [readForm, setReadForm] = useState({ meter_id:'', current_reading:'', previous_reading:'', reading_date: new Date().toISOString().split('T')[0], generate_invoices: true, due_date:'' });
  const [result, setResult] = useState(null);
  const [busy, setBusy]     = useState(false);

  const propOpts  = (props||[]).map(p=>({value:String(p.id), label:p.name}));
  const meterOpts = (data||[]).map(m=>({value:String(m.id), label:`${m.name} (${m.utility_type}) — ${m.property_name}`}));

  // Only show units for selected property
  const filteredUnits = (allUnits||[]).filter(u => String(u.property_id) === String(form.property_id));

  const toggleUnit = id => {
    const sid = String(id);
    setForm(f => ({
      ...f,
      unit_ids: f.unit_ids.includes(sid) ? f.unit_ids.filter(x=>x!==sid) : [...f.unit_ids, sid]
    }));
  };

  const save = async () => {
    if (!form.property_id||!form.name) return toast.error('Property and name required');
    if (!form.unit_ids.length) return toast.error('Select at least one unit');
    setBusy(true);
    try {
      await api.post('/sharedMeters', { ...form, units: form.unit_ids.map(id=>({unit_id:id})) });
      toast.success('Shared meter created!');
      qc.invalidateQueries(['shared-meters']);
      setModal(null);
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const postReading = async () => {
    if (!readForm.meter_id||!readForm.current_reading) return toast.error('Meter and current reading required');
    setBusy(true);
    try {
      const { data: r } = await api.post('/sharedMeters/reading', { ...readForm });
      setResult(r);
      toast.success(r.message);
      qc.invalidateQueries(['shared-meters']);
      setModal('result');
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const cols = [
    { label:'Meter name',   render: r => <span className="font-semibold">{r.name}</span> },
    { label:'Property',     render: r => r.property_name },
    { label:'Type',         render: r => <span className="badge badge-blue">{r.utility_type}</span> },
    { label:'Split method', render: r => r.split_method.replace('_',' ') },
    { label:'Units linked', render: r => <span className="badge badge-gray">{r.unit_count} units</span> },
  ];

  return (
    <AppLayout title="Shared Meters" actions={
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" onClick={()=>setModal('reading')}>📊 Post reading</button>
        <button className="btn-primary btn-sm"   onClick={()=>{setForm({property_id:'',name:'',utility_type:'water',split_method:'equal',unit_ids:[]});setModal('add');}}>+ Add meter</button>
      </div>
    }>
      <div className="alert-info text-xs mb-4">Shared meters split one water or electricity bill automatically across multiple units.</div>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={data} loading={isLoading} emptyMsg="No shared meters configured" /></div>

      {/* Add meter modal */}
      <Modal open={modal==='add'} onClose={()=>setModal(null)} title="Add shared meter" size="lg">
        <div className="p-5 flex flex-col gap-4">
          <Select label="Property *" value={form.property_id} onChange={v=>setForm(f=>({...f,property_id:v,unit_ids:[]}))} options={propOpts} placeholder="Select property first..." />
          <Input label="Meter name *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Block A Water Meter" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Utility type *" value={form.utility_type} onChange={v=>setForm(f=>({...f,utility_type:v}))}
              options={[{value:'water',label:'Water'},{value:'electricity',label:'Electricity'},{value:'gas',label:'Gas'}]} />
            <Select label="Split method" value={form.split_method} onChange={v=>setForm(f=>({...f,split_method:v}))}
              options={[{value:'equal',label:'Equal split (all pay same)'},{value:'custom',label:'Custom percentage'}]} />
          </div>

          {/* Unit selector */}
          {form.property_id ? (
            <div>
              <label className="label mb-2">
                Select units to include *
                <span className="text-[--brand] font-normal ml-2">({form.unit_ids.length} selected)</span>
              </label>
              {filteredUnits.length === 0 ? (
                <p className="text-sm text-[--text-muted] italic">No units found for this property</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-4 bg-[--surface-muted] rounded-xl border border-[--border]">
                  {filteredUnits.map(u => {
                    const selected = form.unit_ids.includes(String(u.id));
                    return (
                      <button key={u.id} type="button" onClick={()=>toggleUnit(u.id)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                          selected ? 'border-brand-500 bg-[--brand-light] text-[--brand-dark]'
                                   : 'border-[--border] text-[--text-secondary] hover:border-[--border-strong]'
                        }`}>
                        {u.unit_number}
                        {selected && <span className="ml-1">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={()=>setForm(f=>({...f,unit_ids:filteredUnits.map(u=>String(u.id))}))}
                className="text-xs text-[--brand] hover:underline mt-2">Select all</button>
              <span className="mx-2 text-[--text-muted]">|</span>
              <button type="button" onClick={()=>setForm(f=>({...f,unit_ids:[]}))} className="text-xs text-[--text-muted] hover:underline">Clear all</button>
            </div>
          ) : (
            <div className="p-4 bg-[--surface-muted] rounded-xl text-sm text-[--text-muted] text-center">
              ← Select a property first to see its units
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Creating...':'Create meter'}</button>
        </div>
      </Modal>

      {/* Post reading modal */}
      <Modal open={modal==='reading'} onClose={()=>setModal(null)} title="Post shared meter reading">
        <div className="p-5 flex flex-col gap-3">
          <Select label="Shared meter *" value={readForm.meter_id} onChange={v=>setReadForm(f=>({...f,meter_id:v}))} options={meterOpts} placeholder="Select meter..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Previous reading" type="number" value={readForm.previous_reading} onChange={e=>setReadForm(f=>({...f,previous_reading:e.target.value}))} placeholder="0" />
            <Input label="Current reading *" type="number" value={readForm.current_reading} onChange={e=>setReadForm(f=>({...f,current_reading:e.target.value}))} />
          </div>
          <Input label="Reading date *" type="date" value={readForm.reading_date} onChange={e=>setReadForm(f=>({...f,reading_date:e.target.value}))} />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="gen" checked={readForm.generate_invoices} onChange={e=>setReadForm(f=>({...f,generate_invoices:e.target.checked}))} className="accent-brand-600 w-4 h-4" />
            <label htmlFor="gen" className="text-sm text-[--text-secondary] cursor-pointer">Auto-generate invoice for each unit</label>
          </div>
          {readForm.generate_invoices && <Input label="Invoice due date" type="date" value={readForm.due_date} onChange={e=>setReadForm(f=>({...f,due_date:e.target.value}))} />}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={postReading} disabled={busy}>{busy?'Calculating...':'Post & split bill'}</button>
        </div>
      </Modal>

      {/* Result modal */}
      <Modal open={modal==='result'} onClose={()=>setModal(null)} title="Bill split result" size="lg">
        <div className="p-5">
          {result && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-[--surface-muted] rounded-xl p-3 text-center"><p className="text-lg font-bold">{result.total_units_consumed}</p><p className="text-xs text-[--text-muted]">Units consumed</p></div>
                <div className="bg-[--surface-muted] rounded-xl p-3 text-center"><p className="text-lg font-bold">{fmt(result.total_amount)}</p><p className="text-xs text-[--text-muted]">Total bill</p></div>
                <div className="bg-[--green-bg] rounded-xl p-3 text-center"><p className="text-lg font-bold text-[--green]">{result.invoices_created}</p><p className="text-xs text-[--text-muted]">Invoices created</p></div>
              </div>
              <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Unit</th><th>Amount billed</th><th>Invoice</th></tr></thead>
                <tbody>
                  {result.splits?.map((s,i) => (
                    <tr key={i}>
                      <td className="font-medium">{s.unit}</td>
                      <td className="font-bold">{fmt(s.amount)}</td>
                      <td>{s.tenancy_id ? <span className="badge badge-green">✓ Created</span> : <span className="badge badge-gray">No active tenancy</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2"><button className="btn-primary" onClick={()=>setModal(null)}>Done</button></div>
      </Modal>
    </AppLayout>
  );
}
