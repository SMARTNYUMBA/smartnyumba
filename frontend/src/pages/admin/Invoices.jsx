// frontend/src/pages/admin/Invoices.jsx  — ENHANCED
// Additions:
//   • "Waive fee" button on penalty-type invoices
//   • "Send reminders" bulk SMS button in toolbar
//   • Filter by type

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Badge       from '../../components/ui/Badge';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import Confirm     from '../../components/ui/Confirm';
import ExportBar, { exportToCsv, exportToExcel } from '../../components/ui/ExportBar';
import api, { getInvoices, getProperties, getTenancies, createInvoice, generateBulkInvoices, recordPayment } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

const TYPES    = ['rent','deposit','water','electricity','service_charge','utility','penalty','other'].map(v=>({value:v,label:v.replace(/_/g,' ')}));
const STATUSES = [{value:'',label:'All statuses'},{value:'unpaid',label:'Unpaid'},{value:'partial',label:'Partial'},{value:'paid',label:'Paid'},{value:'overdue',label:'Overdue'}];
const TYPE_OPTS = [{value:'',label:'All types'},...TYPES];

const STATUS_COLOR = { paid:'badge-green', unpaid:'badge-amber', overdue:'badge-red', partial:'badge-purple' };

export default function Invoices() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page,    setPage]         = useState(1);
  const [filters, setFilters]     = useState({ status:'', property_id:'', type:'' });
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState({ tenancy_id:'', type:'rent', amount:'', due_date:'' });
  const [waiveTarget, setWaiveTarget] = useState(null);
  const [smsConfirm, setSmsConfirm]   = useState(false);
  const [busy, setBusy]           = useState(false);
  const [quickPay, setQuickPay]   = useState(null);
  const [payForm, setPayForm]     = useState({ payment_method:'mpesa', transaction_code:'', amount:'', notes:'' });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseModal, setReverseModal]   = useState(null);
  const [msgModal, setMsgModal]   = useState(false);
  const [msgForm, setMsgForm]     = useState({ channel:'notification', subject:'', message:'' });
  const PAY_METHODS = ['mpesa','bank','cash','cheque','other'].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}));
  const setF = k => v => setFilters(f => ({ ...f, [k]: v }));

  const { data: invoicesResp, isLoading } = useQuery({

    queryFn:  () => getInvoices({ ...filters, page, limit: 50 }).then(r => r.data),
    queryKey: ['invoices', filters, page],
  });
  const invoices    = invoicesResp?.invoices    || [];
  const meta        = invoicesResp?.pagination  || {};

  const { data: props }     = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: tenancies } = useQuery({ queryKey:['tenancies'],  queryFn: () => getTenancies().then(r=>r.data.tenancies) });

  const propOpts = [{value:'',label:'All properties'}, ...(props||[]).map(p=>({value:String(p.id),label:p.name}))];
  const tenOpts  = (tenancies||[]).filter(t=>t.status==='active').map(t=>({value:t.id,label:`${t.tenant_name} - ${t.unit_number} (${t.property_name})`}));

  const save = async () => {
    if (!form.tenancy_id||!form.type||!form.amount||!form.due_date) return toast.error('All fields required');
    setBusy(true);
    try {
      await createInvoice(form);
      toast.success('Invoice created!');
      qc.invalidateQueries(['invoices']);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const bulkGenerate = async () => {
    setBusy(true);
    try {
      const { data: r } = await generateBulkInvoices({ property_id: filters.property_id||undefined });
      toast.success(`${r.generated} invoices generated!`);
      qc.invalidateQueries(['invoices']);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const doWaiveFee = async () => {
    if (!waiveTarget) return;
    try {
      await api.post(`/invoices/${waiveTarget.id}/waive-fee`);
      toast.success('Late fee waived');
      qc.invalidateQueries(['invoices']);
      setWaiveTarget(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed to waive fee'); }
  };

  const sendBulkSms = async () => {
    setBusy(true);
    setSmsConfirm(false);
    try {
      const { data: r } = await api.post('/invoices/remind-bulk', {
        property_id: filters.property_id || undefined,
      });
      toast.success(`Sent ${r.sent} SMS reminders (${r.failed} failed)`);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const unpaidCount = (invoices).filter(i=>['unpaid','overdue','partial'].includes(i.status)).length;

  const exportData = () => exportToCsv(
    (invoices).map(i=>({ '#':i.id, Tenant:i.tenant_name, Unit:i.unit_number, Property:i.property_name,
      Type:i.type, Amount:i.amount, Balance:i.balance, 'Due date':fmtDate(i.due_date), Status:i.status,
      Receipt:i.receipt_number||'' })),
    `invoices-${new Date().toISOString().slice(0,10)}`);

  const cols = [
    { label:'#',       render: r => <span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"JetBrains Mono,monospace"}}>#{r.id}</span> },
    { label:'Tenant',  render: r => <div><p style={{fontWeight:600,fontSize:13}}>{r.tenant_name}</p><p style={{fontSize:11,color:"var(--text-muted)"}}>{r.unit_number} · {r.property_name}</p></div> },
    { label:'Type',    render: r => (
        <span className={`badge capitalize ${r.type==='penalty'?'badge-red':r.type==='rent'?'badge-blue':'badge-gray'}`}>
          {r.type.replace(/_/g,' ')}
        </span>
      )},
    { label:'Amount',  render: r => <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:13}}>{fmt(r.amount)}</span> },
    { label:'Balance', render: r => r.balance>0 ? <span style={{fontFamily:"Fraunces,serif",fontStyle:"italic",fontWeight:700,fontSize:14,color:"var(--red)"}}>{fmt(r.balance)}</span> : <span style={{fontSize:12,fontWeight:700,color:"var(--green)"}}>Paid ✓</span> },
    { label:'Due',     render: r => (
        <span className={`text-xs ${new Date(r.due_date)<new Date()&&r.status!=='paid'?'text-[--red] font-medium':'text-[--text-muted]'}`}>
          {fmtDate(r.due_date)}
        </span>
      )},
    { label:'Status',  render: r => <span className={`badge ${STATUS_COLOR[r.status]||'badge-gray'}`}>{r.status}</span> },
    { label:'',     render: r => (
        <div className="flex gap-1 items-center">
          <a href={`/api/pdf/invoice/${r.id}`} target="_blank" rel="noreferrer"
             className="btn-ghost btn-sm text-[--text-muted] hover:text-[--brand]" title="PDF"
             onClick={e=>e.stopPropagation()}>📄</a>
          {['unpaid','overdue','partial'].includes(r.status)&&(
            <button className="btn-ghost btn-sm text-[--green]" title="Record payment"
              onClick={e=>{e.stopPropagation();setQuickPay(r);setPayForm({payment_method:'mpesa',transaction_code:'',amount:String(r.balance||r.amount),notes:''});}}>
              💳 Pay
            </button>
          )}
          {!['cancelled','waived'].includes(r.status)&&(
            <button className="btn-ghost btn-sm text-red-400" title="Void"
              onClick={e=>{e.stopPropagation();setReverseTarget(r);setReverseReason('');setReverseModal('single');}}>🚫</button>
          )}
        </div>
      )},
  ];

  const doQuickPay = async () => {
    if (!payForm.amount) return toast.error('Amount required');
    setBusy(true);
    try {
      const { data: r } = await recordPayment({ invoice_id:quickPay.id, tenancy_id:quickPay.tenancy_id, amount:payForm.amount, payment_method:payForm.payment_method, transaction_code:payForm.transaction_code||undefined });
      toast.success('✅ Payment recorded! Receipt: '+r.receipt_number);
      qc.invalidateQueries(['invoices']); setQuickPay(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };
  const doReverseSingle = async () => {
    if (!reverseReason) return toast.error('Reason required');
    setBusy(true);
    try {
      await api.post('/invoices/reverse', { invoice_ids:[reverseTarget.id], reason:reverseReason });
      toast.success('Invoice voided'); qc.invalidateQueries(['invoices']); setReverseModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };
  const doSendMessage = async () => {
    if (!msgForm.message.trim()) return toast.error('Message required');
    setBusy(true);
    try {
      const { data: r } = await api.post('/invoices/message', { ...msgForm, property_id:filters.property_id||undefined });
      toast.success('Sent to '+r.sent+' tenant(s)'); setMsgModal(false);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };


  return (
    <AppLayout title="Invoices" actions={
      <div className="flex gap-2 flex-wrap">
        <ExportBar onCsv={exportData} onExcel={() => exportToExcel(exportData(), 'invoices')} />
        {unpaidCount > 0 && (
          <button className="btn-secondary btn-sm flex items-center gap-1.5" onClick={() => setSmsConfirm(true)} disabled={busy}>
            📱 Remind ({unpaidCount})
          </button>
        )}
        <button className="btn-secondary btn-sm" onClick={() => setModal('bulk')}>⚡ Bulk generate</button>
        <button className="btn-primary btn-sm" onClick={() => { setForm({tenancy_id:'',type:'rent',amount:'',due_date:''}); setModal('add'); }}>+ Create invoice</button>
      </div>
    }>

      <div style={{display:"flex",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
        <Select options={STATUSES}  value={filters.status}      onChange={v => setF('status')(v)}      className="w-36" />
        <Select options={TYPE_OPTS} value={filters.type}        onChange={v => setF('type')(v)}        className="w-36" />
        <Select options={propOpts}  value={filters.property_id} onChange={v => setF('property_id')(v)} className="w-52" />
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)"}}>
        <Table columns={cols} data={invoices||[]} loading={isLoading} />
      </div>

      {/* Create invoice modal */}
      <Modal open={modal==='add'} onClose={() => setModal(null)} title="Create invoice" size="md">
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label">Tenancy *</label>
            <select className="input" value={form.tenancy_id} onChange={e => {
              const tid = e.target.value;
              const ten = (tenancies||[]).find(t => String(t.id) === String(tid));
              setForm(f => ({ ...f, tenancy_id: tid, amount: f.type === 'rent' && ten?.rent_amount ? ten.rent_amount : f.amount }));
            }}>
              <option value="">Select tenancy...</option>
              {tenOpts.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type *</label>
              <select className="input" value={form.type} onChange={e => {
                const type = e.target.value;
                const ten = (tenancies||[]).find(t => String(t.id) === String(form.tenancy_id));
                setForm(f => ({ ...f, type, amount: type === 'rent' && ten?.rent_amount ? ten.rent_amount : f.amount }));
              }}>
                {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <Input label="Amount (KES) *" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} />
          </div>
          <Input label="Due date *" type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Creating...':'Create invoice'}</button>
        </div>
      </Modal>

      {/* Bulk generate modal */}
      <Modal open={modal==='bulk'} onClose={() => setModal(null)} title="Bulk generate rent invoices" size="sm">
        <div className="p-5">
          <p className="text-sm text-[--text-secondary]">
            This will generate this month's rent invoice for all active tenancies that don't have one yet.
            {filters.property_id ? ` Filtered to selected property.` : ` All properties.`}
          </p>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={bulkGenerate} disabled={busy}>{busy?'Generating...':'Generate now'}</button>
        </div>
      </Modal>

      {/* Waive fee confirm */}
      <Confirm open={!!waiveTarget} onClose={() => setWaiveTarget(null)}
        title="Waive late fee" danger
        message={`Waive the KES ${fmt(waiveTarget?.amount)} late fee for ${waiveTarget?.tenant_name}? This cannot be undone.`}
        onConfirm={doWaiveFee} />

      {/* Bulk SMS confirm */}
      <Modal open={smsConfirm} onClose={() => setSmsConfirm(false)} title="Send bulk SMS reminders" size="sm">
        <div className="p-5">
          <p className="text-sm text-[--text-secondary]">
            Send a personalised SMS reminder to all <strong>{unpaidCount}</strong> tenants with unpaid or overdue invoices?
            {filters.property_id ? ' (Current property only.)' : ' (All properties.)'}
          </p>
          <div className="mt-3 p-3 bg-[--surface-muted] rounded-xl text-xs text-[--text-muted]">
            Each message will include the tenant's name, unit number, balance, and due date. Messages are logged in the SMS log.
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setSmsConfirm(false)}>Cancel</button>
          <button className="btn-primary" onClick={sendBulkSms} disabled={busy}>{busy?'Sending...':'Send reminders'}</button>
        </div>
      </Modal>
      {/* Pagination */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="btn-secondary btn-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-[--text-muted]">Page {meta.page} of {meta.pages} ({meta.total} total)</span>
          <button disabled={page>=meta.pages} onClick={()=>setPage(p=>p+1)} className="btn-secondary btn-sm disabled:opacity-40">Next →</button>
        </div>
      )}
      {/* Quick-pay modal */}
      {quickPay&&<Modal open={!!quickPay} onClose={()=>setQuickPay(null)} title={`Record payment — #${quickPay?.id}`} size="sm">
        <div className="p-5 flex flex-col gap-3">
          <div className="bg-[--surface-muted] rounded-xl p-3 text-sm">
            <p className="font-medium">{quickPay.tenant_name} · {quickPay.unit_number}</p>
            <p className="text-[--text-muted]">Balance: <span className="font-bold text-[--red]">{fmt(quickPay.balance||quickPay.amount)}</span></p>
          </div>
          <div><label className="label">Method *</label>
            <select className="input" value={payForm.payment_method} onChange={e=>setPayForm(f=>({...f,payment_method:e.target.value}))}>
              {PAY_METHODS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <Input label="Amount (KES) *" type="number" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} />
          {['mpesa','bank','cheque'].includes(payForm.payment_method)&&(
            <Input label="Ref code" value={payForm.transaction_code} onChange={e=>setPayForm(f=>({...f,transaction_code:e.target.value.toUpperCase()}))} />
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setQuickPay(null)}>Cancel</button>
          <button className="btn-primary" onClick={doQuickPay} disabled={busy}>{busy?'Recording…':'Record payment'}</button>
        </div>
      </Modal>}

      {/* Void modal */}
      {reverseModal&&<Modal open={!!reverseModal} onClose={()=>setReverseModal(null)} title="Void invoice" size="sm">
        <div className="p-5 flex flex-col gap-3">
          {reverseTarget&&<div className="bg-[--surface-muted] rounded-xl p-3 text-sm">
            <p className="font-medium">{reverseTarget.tenant_name} — {fmt(reverseTarget.amount)}</p>
          </div>}
          <Input label="Reason *" value={reverseReason} onChange={e=>setReverseReason(e.target.value)} placeholder="e.g. Data entry error" />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setReverseModal(null)}>Cancel</button>
          <button className="btn-danger" onClick={doReverseSingle} disabled={busy||!reverseReason}>{busy?'Voiding…':'Void invoice'}</button>
        </div>
      </Modal>}

      {/* Message modal */}
      <Modal open={msgModal} onClose={()=>setMsgModal(false)} title="Message tenants" size="md">
        <div className="p-5 flex flex-col gap-3">
          <div><label className="label">Channel</label>
            <select className="input" value={msgForm.channel} onChange={e=>setMsgForm(f=>({...f,channel:e.target.value}))}>
              <option value="notification">In-app notification</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">SMS + Email</option>
            </select>
          </div>
          {['email','both'].includes(msgForm.channel)&&<input className="input" placeholder="Subject" value={msgForm.subject||''} onChange={e=>setMsgForm(f=>({...f,subject:e.target.value}))} />}
          <div><label className="label">Message *</label>
            <textarea className="input" rows={4} value={msgForm.message} onChange={e=>setMsgForm(f=>({...f,message:e.target.value}))} placeholder="Type your message..." />
          </div>
          <p className="text-xs text-[--text-muted]">{filters.property_id?'Sending to tenants in selected property.':'Sending to ALL active tenants.'}</p>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setMsgModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={doSendMessage} disabled={busy||!msgForm.message.trim()}>{busy?'Sending…':'Send message'}</button>
        </div>
      </Modal>

    </AppLayout>
  );
}
