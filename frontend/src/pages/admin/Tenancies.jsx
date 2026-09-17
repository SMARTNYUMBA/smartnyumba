import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getTenancies, createTenancy, updateTenancy, getTenants, getUnits, getProperties } from '../../api';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import { Table }   from '../../components/ui/Table';
import Badge       from '../../components/ui/Badge';
import Confirm     from '../../components/ui/Confirm';
import ExportBar, { exportToCsv } from '../../components/ui/ExportBar';
import { fmt, fmtDate } from '../../utils/helpers';

const STATUS_OPTS = [
  {value:'',label:'All statuses'},{value:'active',label:'Active'},
  {value:'terminated',label:'Terminated'},{value:'vacating',label:'Vacating (notice given)'},
  {value:'expired',label:'Expired'},{value:'pending',label:'Pending'},
];

const DEFAULT_CHECKLIST = [
  {item:'Keys handed over',done:false},{item:'Meter readings recorded',done:false},
  {item:'Unit inspection done',done:false},{item:'Lease agreement signed',done:false},
  {item:'Deposit received',done:false},{item:'Tenant onboarding done',done:false},
];

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / (1000*60*60*24));
}

function ExpiryBadge({ end_date }) {
  if (!end_date) return <span className="text-xs text-[--text-muted]">No end date</span>;
  const days = daysUntil(end_date);
  if (days < 0)   return <span className="badge badge-red">Expired</span>;
  if (days <= 7)  return <span className="badge badge-red">{days}d left ⚠️</span>;
  if (days <= 30) return <span className="badge badge-amber">{days}d left</span>;
  if (days <= 60) return <span className="badge badge-purple">{days}d left</span>;
  return <span className="text-xs text-[--text-muted]">{fmtDate(end_date)}</span>;
}

function emptyForm() {
  return {
    tenant_id: '',
    unit_property_id: '',
    unit_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '', rent_amount: '', deposit: '', deposit_paid: '',
    payment_plan: 'monthly', grace_period_days: '', penalty_rate: '',
  };
}

