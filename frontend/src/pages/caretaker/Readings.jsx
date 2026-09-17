import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import { getReadings, createReading, getUnits } from '../../api';
import { fmtDate } from '../../utils/helpers';


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function Readings() {
  const { user } = useAuth() || {};
  const qc = useQueryClient();
  const { isLoading, data: readings } = useQuery({ queryKey: ['readings'], queryFn: () => getReadings().then(r => r.data.readings) });
  const myPropId = (user?.profile?.property_id || user?.property_id);
  const { data: units } = useQuery({
    queryKey: ['units','occupied', myPropId],
    queryFn:  () => getUnits({ status:'occupied', ...(myPropId ? { property_id: myPropId } : {}) }).then(r => r.data.units),
  });
  const [form, setForm] = useState({ unit_id:'', utility_type:'water', current_reading:'', reading_date: new Date().toISOString().split('T')[0], generate_invoice:'0' });
  const [prevReading, setPrevReading] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = k => v => setForm(p=>({...p,[k]:v}));
  const setE = k => e => setForm(p=>({...p,[k]:e.target.value}));

  const unitOpts = (units||[]).map(u => ({ value: `${u.id}|${u.tenancy_id||''}`, label: `${u.unit_number} — ${u.property_name}` }));
  const consumed = Math.max(0, parseFloat(form.current_reading||0) - parseFloat(prevReading||0));
  const rate = form.utility_type === 'water' ? 80 : 25;
  const amount = consumed * rate;

  const post = async () => {
    if (!form.unit_id || !form.current_reading || !form.reading_date) return toast.error('Unit, reading and date required');
    setBusy(true);
    const [unit_id, tenancy_id] = form.unit_id.split('|');
    try {
      const { data: r } = await createReading({ ...form, unit_id, tenancy_id, previous_reading: prevReading, read_by: user?.sub || user?.id });
      toast.success(`Reading posted! Amount: KES ${Number(r.amount).toLocaleString()}${r.invoice_id ? ' — Invoice created' : ''}`);
      qc.invalidateQueries(['readings']);
      setForm(f => ({ ...f, current_reading:'' }));
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const cols = [
    { label:'Unit',     render: r => r.unit_number },
    { label:'Property', render: r => r.property_name },
    { label:'Type',     render: r => <span className="badge badge-blue">{r.utility_type}</span> },
    { label:'Previous', render: r => r.previous_reading },
    { label:'Current',  render: r => r.current_reading },
    { label:'Consumed', render: r => `${r.units_consumed} units` },
    { label:'Amount',   render: r => `KES ${Number(r.amount).toLocaleString()}` },
    { label:'Date',     render: r => fmtDate(r.reading_date) },
  ];

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Post Utility Readings">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card card-body space-y-1">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-3">Post new reading</h2>
          <Select label="Unit *" value={form.unit_id} onChange={set('unit_id')} options={unitOpts} placeholder="Select unit..." />
          <Select label="Utility type *" value={form.utility_type} onChange={set('utility_type')} options={[{value:'water',label:'Water'},{value:'electricity',label:'Electricity'},{value:'gas',label:'Gas'}]} />
          <Input label="Reading date *" type="date" value={form.reading_date} onChange={setE('reading_date')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Previous reading" type="number" value={prevReading} onChange={e => setPrevReading(e.target.value)} />
            <Input label="Current reading *" type="number" value={form.current_reading} onChange={setE('current_reading')} />
          </div>
          <div className="bg-[--surface-muted] rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-[--text-muted]">Units consumed:</span><span className="font-semibold">{consumed.toFixed(1)}</span></div>
            <div className="flex justify-between"><span className="text-[--text-muted]">Rate:</span><span>KES {rate}/unit</span></div>
            <div className="flex justify-between text-base"><span className="font-semibold">Amount to bill:</span><span className="font-bold text-[--brand]">KES {amount.toLocaleString()}</span></div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" id="gen-inv" checked={form.generate_invoice==='1'} onChange={e => setForm(p=>({...p,generate_invoice:e.target.checked?'1':'0'}))} />
            <label htmlFor="gen-inv" className="text-sm text-[--text-secondary] cursor-pointer">Auto-generate invoice</label>
          </div>
          <button className="btn-primary w-full justify-center mt-3" onClick={post} disabled={busy}>{busy?'Posting...':'Post reading'}</button>
        </div>

        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-3">Recent readings</h2>
          <Table columns={cols} data={(readings||[]).slice(0,10)} emptyMsg="No readings yet" />
        </div>
      </div>
    </AppLayout>
  );
}
