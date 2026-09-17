// frontend/src/pages/admin/ServiceCharges.jsx  — NEW PAGE
// Add to App.jsx and Sidebar under Finance section
// Route: /admin/service-charges

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal     from '../../components/ui/Modal';
import Input     from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import api, { getProperties } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

const CHARGE_TYPES = [
  { value:'water',          label:'💧 Water' },
  { value:'electricity',    label:'⚡ Electricity' },
  { value:'garbage',        label:'🗑️ Garbage collection' },
  { value:'service_charge', label:'🏢 Service charge' },
  { value:'security',       label:'🔐 Security levy' },
  { value:'internet',       label:'🌐 Internet / Wi-Fi' },
  { value:'parking_fee',    label:'🚗 Parking fee' },
  { value:'gym',            label:'🏋️ Gym / amenities' },
  { value:'other',          label:'📋 Other' },
];

const BILLING_METHODS = [
  { value:'fixed',         label:'Fixed amount per unit' },
  { value:'per_unit',      label:'Per unit / per item' },
  { value:'shared_meter',  label:'Shared meter (split equally)' },
];

export default function ServiceCharges() {
  const qc = useQueryClient();
  const [propId, setPropId] = useState('');
  const [modal, setModal]   = useState(null); // 'rate' | 'generate' | 'meter'
  const [form, setForm]     = useState({ property_id:'', charge_type:'water', label:'', billing_method:'fixed', amount:'', is_active:1 });
  const [genForm, setGenForm]   = useState({ month_year: new Date().toISOString().slice(0,7), charge_types:[] });
  const [meterForm, setMeterForm] = useState({ charge_type:'water', reading_date: new Date().toISOString().split('T')[0], units_consumed:'', unit_rate:'', notes:'' });
  const [busy, setBusy]     = useState(false);
  const setE = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const setM = k => e => setMeterForm(f=>({...f,[k]:e.target.value}));

  const { data: props } = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: rates, isLoading } = useQuery({
    queryKey: ['sc-rates', propId],
    queryFn: () => propId ? api.get('/service-charges/rates', { params:{ property_id:propId } }).then(r=>r.data.rates) : [],
    enabled: !!propId,
  });

  const openRate = (rate) => {
    setForm(rate ? { ...rate } : { property_id: propId, charge_type:'water', label:'Water', billing_method:'fixed', amount:'', is_active:1 });
    setModal('rate');
  };

  const saveRate = async () => {
    if (!form.property_id || !form.charge_type || !form.label) return toast.error('All fields required');
    setBusy(true);
    try {
      await api.post('/service-charges/rates', form);
      toast.success('Rate saved!');
      qc.invalidateQueries(['sc-rates']);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const generateCharges = async () => {
    if (!propId || !genForm.month_year) return toast.error('Property and month required');
    setBusy(true);
    try {
      const { data } = await api.post('/service-charges/generate', {
        property_id: propId,
        month_year: genForm.month_year,
        charge_types: genForm.charge_types.length ? genForm.charge_types : undefined,
      });
      toast.success(`${data.generated} invoices generated! (${data.skipped} already existed)`);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const addMeterReading = async () => {
    if (!meterForm.units_consumed || !meterForm.unit_rate) return toast.error('Units consumed and unit rate required');
    setBusy(true);
    try {
      const { data } = await api.post('/service-charges/meter-reading', {
        ...meterForm, property_id: propId,
        month_year: genForm.month_year,
      });
      toast.success(`Reading saved. KES ${fmt(data.per_unit)} per unit × ${data.count} units = ${fmt(data.total)}. ${data.generated} invoices created.`);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const toggleChargeType = (type) => {
    setGenForm(f => ({
      ...f,
      charge_types: f.charge_types.includes(type)
        ? f.charge_types.filter(t => t !== type)
        : [...f.charge_types, type],
    }));
  };

  const totalPerUnit = meterForm.units_consumed && meterForm.unit_rate
    ? (parseFloat(meterForm.units_consumed) * parseFloat(meterForm.unit_rate)).toFixed(2) : null;

  const cols = [
    { label:'Charge type', render: r => <div>
        <p className="font-medium capitalize">{r.label}</p>
        <p className="text-xs text-[--text-muted]">{r.charge_type.replace(/_/g,' ')}</p>
      </div> },
    { label:'Method', render: r => <span className="text-xs capitalize text-[--text-muted]">{BILLING_METHODS.find(m=>m.value===r.billing_method)?.label||r.billing_method}</span> },
    { label:'Amount', render: r => <span className="font-medium">{fmt(r.amount)}</span> },
    { label:'Status', render: r => <span className={`badge ${r.is_active?'badge-green':'badge-gray'}`}>{r.is_active?'Active':'Inactive'}</span> },
    { label:'', render: r => (
      <div className="flex gap-1">
        <button className="btn-ghost btn-sm text-[--brand]" onClick={() => openRate(r)}>Edit</button>
      </div>
    )},
  ];

  return (
    <AppLayout title="Service Charges" actions={
      <div className="flex gap-2">
        <select className="input w-52" value={propId} onChange={e=>setPropId(e.target.value)}>
          <option value="">Select property...</option>
          {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {propId && <>
          <button className="btn-secondary btn-sm" onClick={()=>{ setMeterForm({charge_type:'water',reading_date:new Date().toISOString().split('T')[0],units_consumed:'',unit_rate:'',notes:''}); setModal('meter'); }}>
            📊 Meter reading
          </button>
          <button className="btn-secondary btn-sm" onClick={()=>setModal('generate')}>
            ⚡ Generate charges
          </button>
          <button className="btn-primary btn-sm" onClick={()=>openRate(null)}>
            + Add rate
          </button>
        </>}
      </div>
    }>

      {!propId ? (
        <div className="card card-body text-center py-16 text-[--text-muted]">
          <div className="text-5xl mb-3">💧</div>
          <p className="font-medium">Select a property to manage service charges</p>
          <p className="text-sm mt-1">Configure water, garbage, electricity, and other recurring charges</p>
        </div>
      ) : (
        <>
          {/* Info banner */}
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-medium text-blue-700">💡 How service charges work</p>
            <p className="text-xs text-[--blue] mt-1">
              Configure rates here → Click "Generate charges" monthly to create invoices for all active tenants →
              Or use "Meter reading" for shared meters (water, electricity) to auto-split the bill equally.
            </p>
          </div>

          <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
            <Table columns={cols} data={rates||[]} loading={isLoading}
              emptyText="No service charge rates configured for this property. Add rates above." />
          </div>
        </>
      )}

      {/* Add/Edit rate modal */}
      <Modal open={modal==='rate'} onClose={()=>setModal(null)} title={form.id ? 'Edit rate' : 'Add service charge rate'} size="md">
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label">Charge type *</label>
            <select className="input" value={form.charge_type} onChange={setE('charge_type')}>
              {CHARGE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <Input label="Display label *" value={form.label} onChange={setE('label')} placeholder="e.g. Monthly water charge" />
          <div>
            <label className="label">Billing method *</label>
            <select className="input" value={form.billing_method} onChange={setE('billing_method')}>
              {BILLING_METHODS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {form.billing_method !== 'shared_meter' && (
            <Input label="Amount (KES)" type="number" value={form.amount} onChange={setE('amount')}
              placeholder={form.billing_method==='shared_meter'?'Calculated from meter reading':'Fixed monthly amount'} />
          )}
          {form.billing_method === 'shared_meter' && (
            <div className="p-3 bg-blue-50 rounded-xl">
              <p className="text-xs text-[--blue]">💡 For shared meters: enter the amount as 0 here. Use the "Meter reading" button monthly to enter actual consumption, and the system will split the total equally among occupied units.</p>
            </div>
          )}
          <div className="flex items-center justify-between py-2">
            <label className="text-sm font-medium text-[--text-primary]">Active</label>
            <button onClick={()=>setForm(f=>({...f,is_active:f.is_active?0:1}))}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active?'bg-brand-600':'bg-[--canvas-200]'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[--surface] rounded-full shadow transition-transform ${form.is_active?'translate-x-5':''}`}/>
            </button>
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={saveRate} disabled={busy}>{busy?'Saving...':'Save rate'}</button>
        </div>
      </Modal>

      {/* Generate charges modal */}
      <Modal open={modal==='generate'} onClose={()=>setModal(null)} title="Generate service charge invoices" size="md">
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="label">Month *</label>
            <input type="month" className="input" value={genForm.month_year}
              onChange={e=>setGenForm(f=>({...f,month_year:e.target.value}))} />
          </div>
          <div>
            <label className="label mb-2 block">Charge types to generate (leave all unchecked = all active rates)</label>
            <div className="grid grid-cols-2 gap-2">
              {(rates||[]).filter(r=>r.is_active).map((r,i) => (
                <label key={i} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-[--surface-muted]">
                  <input type="checkbox" checked={genForm.charge_types.includes(r.charge_type)}
                    onChange={()=>toggleChargeType(r.charge_type)} className="rounded" />
                  <span className="text-sm">{r.label}</span>
                  <span className="text-xs text-[--text-muted] ml-auto">{fmt(r.amount)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="p-3 bg-[--amber-bg] rounded-xl text-xs text-amber-700">
            ⚠️ Already-generated invoices for the selected month will be skipped. Safe to run multiple times.
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={generateCharges} disabled={busy}>{busy?'Generating...':'Generate invoices'}</button>
        </div>
      </Modal>

      {/* Meter reading modal */}
      <Modal open={modal==='meter'} onClose={()=>setModal(null)} title="Enter shared meter reading" size="md">
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label">Utility type *</label>
            <select className="input" value={meterForm.charge_type} onChange={setM('charge_type')}>
              {CHARGE_TYPES.filter(t=>['water','electricity'].includes(t.value)).map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Billing month</label>
            <input type="month" className="input" value={genForm.month_year}
              onChange={e=>setGenForm(f=>({...f,month_year:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Total units consumed" type="number" value={meterForm.units_consumed}
              onChange={setM('units_consumed')} placeholder="e.g. 1250 (litres/kWh)" />
            <Input label="Rate per unit (KES)" type="number" step="0.01" value={meterForm.unit_rate}
              onChange={setM('unit_rate')} placeholder="e.g. 0.05" />
          </div>
          <Input label="Reading date" type="date" value={meterForm.reading_date} onChange={setM('reading_date')} />
          {totalPerUnit && (
            <div className="p-3 bg-[--brand-light] rounded-xl">
              <p className="text-sm font-medium text-[--brand-dark]">
                Total: KES {Number(totalPerUnit).toLocaleString()} ÷ {(rates||[]).length || '?'} units =
                <strong> KES {(parseFloat(totalPerUnit) / (Math.max((rates||[]).length,1))).toFixed(2)} per unit</strong>
              </p>
              <p className="text-xs text-[--text-muted] mt-1">This will create an invoice for each active tenant in this property.</p>
            </div>
          )}
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" value={meterForm.notes} onChange={setM('notes')} placeholder="e.g. February water bill, meter #WM-0042" />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={addMeterReading} disabled={busy}>{busy?'Saving...':'Save & generate invoices'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}