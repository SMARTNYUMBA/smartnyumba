import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import ExportBar, { exportToCsv, exportToExcel } from '../../components/ui/ExportBar';
import api, { getExpenses, createExpense, getProperties } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

const CATS = ['maintenance','utilities','salaries','insurance','legal','marketing','cleaning','security','other'].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}));

export default function Expenses() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ property_id:'', month:'' });
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ property_id:'', category:'other', title:'', amount:'', expense_date:new Date().toISOString().split('T')[0], vendor:'', notes:'', receipt_url:'' });
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy]             = useState(false);
  const setE  = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const openEdit = (row) => {
    setForm({
      property_id:  String(row.property_id),
      category:     row.category || 'other',
      title:        row.title,
      amount:       String(row.amount),
      expense_date: row.expense_date?.slice(0,10) || new Date().toISOString().slice(0,10),
      vendor:       row.vendor || '',
      notes:        row.notes  || '',
    });
    setEditTarget(row);
  };

  const saveEdit = async () => {
    if (!form.title||!form.amount) return toast.error('Title and amount required');
    setBusy(true);
    try {
      await api.put('/expenses/' + editTarget.id, form);
      toast.success('Expense updated!');
      qc.invalidateQueries(['expenses']);
      setEditTarget(null);
      setForm({property_id:'',category:'other',title:'',amount:'',expense_date:new Date().toISOString().split('T')[0],vendor:'',notes:''});
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const doDelete = async (id) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try { await api.delete('/expenses/' + id); toast.success('Deleted'); qc.invalidateQueries(['expenses']); }
    catch(e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const { data, isLoading } = useQuery({ queryKey:['expenses',filters], queryFn: () => getExpenses(filters).then(r=>r.data.expenses) });
  const { data: props }     = useQuery({ queryKey:['properties'],       queryFn: () => getProperties().then(r=>r.data.properties) });

  const save = async () => {
    if (!form.property_id||!form.title||!form.amount||!form.expense_date) return toast.error('Property, title, amount and date required');
    setBusy(true);
    try { await createExpense(form); toast.success('Expense recorded!'); qc.invalidateQueries(['expenses']); setModal(false); }
    catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const total = (data||[]).reduce((s,e)=>s+Number(e.amount),0);

  const exportData = () => exportToCsv(
    (data||[]).map(e=>({ Date:fmtDate(e.expense_date), Property:e.property_name, Category:e.category, Title:e.title, Amount:e.amount, Vendor:e.vendor||'', Notes:e.notes||'' })),
    'expenses'
  );

  const catTotals = (data||[]).reduce((acc,e)=>{ acc[e.category]=(acc[e.category]||0)+Number(e.amount); return acc; },{});

  const cols = [
    { label:'Date',     render: r => fmtDate(r.expense_date) },
    { label:'Property', render: r => <span className="text-xs text-[--text-muted]">{r.property_name}</span> },
    { label:'Category', render: r => <span className="badge badge-blue">{r.category}</span> },
    { label:'Title',    render: r => r.title },
    { label:'Vendor',   render: r => r.vendor||'—' },
    { label:'Amount',   render: r => <span style={{fontFamily:"Fraunces,serif",fontStyle:"italic",fontWeight:700,fontSize:15,color:"var(--red)"}}>{fmt(r.amount)}</span> },
    { label:'', render: r => (
      <div className="flex gap-1">
        <button className="btn-ghost btn-sm text-[--brand]" onClick={e=>{e.stopPropagation();openEdit(r);}}>Edit</button>
        <button className="btn-ghost btn-sm text-[--red]"   onClick={e=>{e.stopPropagation();doDelete(r.id);}}>Del</button>
      </div>
    )},
  ];

  return (
    <AppLayout title="Expenses" actions={
      <div className="flex gap-2">
        <ExportBar onCsv={exportData} onExcel={() => exportToExcel(exportData(), 'expenses')} />
        <button className="btn-primary btn-sm" onClick={()=>{setForm({property_id:'',category:'other',title:'',amount:'',expense_date:new Date().toISOString().split('T')[0],vendor:'',notes:''});setModal(true);}}>+ Add expense</button>
      </div>
    }>
      {/* Filters + total */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="input w-48 text-sm" value={filters.property_id} onChange={e=>setFilters(f=>({...f,property_id:e.target.value}))}>
          <option value="">All properties</option>
          {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="month" className="input w-40 text-sm" value={filters.month||''} onChange={e=>setFilters(f=>({...f,month:e.target.value}))} />
        <div className="ml-auto card card-body py-2 px-4">
          <span className="text-xs text-[--text-muted]">Total: </span>
          <span className="font-bold text-[--red] ml-1">{fmt(total)}</span>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(catTotals).length > 0 && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          {Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} className="card card-body py-2 text-center">
              <p className="text-sm font-bold text-[--red]">{fmt(amt)}</p>
              <p className="text-xs text-[--text-muted] capitalize mt-0.5">{cat}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={data} loading={isLoading} /></div>

      <Modal open={modal} onClose={()=>setModal(false)} title="Record expense">
        <div className="p-5 grid grid-cols-2 gap-x-4">
          <div className="col-span-2 form-group">
            <label className="label">Property *</label>
            <select className="input" value={form.property_id} onChange={setE('property_id')}>
              <option value="">Select property...</option>
              {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <Select label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} options={CATS} />
          <Input label="Date *" type="date" value={form.expense_date} onChange={setE('expense_date')} />
          <div className="col-span-2"><Input label="Description *" value={form.title} onChange={setE('title')} placeholder="What was the expense for?" /></div>
          <Input label="Amount (KES) *" type="number" value={form.amount} onChange={setE('amount')} />
          <Input label="Vendor / Supplier" value={form.vendor||''} onChange={setE('vendor')} />
          <div className="col-span-2"><Textarea label="Notes" value={form.notes||''} onChange={setE('notes')} rows={2} /></div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving...':'Save expense'}</button>
        </div>
      </Modal>
      {/* Edit Expense Modal */}
      <Modal open={!!editTarget} onClose={()=>{setEditTarget(null);setForm({property_id:'',category:'other',title:'',amount:'',expense_date:new Date().toISOString().split('T')[0],vendor:'',notes:''});}} title="Edit expense">
        <div className="p-5 grid grid-cols-2 gap-x-4">
          <div className="col-span-2 form-group">
            <label className="label">Property</label>
            <select className="input" value={form.property_id} onChange={setE('property_id')}>
              <option value="">Select property...</option>
              {(props||[]).map(p=><option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>
          <Select label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} options={CATS} />
          <Input label="Date *" type="date" value={form.expense_date} onChange={setE('expense_date')} />
          <div className="col-span-2"><Input label="Description *" value={form.title} onChange={setE('title')} /></div>
          <Input label="Amount (KES) *" type="number" value={form.amount} onChange={setE('amount')} />
          <Input label="Vendor" value={form.vendor||''} onChange={setE('vendor')} />
          <div className="col-span-2"><Textarea label="Notes" value={form.notes||''} onChange={setE('notes')} rows={2} /></div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setEditTarget(null)}>Cancel</button>
          <button className="btn-primary" onClick={saveEdit} disabled={busy}>{busy?'Saving...':'Save changes'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
