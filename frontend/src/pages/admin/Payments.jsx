import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getPayments, getProperties, getTenancies, getInvoices, recordPayment } from '../../api';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import ExportBar, { exportToCsv, exportToExcel } from '../../components/ui/ExportBar';
import { fmt, fmtDate, fmtDateTime } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

const METHODS = ['mpesa','bank','cash','cheque','other'].map(v=>({value:v,label:v.replace('_',' ')}));

export default function Payments() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ property_id:'', tenancy_id:'', date_from:'', date_to:'' });
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ invoice_id:'', tenancy_id:'', amount:'', payment_method:'mpesa', transaction_code:'', mpesa_phone:'', notes:'' });
  const [tenancyInvoices, setTenancyInvoices] = useState([]);
  const [busy, setBusy]       = useState(false);
  const setF = k => v => setFilters(f=>({...f,[k]:v}));
  const setE = k => e => setForm(f=>({...f,[k]: k==='transaction_code'?e.target.value.toUpperCase():e.target.value}));

  const { data, isLoading } = useQuery({ queryKey:['payments',filters], queryFn: () => getPayments(filters).then(r=>r.data) });
  const paymentsData = data?.payments||[];
  const total = data?.total_amount||(paymentsData).reduce((s,p)=>s+Number(p.amount||0),0);
  const { data: props }     = useQuery({ queryKey:['properties'],       queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: tenancies } = useQuery({ queryKey:['tenancies-active'], queryFn: () => getTenancies({status:'active'}).then(r=>r.data.tenancies) });

  const onTenancyChange = async (tenancy_id) => {
    setForm(f=>({...f,tenancy_id,invoice_id:''}));
    if (tenancy_id) {
      const { data: r } = await getInvoices({ tenancy_id });
      setTenancyInvoices((r.invoices||r.data?.invoices||[]).filter(i=>['unpaid','overdue','partial'].includes(i.status)));
    } else { setTenancyInvoices([]); }
  };

  const onInvoiceChange = (invoice_id) => {
    const inv = tenancyInvoices.find(i=>String(i.id)===String(invoice_id));
    setForm(f=>({...f, invoice_id, amount: inv ? String(inv.balance) : ''}));
  };

  const save = async () => {
    if (!form.invoice_id||!form.tenancy_id||!form.amount||!form.payment_method) return toast.error('All required fields must be filled');
    setBusy(true);
    try {
      const { data: r } = await recordPayment(form);
      toast.success(`Payment recorded! Receipt: ${r.receipt_number}`);
      qc.invalidateQueries(['payments']); qc.invalidateQueries(['invoices']);
      setModal(false);
      setForm({ invoice_id:'', tenancy_id:'', amount:'', payment_method:'mpesa', transaction_code:'', mpesa_phone:'', notes:'' });
      setTenancyInvoices([]);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  // FIX: exportData was calling exportToCsv (void) and passing its result to exportToExcel — Excel button was broken
  const getExportRows = () => (paymentsData).map(p=>({
    '#': p.id, Tenant: p.tenant_name, Unit: p.unit_number, Property: p.property_name,
    Amount: p.amount, Method: p.payment_method, Code: p.transaction_code||'',
    Receipt: p.receipt_number||'', Date: fmtDateTime(p.paid_at)
  }));
  const exportData = () => { exportToCsv(getExportRows(), `payments-${new Date().toISOString().slice(0,10)}`); };

  const tenOpts = (tenancies||[]).map(t=>({value:t.id,label:`${t.tenant_name} - ${t.unit_number} (${t.property_name})`}));
  const invOpts = tenancyInvoices.map(i=>({value:i.id,label:`Invoice #${i.id} - ${i.type} - Balance: KES ${Number(i.balance).toLocaleString()}`}));

  const methodBadge = { mpesa:'badge-green', bank:'badge-blue', cash:'badge-amber', cheque:'badge-purple', other:'badge-gray' };

  const cols = [
    { label:'Tenant',   render: r => <div><p style={{fontWeight:600,fontSize:13}}>{r.tenant_name}</p><p style={{fontSize:11,color:"var(--text-muted)"}}>{r.unit_number}</p></div> },
    { label:'Property', render: r => <span style={{fontSize:12,color:"var(--text-muted)"}}>{r.property_name}</span> },
    { label:'Amount',   render: r => <span style={{fontFamily:"Fraunces,serif",fontStyle:"italic",fontWeight:700,fontSize:15,color:"var(--green)"}}>{fmt(r.amount)}</span> },
    { label:'Method',   render: r => <span className={`badge ${methodBadge[r.payment_method]||'badge-gray'}`}>{r.payment_method?.replace('_',' ')}</span> },
    { label:'Code',     render: r => r.transaction_code ? <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:11}}>{r.transaction_code}</span> : '—' },
    { label:'Receipt',  render: r => r.receipt_number || '—' },
    { label:'Date',     render: r => fmtDateTime(r.paid_at) },
    { label:'',         render: r => (
      <button className="text-xs text-[--brand] hover:underline"
        onClick={() => api.get(`/pdf/receipt/${r.id}`, { responseType:'blob' }).then(res => {
          const url = URL.createObjectURL(res.data);
          const a = document.createElement('a');
          a.href = url; a.download = `Receipt-${r.receipt_number||r.id}.pdf`; a.click();
          URL.revokeObjectURL(url);
        }).catch(() => toast.error('Failed to download receipt'))}>
        📄 Receipt
      </button>
    )},
  ];

  return (
    <AppLayout title="Payments" actions={
      <div className="flex gap-2">
        <ExportBar onCsv={exportData} onExcel={() => exportToExcel(getExportRows(), 'payments')} />
        {can(user, 'record_payment') && <button className="btn-primary btn-sm" onClick={()=>setModal(true)}>+ Record payment</button>}
      </div>
    }>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="input w-48 text-sm" value={filters.property_id} onChange={e=>setF('property_id')(e.target.value)}>
          <option value="">All properties</option>
          {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-64 text-sm" value={filters.tenancy_id} onChange={e=>setF('tenancy_id')(e.target.value)}>
          <option value="">All tenants</option>
          {(tenancies||[]).map(t=><option key={t.id} value={t.id}>{t.tenant_name} - {t.unit_number}</option>)}
        </select>
        <input type="date" className="input w-36 text-sm" value={filters.date_from}
          onChange={e=>setF('date_from')(e.target.value)} title="From date" />
        <span className="text-[--text-muted] text-xs">—</span>
        <input type="date" className="input w-36 text-sm" value={filters.date_to}
          onChange={e=>setF('date_to')(e.target.value)} title="To date" />
        {(filters.date_from||filters.date_to)&&<button className="text-xs text-[--brand] hover:underline" onClick={()=>setFilters(f=>({...f,date_from:'',date_to:''}))}>✕</button>}
        <div className="ml-auto card card-body py-2 px-4">
          <span className="text-xs text-[--text-muted]">Total shown: </span>
          <span className="font-bold text-[--green] ml-1">{fmt(total)}</span>
        </div>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={paymentsData} loading={isLoading} /></div>

      {/* Record payment */}
      <Modal open={modal} onClose={()=>setModal(false)} title="Record payment" size="lg">
        <div className="p-5 flex flex-col gap-3">
          <div className="form-group">
            <label className="label">Tenant / Tenancy *</label>
            <select className="input" value={form.tenancy_id} onChange={e=>onTenancyChange(e.target.value)}>
              <option value="">Select tenant...</option>
              {tenOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {tenancyInvoices.length > 0 && (
            <div className="form-group">
              <label className="label">Invoice to pay *</label>
              <select className="input" value={form.invoice_id} onChange={e=>onInvoiceChange(e.target.value)}>
                <option value="">Select invoice...</option>
                {invOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {form.tenancy_id && !tenancyInvoices.length && <p className="text-xs text-[--amber] bg-[--amber-bg] p-3 rounded-xl">No outstanding invoices for this tenant.</p>}
          <Select label="Payment method *" value={form.payment_method} onChange={v=>setForm(f=>({...f,payment_method:v}))} options={METHODS} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (KES) *" type="number" value={form.amount} onChange={setE('amount')} />
            {form.payment_method === 'mpesa' && <Input label="M-Pesa phone" value={form.mpesa_phone||''} onChange={setE('mpesa_phone')} placeholder="07XX XXX XXX" />}
          </div>
          {['mpesa','bank','cheque'].includes(form.payment_method) && (
            <Input label="Transaction / Reference code" value={form.transaction_code||''} onChange={setE('transaction_code')} placeholder="e.g. QK7Y3MPESA1" className="uppercase font-mono" />
          )}
          <Input label="Notes" value={form.notes||''} onChange={setE('notes')} placeholder="Optional notes..." />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Recording...':'Record payment'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
