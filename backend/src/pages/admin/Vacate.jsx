// frontend/src/pages/admin/Vacate.jsx  — ENHANCED WITH DEPOSIT REFUND
// Additions:
//   • "Process deposit refund" button on each vacate notice
//   • Deposit refund modal: shows gross deposit, itemised deductions, net refund
//   • "Mark as paid" to close out the refund

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import Badge       from '../../components/ui/Badge';
import api, { getVacateNotices, createVacateNotice, updateVacateNotice, getProperties, getTenancies } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

const REASONS = ['end_of_lease','personal_reasons','relocation','financial','property_sale','eviction','other']
  .map(v=>({value:v,label:v.replace(/_/g,' ')}));

const DEDUCTION_CATS = [
  'Cleaning fee','Damage repairs','Unpaid rent','Unpaid utilities',
  'Key replacement','Lost/damaged property','Other',
];

export default function Vacate() {
  const qc = useQueryClient();
  const [filters, setFilters]           = useState({ property_id:'', status:'' });
  const [modal, setModal]               = useState(null);
  const [form, setForm]                 = useState({ tenancy_id:'', vacate_date:'', reason:'end_of_lease', notes:'' });
  const [depositModal, setDepositModal] = useState(null); // tenancy data
  const [depositSummary, setDepositSummary] = useState(null);
  const [deductions, setDeductions]     = useState([]);
  const [depositNotes, setDepositNotes] = useState('');
  const [busy, setBusy]                 = useState(false);
  const setE = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const { data, isLoading } = useQuery({ queryKey:['vacate',filters], queryFn: () => getVacateNotices(filters).then(r=>r.data.notices) });
  const { data: props }     = useQuery({ queryKey:['properties'],     queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: tenancies } = useQuery({ queryKey:['tenancies-active'], queryFn: () => getTenancies({status:'active'}).then(r=>r.data.tenancies) });

  const tenOpts = (tenancies||[]).map(t=>({value:t.id,label:`${t.tenant_name} - ${t.unit_number} (${t.property_name})`}));

  const save = async () => {
    if (!form.tenancy_id||!form.vacate_date) return toast.error('Tenancy and vacate date required');
    setBusy(true);
    try {
      await createVacateNotice(form);
      toast.success('Vacate notice created!');
      qc.invalidateQueries(['vacate']);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const openDepositModal = async (row) => {
    try {
      const { data: ds } = await api.get(`/tenancies/${row.tenancy_id}/deposit-summary`);
      setDepositSummary(ds);
      setDepositModal(row);
      setDeductions([]);
      setDepositNotes('');
    } catch (e) { toast.error('Could not load deposit details'); }
  };

  const addDeduction = () => setDeductions(d => [...d, { description: '', amount: '' }]);
  const removeDeduction = i => setDeductions(d => d.filter((_,idx) => idx !== i));
  const setDed = (i, k, v) => setDeductions(d => d.map((item, idx) => idx===i ? {...item,[k]:v} : item));

  const totalDeductions = deductions.reduce((s,d) => s + (parseFloat(d.amount)||0), 0);
  const netRefund = Math.max(0, (depositSummary?.deposit_held||0) - totalDeductions);

  const processRefund = async () => {
    setBusy(true);
    try {
      await api.post(`/tenancies/${depositModal.tenancy_id}/deposit-refund`, {
        deductions: deductions.filter(d => d.description && d.amount > 0),
        notes: depositNotes,
      });
      toast.success(`Deposit refund of ${fmt(netRefund)} processed!`);
      qc.invalidateQueries(['vacate']);
      setDepositModal(null);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const markStatus = async (id, status) => {
    try {
      let notes = null;
      if (status === 'approved') {
        notes = prompt('Add approval notes (optional):') || null;
      } else if (status === 'rejected') {
        notes = prompt('Reason for rejection:') || null;
      }
      await updateVacateNotice(id, { status, notes });
      toast.success(`Updated to ${status}`);
      qc.invalidateQueries(['vacate']);
    } catch { toast.error('Failed'); }
  };

  const daysLeft = (d) => Math.ceil((new Date(d)-new Date())/(1000*60*60*24));

  const cols = [
    { label:'Tenant',      render: r => <div><p className="font-medium">{r.tenant_name}</p><p className="text-xs text-[--text-muted]">{r.unit_number} · {r.property_name}</p></div> },
    { label:'Vacate date', render: r => (
        <div>
          <p>{fmtDate(r.vacate_date)}</p>
          <p className={`text-xs ${daysLeft(r.vacate_date)<=7?'text-[--red]':daysLeft(r.vacate_date)<=30?'text-[--amber]':'text-[--text-muted]'}`}>
            {daysLeft(r.vacate_date) > 0 ? `${daysLeft(r.vacate_date)} days left` : 'Past due'}
          </p>
        </div>
      )},
    { label:'Reason',      render: r => <span className="text-xs capitalize text-[--text-muted]">{r.reason?.replace(/_/g,' ')}</span> },
    { label:'Status',      render: r => <span className={`badge ${r.status==='approved'?'badge-green':r.status==='pending'?'badge-amber':r.status==='processed'?'badge-blue':'badge-gray'}`}>{r.status}</span> },
    { label:'Acknowledged', render: r => r.acknowledged_at ? <span className="text-xs text-[--text-muted]">{new Date(r.acknowledged_at).toLocaleDateString('en-KE')}</span> : <span className="text-xs text-[--text-muted]">—</span> },
    { label:'Notes',        render: r => r.notes ? <span className="text-xs text-[--text-muted]" title={r.notes}>{r.notes.length > 30 ? r.notes.slice(0,30)+'…' : r.notes}</span> : null },
    { label:'', render: r => (
      <div className="flex gap-1 flex-wrap justify-end">
        {r.status === 'pending' && (
          <button className="btn-ghost btn-sm text-[--green]" onClick={e=>{e.stopPropagation();markStatus(r.id,'approved');}}>
            Approve
          </button>
        )}
        {(r.status === 'approved' || r.status === 'pending') && !r.deposit_refund_id && (
          <button className="btn-ghost btn-sm text-[--brand]" onClick={e=>{e.stopPropagation();openDepositModal(r);}}>
            💰 Deposit refund
          </button>
        )}
        {r.deposit_refund_id && (
          <span className="text-xs text-[--green]">✓ Refund processed</span>
        )}
      </div>
    )},
  ];

  return (
    <AppLayout title="Vacate notices" actions={
      <div className="flex gap-2">
        <select className="input w-auto" value={filters.property_id} onChange={e=>setFilters(f=>({...f,property_id:e.target.value}))}>
          <option value="">All properties</option>
          {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-primary btn-sm" onClick={() => { setForm({tenancy_id:'',vacate_date:'',reason:'end_of_lease',notes:''}); setModal('add'); }}>
          + New notice
        </button>
      </div>
    }>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={data||[]} loading={isLoading} />
      </div>

      {/* Create vacate notice modal */}
      <Modal open={modal==='add'} onClose={() => setModal(null)} title="Create vacate notice" size="md">
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label">Tenancy *</label>
            <select className="input" value={form.tenancy_id} onChange={setE('tenancy_id')}>
              <option value="">Select tenancy...</option>
              {tenOpts.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <Input label="Vacate date *" type="date" value={form.vacate_date} onChange={setE('vacate_date')} />
          <div>
            <label className="label">Reason</label>
            <select className="input" value={form.reason} onChange={setE('reason')}>
              {REASONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={setE('notes')} rows={2} />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Creating...':'Create notice'}</button>
        </div>
      </Modal>

      {/* Deposit refund modal */}
      {depositModal && depositSummary && (
        <Modal open={!!depositModal} onClose={() => setDepositModal(null)} title="Process deposit refund" size="lg">
          <div className="p-5 flex flex-col gap-4">
            {/* Summary */}
            <div className="p-4 bg-[--brand-light] rounded-xl">
              <p className="font-semibold text-[--text-primary]">{depositModal.tenant_name}</p>
              <p className="text-sm text-[--text-muted]">{depositModal.unit_number} · {depositModal.property_name}</p>
              <div className="flex gap-6 mt-2 text-sm">
                <div><span className="text-[--text-muted]">Deposit held:</span> <span className="font-bold text-[--text-primary]">{fmt(depositSummary.deposit_held)}</span></div>
                <div><span className="text-[--text-muted]">Total paid:</span> <span className="text-[--green]">{fmt(depositSummary.total_paid)}</span></div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="label mb-0">Deductions</label>
                <button className="btn-secondary btn-sm" onClick={addDeduction}>+ Add deduction</button>
              </div>
              {deductions.length === 0
                ? <p className="text-xs text-[--text-muted] italic">No deductions — full deposit will be refunded</p>
                : <div className="space-y-2">
                    {deductions.map((d,i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <select className="input flex-1 text-sm" value={d.description}
                          onChange={e=>setDed(i,'description',e.target.value)}>
                          <option value="">Select category...</option>
                          {DEDUCTION_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                        <input className="input w-32 text-sm" type="number" placeholder="Amount"
                          value={d.amount} onChange={e=>setDed(i,'amount',e.target.value)} />
                        <button className="text-red-400 hover:text-[--red] p-2" onClick={() => removeDeduction(i)}>✕</button>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Net refund summary */}
            <div className={`p-4 rounded-xl border-2 ${netRefund > 0 ? 'border-[--green-bg] bg-[--green-bg]' : 'border-[--border] bg-[--surface-muted]'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-[--text-primary]">Deposit: {fmt(depositSummary.deposit_held)}</p>
                  <p className="text-sm text-[--red]">Deductions: −{fmt(totalDeductions)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[--text-muted]">Net refund to tenant</p>
                  <p className={`text-2xl font-bold ${netRefund>0?'text-[--green]':'text-[--text-muted]'}`}>{fmt(netRefund)}</p>
                </div>
              </div>
            </div>

            <Textarea label="Notes (optional)" value={depositNotes} onChange={e=>setDepositNotes(e.target.value)} rows={2}
              placeholder="e.g. Bathroom tiles cracked, cleaning required..." />
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={() => setDepositModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={processRefund} disabled={busy}>
              {busy ? 'Processing...' : `Process refund of ${fmt(netRefund)}`}
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}