export default function Tenancies() {
  const qc = useQueryClient();
  const [filters,     setFilters]     = useState({ status:'active', property_id:'' });
  const [activeTab,   setActiveTab]   = useState('all');
  const [page,  setPage]  = useState(1);
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState(emptyForm());
  const [renewForm,   setRenewForm]   = useState({ new_end_date:'', new_rent_amount:'', notes:'' });
  const [renewTarget, setRenewTarget] = useState(null);
  const [checklist,   setChecklist]   = useState(DEFAULT_CHECKLIST);
  const [leaseModal,  setLeaseModal]  = useState(null);
  const [leaseFile,   setLeaseFile]   = useState(null);
  const [confirm,     setConfirm]     = useState(null);
  const [busy,        setBusy]        = useState(false);
  // #1 — Deposit refund
  const [depositTarget, setDepositTarget] = useState(null);
  const [depositSummary, setDepositSummary] = useState(null);
  const [deductions, setDeductions] = useState([{ description:'', amount:'' }]);
  const [depositNotes, setDepositNotes] = useState('');
  const [billingBusy, setBillingBusy] = useState(null);
  const [billingInfoModal, setBillingInfoModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferOpts,   setTransferOpts]   = useState({ vacant_units:[] });
  const [transferForm,   setTransferForm]   = useState({ new_unit_id:'', new_rent_amount:'', transfer_date:new Date().toISOString().split('T')[0], reason:'', carry_balance:true });

  const setF = k => v => setFilters(f => ({ ...f, [k]: v }));
  const setE = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setR = k => e => setRenewForm(f => ({ ...f, [k]: e.target.value }));

  // #1 — Open deposit refund modal and fetch summary
  const openDepositRefund = async (tenancy) => {
    setDepositTarget(tenancy);
    setDeductions([{ description:'', amount:'' }]);
    setDepositNotes('');
    try {
      const { data } = await api.get(`/tenancies/${tenancy.id}/deposit-summary`);
      setDepositSummary(data);
    } catch { setDepositSummary({ deposit_held: tenancy.deposit || 0, refund_record: null }); }
    setModal('deposit');
  };

  const submitDepositRefund = async () => {
    const validDeds = deductions.filter(d => d.description && d.amount > 0);
    setBusy(true);
    try {
      await api.post(`/tenancies/${depositTarget.id}/deposit-refund`, {
        deductions: validDeds,
        notes: depositNotes,
      });
      toast.success('Deposit refund created and tenant notified');
      setModal(null);
      qc.invalidateQueries(['tenancies']);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to process refund'); }
    finally { setBusy(false); }
  };

  const { data: tenanciesResp, isLoading } = useQuery({ queryKey: ['tenancies', filters, page], queryFn: () => getTenancies({ ...filters, page, limit: 25 }).then(r => r.data) });
  const tenanciesList = tenanciesResp?.tenancies   || [];
  const tenPagination = tenanciesResp?.pagination  || {};
  const { data: expiringData } = useQuery({ queryKey:['tenancies-expiring'], queryFn: () => api.get('/tenancies/expiring?days=60').then(r=>r.data.tenancies).catch(()=>[]) });
  const { data: props }        = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const { data: tenants }      = useQuery({ queryKey:['tenants-all'], queryFn: () => getTenants().then(r=>r.data.tenants) });
  const { data: allUnits }     = useQuery({ queryKey:['units-vacant'], queryFn: () => getUnits({status:'vacant'}).then(r=>r.data.units) });

  const propOpts = [{value:'',label:'All properties'}, ...(props||[]).map(p=>({value:String(p.id),label:p.name}))];

  // ── Filter vacant units by property chosen in the form ──────
  const filteredVacantUnits = useMemo(() =>
    (allUnits||[]).filter(u =>
      !form.unit_property_id || String(u.property_id) === String(form.unit_property_id)
    ), [allUnits, form.unit_property_id]);

  // Selected tenant — show warning if already has active tenancy
  const selectedTenant = useMemo(() =>
    (tenants||[]).find(t => String(t.tenant_id || t.id) === String(form.tenant_id)),
    [tenants, form.tenant_id]);

  const openCreate = () => {
    setForm(emptyForm());
    setChecklist(DEFAULT_CHECKLIST);
    setModal('add');
  };

  const save = async () => {
    if (!form.tenant_id)  return toast.error('Please select a tenant');
    if (!form.unit_id)    return toast.error('Please select a unit');
    if (!form.rent_amount) return toast.error('Rent amount is required');

    // Hard block: do not allow creating a tenancy for a tenant who already has one
    // The admin must terminate the existing one first
    if (selectedTenant?.tenancy_status === 'active') {
      const confirm = window.confirm(
        `⚠️ WARNING: ${selectedTenant.full_name} already has an active tenancy on unit ${selectedTenant.unit_number||''}.

` +
        `Creating another tenancy will cause duplicates.

` +
        `Are you absolutely sure you want to proceed?
` +
        `(Click Cancel and terminate the existing tenancy first.)`
      );
      if (!confirm) return;
    }

    // Strip the "|rent" suffix if present
    const realUnitId = String(form.unit_id).includes('|') ? String(form.unit_id).split('|')[0] : form.unit_id;

    setBusy(true);
    try {
      await createTenancy({
        tenant_id:         String(form.tenant_id),
        unit_id:           realUnitId,
        allow_duplicate:   selectedTenant?.tenancy_status === 'active' ? true : undefined,
        start_date:        form.start_date,
        end_date:          form.end_date || undefined,
        rent_amount:       form.rent_amount,
        deposit:           form.deposit || 0,
        payment_plan:      form.payment_plan,
        grace_period_days: form.grace_period_days || undefined,
        penalty_rate:      form.penalty_rate || undefined,
        move_in_checklist: checklist,
      });
      toast.success('Tenancy created!');
      qc.invalidateQueries(['tenancies']);
      qc.invalidateQueries(['units-vacant']);
      qc.invalidateQueries(['tenants-all']);
      setModal(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create tenancy');
    } finally {
      setBusy(false);
    }
  };

  const doRenew = async () => {
    if (!renewForm.new_end_date) return toast.error('New end date required');
    setBusy(true);
    try {
      await api.put(`/tenancies/${renewTarget.id}/renew`, renewForm);
      toast.success('Lease renewed!');
      qc.invalidateQueries(['tenancies']); qc.invalidateQueries(['tenancies-expiring']);
      setRenewTarget(null); setModal(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const downloadLease = (tenancyId, tenantName, unitNum) => {
    api.get(`/pdf/lease/${tenancyId}`, { responseType: 'blob' })
      .then(res => {
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url; a.download = `Lease-${unitNum}-${tenantName}.pdf`; a.click();
        URL.revokeObjectURL(url);
      }).catch(() => toast.error('Failed to download lease'));
  };

  const terminate = async (id) => {
    try {
      await updateTenancy(id, { status:'terminated' });
      toast.success('Tenancy terminated');
      qc.invalidateQueries(['tenancies']);
      setConfirm(null);
    } catch { toast.error('Failed'); }
  };

  const uploadLease = async () => {
    if (!leaseFile) return toast.error('Select a file');
    const fd = new FormData(); fd.append('lease', leaseFile);
    try {
      await api.put(`/tenancies/${leaseModal.id}/lease`, fd, { headers:{'Content-Type':'multipart/form-data'} });
      toast.success('Lease uploaded!');
      qc.invalidateQueries(['tenancies']);
      setLeaseModal(null);
    } catch { toast.error('Upload failed'); }
  };

  const exportData = () => exportToCsv(
    (data||[]).map(t=>({ Tenant:t.tenant_name, Phone:t.tenant_phone, Unit:t.unit_number, Property:t.property_name, Rent:t.rent_amount, Start:fmtDate(t.start_date), End:t.end_date?fmtDate(t.end_date):'', Status:t.status })),
    'tenancies');

  const cols = [
    { label:'Tenant', render: r => (
      <div>
        <p className="font-medium">{r.tenant_name}</p>
        <p className="text-xs text-[--text-muted]">{r.unit_number} · {r.property_name}</p>
      </div>
    )},
    { label:'Rent',     render: r => <span className="text-[--green] font-medium">{fmt(r.rent_amount)}/mo</span> },
    { label:'Start',    render: r => fmtDate(r.start_date) },
    { label:'End date', render: r => <ExpiryBadge end_date={r.end_date} /> },
    { label:'Deposit',  render: r => fmt(r.deposit||0) },
    { label:'Last paid', render: r => {
        if (!r.last_payment_date) return <span className="text-xs text-red-400 font-medium">Never</span>;
        const days=Math.floor((Date.now()-new Date(r.last_payment_date))/86400000);
        const col=days<=35?'text-[--green]':days<=65?'text-[--amber]':'text-[--red]';
        return <span className={`text-xs font-medium ${col}`}>{days===0?'Today':`${days}d ago`}</span>;
      }},
    { label:'Status',   render: r => <Badge status={r.status} label={r.status} /> },
    
    { label:'Billing', render: r => (
        <button
          title={`Billing: ${r.billing_mode||'auto'} — click to toggle`}
          onClick={e=>{e.stopPropagation();toggleBillingMode(r);}}
          disabled={billingBusy===r.id}
          className={`text-xs font-semibold px-2 py-1 rounded-lg border transition ${
            r.billing_mode==='manual'
              ? 'bg-[--amber-bg] text-amber-700 border-[--amber-bg]'
              : 'bg-[--green-bg] text-green-700 border-[--green-bg]'
          }`}>
          {billingBusy===r.id ? '⏳' : r.billing_mode==='manual' ? '📋 Manual' : '🔄 Auto'}
        </button>
      )},
    { label:'', render: r => (
      <div className="flex gap-2 items-center flex-wrap">
        <button className="text-purple-600 text-sm hover:underline font-medium" onClick={e=>{e.stopPropagation();openTransfer(r);}}>🔀 Transfer</button>
        <button className="text-[--brand] text-sm hover:underline" onClick={e=>{e.stopPropagation();setRenewTarget(r);setRenewForm({new_end_date:'',new_rent_amount:'',notes:''});setModal('renew');}}>Renew</button>
        <button className="text-[--text-muted] text-sm hover:underline" onClick={e=>{e.stopPropagation();setLeaseModal(r);setLeaseFile(null);}}>📎 Upload</button>
        {r.lease_document && <a href={r.lease_document} target="_blank" rel="noreferrer" className="text-xs text-[--text-muted] hover:underline" onClick={e=>e.stopPropagation()}>View</a>}
        <button className="text-[--brand] text-sm hover:underline mr-2" onClick={e=>{e.stopPropagation();downloadLease(r.id,r.tenant_name,r.unit_number);}}>📄 Lease</button>
        {(r.status==='terminated'||r.status==='vacating') && (
          <button className="text-teal-600 text-sm hover:underline" onClick={e=>{e.stopPropagation();openDepositRefund(r);}}>💰 Refund</button>
        )}
        <button className="text-[--red] text-sm hover:underline" onClick={e=>{e.stopPropagation();setConfirm(r);}}>Terminate</button>
      </div>
    )},
  ];

  const displayData = activeTab === 'expiring' ? (expiringData||[]) : tenanciesList;

  const toggleBillingMode = async (t) => {
    const next = t.billing_mode === 'manual' ? 'auto' : 'manual';
    setBillingBusy(t.id);
    try {
      await api.patch(`/tenancies/${t.id}/billing-mode`, { billing_mode: next });
      toast.success(`Billing set to ${next} for ${t.tenant_name}`);
      qc.invalidateQueries(['tenancies']);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBillingBusy(null); }
  };


  const openTransfer = async (t) => {
    setTransferTarget(t);
    setTransferForm({ new_unit_id:'', new_rent_amount:'', transfer_date:new Date().toISOString().split('T')[0], reason:'', carry_balance:true });
    try {
      // Use dedicated endpoint — returns current tenancy + ALL vacant units grouped by property
      const { data: r } = await api.get(`/tenancies/${t.id}/transfer-options`);
      setTransferOpts({ vacant_units: r.vacant_units||[], tenancy: r.tenancy });
    } catch {
      // Fallback: generic vacant units
      try {
        const { data: r } = await api.get('/units', { params: { status:'vacant' } });
        setTransferOpts({ vacant_units: r.units||[], tenancy: t });
      } catch { setTransferOpts({ vacant_units:[], tenancy: t }); }
    }
    setModal('transfer');
  };
  const submitTransfer = async () => {
    if (!transferForm.new_unit_id) return toast.error('Select a destination unit');
    setBusy(true);
    try {
      await api.post(`/tenancies/${transferTarget.id}/transfer`, transferForm);
      toast.success('Tenant transferred!');
      qc.invalidateQueries(['tenancies']); setModal(null); setTransferTarget(null);
    } catch(e) { toast.error(e.response?.data?.error||'Transfer failed'); }
    finally { setBusy(false); }
  };


  return (
    <AppLayout title="Tenancies" actions={
      <div className="flex gap-2">
        <ExportBar onCsv={exportData} />
        <button className="btn-ghost btn-sm text-[--text-muted]" onClick={()=>setBillingInfoModal(true)} title="About billing modes">ℹ️ Billing modes</button>
        <button className="btn-primary btn-sm" onClick={openCreate}>+ New tenancy</button>
      </div>
    }>
      {/* Tabs */}
      <div className="flex gap-1 bg-[--surface-muted] p-1 rounded-xl mb-4 w-fit">
        <button onClick={()=>setActiveTab('all')} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab==='all'?'bg-[--surface] shadow':'text-[--text-muted]'}`}>All tenancies</button>
        <button onClick={()=>setActiveTab('expiring')} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab==='expiring'?'bg-[--surface] shadow':'text-[--text-muted]'}`}>
          Expiring soon {(expiringData||[]).length > 0 && <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 rounded-full">{(expiringData||[]).length}</span>}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="input w-36 text-sm" value={filters.status} onChange={e=>setF('status')(e.target.value)}>
          {STATUS_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input w-48 text-sm" value={filters.property_id} onChange={e=>setF('property_id')(e.target.value)}>
          {propOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={displayData} loading={isLoading} emptyMsg="No tenancies found" />
      </div>

      {/* ── CREATE TENANCY MODAL ── */}
      <Modal open={modal==='add'} onClose={()=>{ setModal(null); setForm(emptyForm()); }} title="New tenancy" size="lg">
        <div className="p-5 flex flex-col gap-4">

          {/* STEP 1: Select tenant */}
          <div>
            <label className="label">Tenant *</label>
            <select className="input" value={String(form.tenant_id)}
              onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
              <option value="">— Select tenant —</option>
              {(tenants||[]).map(t => (
                <option key={t.tenant_id || t.id} value={String(t.tenant_id || t.id)}>
                  {t.full_name} ({t.email || t.phone})
                  {t.tenancy_status === 'active' ? ' ⚠ already has active tenancy' : ''}
                </option>
              ))}
            </select>
            {selectedTenant?.tenancy_status === 'active' && (
              <div className="mt-2 p-3 bg-[--amber-bg] border border-[--amber-bg] rounded-xl">
                <p className="text-amber-700 text-xs font-medium">
                  ⚠ <strong>{selectedTenant.full_name}</strong> already has an active tenancy
                  {selectedTenant.unit_number ? ` on unit ${selectedTenant.unit_number}` : ''}. 
                  Creating another will result in duplicate tenancies. Are you sure?
                </p>
              </div>
            )}
          </div>

          {/* STEP 2: Filter units by property first */}
          <div>
            <label className="label">Filter by property (optional)</label>
            <select className="input" value={form.unit_property_id}
              onChange={e => setForm(f => ({ ...f, unit_property_id: e.target.value, unit_id: '', rent_amount: '' }))}>
              <option value="">— All properties —</option>
              {(props||[]).map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>

          {/* STEP 3: Select vacant unit (filtered) */}
          <div>
            <label className="label">
              Unit *
              <span className="text-xs font-normal text-[--text-muted] ml-2">
                ({filteredVacantUnits.length} vacant{form.unit_property_id ? ' in this property' : ''})
              </span>
            </label>
            <select className="input" value={form.unit_id}
              onChange={e => {
                const val = e.target.value;
                const parts = val.split('|');
                setForm(f => ({ ...f, unit_id: val, rent_amount: parts[1] || f.rent_amount }));
              }}>
              <option value="">— Select vacant unit —</option>
              {filteredVacantUnits.map(u => (
                <option key={u.id} value={`${u.id}|${u.rent_amount}`}>
                  {u.unit_number} — {u.property_name} — KES {Number(u.rent_amount).toLocaleString()}
                </option>
              ))}
            </select>
            {form.unit_property_id && filteredVacantUnits.length === 0 && (
              <p className="text-[--amber] text-xs mt-1">⚠ No vacant units in this property</p>
            )}
          </div>

          {/* STEP 4: Dates and amounts */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start date *"        type="date"   value={form.start_date}   onChange={setE('start_date')} />
            <Input label="End date (optional)" type="date"   value={form.end_date}     onChange={setE('end_date')} />
            <Input label="Rent (KES) *"        type="number" value={form.rent_amount}  onChange={setE('rent_amount')} />
            <Input label="Deposit (KES)"       type="number" value={form.deposit}      onChange={setE('deposit')} />
          </div>

          {/* Move-in checklist */}
          <div className="p-4 bg-[--surface-muted] rounded-xl">
            <p className="text-xs font-semibold text-[--text-secondary] uppercase tracking-wide mb-2">Move-in checklist</p>
            <div className="space-y-2">
              {checklist.map((item, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={item.done}
                    onChange={e => setChecklist(c => c.map((ci,idx) => idx===i ? {...ci,done:e.target.checked} : ci))}
                    className="rounded" />
                  <span className="text-sm text-[--text-secondary]">{item.item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>{ setModal(null); setForm(emptyForm()); }}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Creating...':'Create tenancy'}</button>
        </div>
      </Modal>

      {/* ── RENEW MODAL ── */}
      {renewTarget && (
        <Modal open={modal==='renew'} onClose={()=>setModal(null)} title={`Renew — ${renewTarget.tenant_name}`} size="sm">
          <div className="p-5 flex flex-col gap-3">
            <Input label="New end date *" type="date" value={renewForm.new_end_date} onChange={setR('new_end_date')} min={new Date().toISOString().split('T')[0]} />
            <Input label="New rent amount (optional)" type="number" value={renewForm.new_rent_amount} onChange={setR('new_rent_amount')} placeholder={`Current: KES ${Number(renewTarget.rent_amount).toLocaleString()}`} />
            <div><label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} value={renewForm.notes} onChange={setR('notes')} placeholder="Any notes about the renewal..." />
            </div>
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={doRenew} disabled={busy}>{busy?'Renewing...':'Renew lease'}</button>
          </div>
        </Modal>
      )}

      {/* ── UPLOAD LEASE ── */}
      {leaseModal && (
        <Modal open={!!leaseModal} onClose={()=>setLeaseModal(null)} title="Upload lease document" size="sm">
          <div className="p-5">
            <p className="text-sm text-[--text-muted] mb-3">{leaseModal.tenant_name} · {leaseModal.unit_number}</p>
            <input type="file" accept=".pdf,.doc,.docx"
              onChange={e=>setLeaseFile(e.target.files[0])}
              className="block w-full text-sm text-[--text-muted] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[--brand-light] file:text-[--brand] cursor-pointer" />
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={()=>setLeaseModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={uploadLease} disabled={!leaseFile}>Upload</button>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} danger confirmLabel="Terminate" title="Terminate tenancy"
        message={`Terminate ${confirm?.tenant_name}'s tenancy at ${confirm?.unit_number}? The unit will be marked as vacant.`}
        onConfirm={()=>terminate(confirm?.id)} />

      {/* ── DEPOSIT REFUND MODAL ── */}
      {depositTarget && (
        <Modal open={modal==='deposit'} onClose={()=>setModal(null)}
          title={`Deposit Refund — ${depositTarget.tenant_name}`} size="md">
          <div className="p-5 flex flex-col gap-4">
            {/* Summary */}
            <div className="bg-teal-50 rounded-xl p-4 text-sm space-y-1">
              <p className="font-semibold text-teal-800">Deposit held</p>
              <p className="text-2xl font-bold text-teal-700">
                {fmt(depositSummary?.deposit_held || depositTarget.deposit || 0)}
              </p>
              <p className="text-teal-600 text-xs">{depositTarget.unit_number} · {depositTarget.property_name}</p>
              {depositSummary?.refund_record && (
                <p className="text-[--amber] text-xs mt-1">
                  ⚠️ A refund record already exists (status: {depositSummary.refund_record.status})
                </p>
              )}
            </div>

            {/* Deductions */}
            <div>
              <p className="label mb-2">Deductions (damage, cleaning, arrears, etc.)</p>
              <div className="space-y-2">
                {deductions.map((d, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input className="input flex-1" placeholder="Description"
                      value={d.description}
                      onChange={e => setDeductions(ds => ds.map((x,idx)=>idx===i?{...x,description:e.target.value}:x))} />
                    <input className="input w-28" type="number" placeholder="KES" min="0"
                      value={d.amount}
                      onChange={e => setDeductions(ds => ds.map((x,idx)=>idx===i?{...x,amount:e.target.value}:x))} />
                    {deductions.length > 1 && (
                      <button onClick={()=>setDeductions(ds=>ds.filter((_,idx)=>idx!==i))}
                        className="text-red-400 hover:text-[--red] text-lg">×</button>
                    )}
                  </div>
                ))}
                <button onClick={()=>setDeductions(ds=>[...ds,{description:'',amount:''}])}
                  className="text-[--brand] text-sm hover:underline">+ Add deduction</button>
              </div>
            </div>

            {/* Net refund preview */}
            {(() => {
              const held = Number(depositSummary?.deposit_held || depositTarget.deposit || 0);
              const totalDed = deductions.reduce((s,d)=>s+Number(d.amount||0),0);
              const net = Math.max(0, held - totalDed);
              return (
                <div className={`rounded-xl p-3 text-sm font-semibold ${net>0?'bg-[--green-bg] text-green-700':'bg-[--red-bg] text-red-700'}`}>
                  Net refund to tenant: {fmt(net)}
                  {totalDed > 0 && <span className="font-normal text-xs ml-2">(KES {totalDed.toLocaleString()} deducted)</span>}
                </div>
              );
            })()}

            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="input resize-none" rows={2} value={depositNotes}
                onChange={e=>setDepositNotes(e.target.value)}
                placeholder="e.g. Deducted KES 2,000 for broken window repair" />
            </div>
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={submitDepositRefund} disabled={busy||!!depositSummary?.refund_record}>
              {busy ? 'Processing…' : 'Process Refund'}
            </button>
          </div>
        </Modal>
      )}
      {tenPagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="btn-secondary btn-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-[--text-muted]">
            Page {tenPagination.page} of {tenPagination.pages} ({tenPagination.total} total)
          </span>
          <button disabled={page>=tenPagination.pages} onClick={()=>setPage(p=>p+1)} className="btn-secondary btn-sm disabled:opacity-40">Next →</button>
        </div>
      )}
      {/* ── Transfer Tenant Modal ─────────────────────────────── */}
      <Modal open={modal==='transfer'} onClose={()=>{setModal(null);setTransferTarget(null);}}
        title="🔀 Transfer tenant to another unit" size="lg">
        <div className="p-5 flex flex-col gap-4">

          {/* Current tenancy summary */}
          {transferTarget&&(
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[--red-bg] border border-[--red-bg] rounded-xl p-3 text-sm">
                <p className="text-xs font-semibold text-[--red] mb-1">FROM (current)</p>
                <p className="font-semibold">{transferTarget.tenant_name}</p>
                <p className="text-[--text-secondary]">Unit {transferTarget.unit_number}</p>
                <p className="text-[--text-muted] text-xs">{transferTarget.property_name}</p>
                <p className="text-green-700 font-medium text-xs mt-1">
                  KES {Number(transferTarget.rent_amount||0).toLocaleString()}/mo
                </p>
              </div>
              <div className={`rounded-xl p-3 text-sm border ${transferForm.new_unit_id
                ? 'bg-[--green-bg] border-[--green-bg]'
                : 'bg-[--surface-muted] border-[--border]'}`}>
                <p className="text-xs font-semibold text-[--green] mb-1">TO (destination)</p>
                {transferForm.new_unit_id ? (() => {
                  const u=(transferOpts.vacant_units||[]).find(v=>String(v.id)===String(transferForm.new_unit_id));
                  return u ? (<>
                    <p className="font-semibold">Unit {u.unit_number}</p>
                    <p className="text-[--text-secondary]">{u.property_name}</p>
                    {u.location&&<p className="text-[--text-muted] text-xs">{u.location}</p>}
                    <p className="text-green-700 font-medium text-xs mt-1">
                      KES {Number(transferForm.new_rent_amount||u.rent_amount||0).toLocaleString()}/mo
                    </p>
                  </>) : null;
                })() : (
                  <p className="text-[--text-muted] text-xs mt-2">Select a destination unit →</p>
                )}
              </div>
            </div>
          )}

          {/* Property filter */}
          {(transferOpts.vacant_units||[]).length > 0 && (() => {
            const props = [...new Set((transferOpts.vacant_units||[]).map(u=>u.property_name))];
            return props.length > 1 ? (
              <div>
                <label className="label">Filter by property</label>
                <select className="input" value={transferForm._propFilter||''}
                  onChange={e=>setTransferForm(f=>({...f,_propFilter:e.target.value,new_unit_id:'',new_rent_amount:''}))}>
                  <option value="">All properties ({(transferOpts.vacant_units||[]).length} vacant units)</option>
                  {(props||[]).map(p=>{
                    const cnt=(transferOpts.vacant_units||[]).filter(u=>u.property_name===p).length;
                    return <option key={p} value={p}>{p} ({cnt} vacant)</option>;
                  })}
                </select>
              </div>
            ) : null;
          })()}

          {/* Destination unit selector */}
          <div>
            <label className="label">Destination unit *</label>
            {(transferOpts.vacant_units||[]).length === 0 ? (
              <div className="input bg-[--surface-muted] text-[--text-muted] text-sm py-3 text-center">
                No vacant units available across all properties
              </div>
            ) : (
              <select className="input" value={transferForm.new_unit_id}
                onChange={e=>{
                  const u=(transferOpts.vacant_units||[]).find(v=>String(v.id)===e.target.value);
                  setTransferForm(f=>({...f,new_unit_id:e.target.value,new_rent_amount:u?.rent_amount||'',_propFilter:f._propFilter}));
                }}>
                <option value="">Select vacant unit...</option>
                {(transferOpts.vacant_units||[])
                  .filter(u=>!transferForm._propFilter||u.property_name===transferForm._propFilter)
                  .map(u=>(
                  <option key={u.id} value={u.id}>
                    Unit {u.unit_number} — {u.property_name}{u.floor?` (Floor ${u.floor})`:''}
                    {u.type?` · ${u.type}`:''}
                    {' · '}KES {Number(u.rent_amount||0).toLocaleString()}/mo
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Transfer details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">New rent (KES)</label>
              <input type="number" className="input" value={transferForm.new_rent_amount}
                onChange={e=>setTransferForm(f=>({...f,new_rent_amount:e.target.value}))}
                placeholder="Defaults to unit's listed rent" />
              {transferForm.new_unit_id && (() => {
                const u=(transferOpts.vacant_units||[]).find(v=>String(v.id)===String(transferForm.new_unit_id));
                const orig=u?.rent_amount;
                const current=transferTarget?.rent_amount;
                if (!orig) return null;
                const diff=Number(transferForm.new_rent_amount||orig)-Number(current||0);
                return (
                  <p className={`text-xs mt-1 ${diff>0?'text-[--green]':diff<0?'text-[--red]':'text-[--text-muted]'}`}>
                    {diff>0?`▲ +KES ${Number(diff).toLocaleString()}/mo increase`:
                     diff<0?`▼ −KES ${Math.abs(diff).toLocaleString()}/mo decrease`:
                     'Same rent as before'}
                  </p>
                );
              })()}
            </div>
            <div>
              <label className="label">Transfer date *</label>
              <input type="date" className="input" value={transferForm.transfer_date}
                onChange={e=>setTransferForm(f=>({...f,transfer_date:e.target.value}))}
                min={new Date().toISOString().split('T')[0]} />
            </div>
          </div>

          <div>
            <label className="label">Reason for transfer</label>
            <input className="input" value={transferForm.reason}
              onChange={e=>setTransferForm(f=>({...f,reason:e.target.value}))}
              placeholder="e.g. Tenant requested larger unit, property upgrade..." />
          </div>

          {/* Balance carry option */}
          <div className="flex items-start gap-3 p-3 bg-[--amber-bg] border border-[--amber-bg] rounded-xl">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-amber-600" checked={transferForm.carry_balance}
              onChange={e=>setTransferForm(f=>({...f,carry_balance:e.target.checked}))} id="carry_balance" />
            <label htmlFor="carry_balance" className="text-sm cursor-pointer">
              <span className="font-semibold text-amber-800">Carry outstanding balance</span>
              <p className="text-[--amber] text-xs mt-0.5">
                Transfer any unpaid/overdue invoices to the new tenancy. Uncheck to cancel all open invoices and start fresh.
              </p>
            </label>
          </div>

          {/* What will happen summary */}
          {transferForm.new_unit_id && (
            <div className="bg-[--surface-muted] rounded-xl p-3 text-xs text-[--text-muted] space-y-1">
              <p className="font-semibold text-[--text-primary] mb-1">What will happen:</p>
              <p>✅ Tenancy moved to new unit — all payment history preserved</p>
              <p>✅ Open maintenance requests transferred to new unit</p>
              <p>✅ Tenant notified via in-app notification + SMS</p>
              <p>{transferForm.carry_balance ? '✅ Outstanding invoices carried over' : '⚠️ Open invoices will be cancelled — new rent invoice created'}</p>
              <p>✅ Old unit marked as vacant, new unit marked as occupied</p>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>{setModal(null);setTransferTarget(null);}}>Cancel</button>
          <button className="btn-primary" onClick={submitTransfer}
            disabled={busy||!transferForm.new_unit_id||!transferForm.transfer_date}>
            {busy ? '⏳ Transferring…' : '🔀 Transfer tenant'}
          </button>
        </div>
      </Modal>

      {/* ── Billing Mode Info / Bulk Toggle ───────────────────── */}
      {billingInfoModal && (
        <Modal open={billingInfoModal} onClose={()=>setBillingInfoModal(false)} title="Invoicing mode" size="sm">
          <div className="p-5 flex flex-col gap-3 text-sm">
            <div className="flex gap-3 p-3 bg-[--green-bg] border border-[--green-bg] rounded-xl">
              <span className="text-xl">🔄</span>
              <div>
                <p className="font-semibold text-green-800">Auto billing</p>
                <p className="text-[--green] text-xs mt-1">
                  Rent invoices are generated automatically each month by the cron job on the configured billing day. No manual action needed.
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 bg-[--amber-bg] border border-[--amber-bg] rounded-xl">
              <span className="text-xl">📋</span>
              <div>
                <p className="font-semibold text-amber-800">Manual billing</p>
                <p className="text-[--amber] text-xs mt-1">
                  Invoices must be created manually from the Invoices page. Use for irregular arrangements, furnished units with variable charges, or tenants on negotiated payment plans.
                </p>
              </div>
            </div>
            <p className="text-xs text-[--text-muted] text-center">Toggle each tenancy's billing mode using the Auto/Manual button on its row.</p>
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-primary" onClick={()=>setBillingInfoModal(false)}>Got it</button>
          </div>
        </Modal>
      )}

    </AppLayout>
  );
}
