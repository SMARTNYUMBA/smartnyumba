import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api, { getProperties } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

const STATUS_COLOR = { pending:'badge-amber', approved:'badge-blue', paid:'badge-green', rejected:'badge-red' };

export default function VendorInvoices() {
  const qc = useQueryClient();
  const [modal, setModal]   = useState(null); // 'create'
  const [filter, setFilter] = useState({ property_id:'', status:'' });
  const [form, setForm]     = useState({ vendor_id:'', property_id:'', amount:'', description:'', invoice_date:'', due_date:'', invoice_ref:'' });
  const [busy, setBusy]     = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-invoices', filter],
    queryFn:  () => api.get('/vendor-invoices', { params: filter }).then(r => r.data.invoices || []),
  });
  const { data: props }   = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r => r.data.properties||[]) });
  const { data: vendors } = useQuery({ queryKey:['vendors'],    queryFn: () => api.get('/vendors').then(r => r.data.vendors||[]) });

  const create = async () => {
    if (!form.vendor_id||!form.property_id||!form.amount) return toast.error('Vendor, property and amount required');
    setBusy(true);
    try {
      await api.post('/vendor-invoices', form);
      toast.success('Vendor invoice created!');
      setModal(null);
      setForm({ vendor_id:'', property_id:'', amount:'', description:'', invoice_date:'', due_date:'', invoice_ref:'' });
      qc.invalidateQueries(['vendor-invoices']);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const approve = async (id) => {
    try { await api.put(`/vendor-invoices/${id}/approve`); toast.success('Approved!'); qc.invalidateQueries(['vendor-invoices']); }
    catch(e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const markPaid = async (id) => {
    const ref = prompt('Payment reference (optional):');
    try { await api.put(`/vendor-invoices/${id}/paid`, { payment_ref: ref }); toast.success('Marked as paid!'); qc.invalidateQueries(['vendor-invoices']); }
    catch(e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const invoices = data || [];
  const total = invoices.reduce((s,i) => s + Number(i.amount), 0);
  const pending = invoices.filter(i => i.status === 'pending').length;

  return (
    <AppLayout title="Vendor Invoices" actions={
      <button className="btn-primary btn-sm" onClick={() => setModal('create')}>+ New invoice</button>
    }>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Total invoices', value: invoices.length, icon:'🧾', color:'brand' },
            { label:'Pending approval', value: pending, icon:'⏳', color: pending?'amber':'green' },
            { label:'Total amount', value: fmt(total), icon:'💰', color:'blue' },
          ].map(k => (
            <div key={k.label} className="card card-body flex items-center gap-3">
              <span className="text-2xl">{k.icon}</span>
              <div>
                <p className="text-xs text-[--text-muted]">{k.label}</p>
                <p className="font-bold text-[--text-primary]">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <select className="input w-44 text-sm" value={filter.property_id} onChange={e => setFilter(f=>({...f,property_id:e.target.value}))}>
            <option value="">All properties</option>
            {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input w-36 text-sm" value={filter.status} onChange={e => setFilter(f=>({...f,status:e.target.value}))}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-[--text-muted]">Loading…</div>
          ) : !invoices.length ? (
            <div className="p-12 text-center"><p className="text-3xl mb-2">🧾</p><p className="text-[--text-muted]">No vendor invoices</p></div>
          ) : (
            <div className="overflow-x-auto">
              <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Vendor</th><th>Property</th><th>Ref</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <p className="font-medium text-[--text-primary]">{inv.vendor_name}</p>
                        <p className="text-xs text-[--text-muted]">{inv.description?.slice(0,40)}</p>
                      </td>
                      <td className="text-sm">{inv.property_name}</td>
                      <td className="font-mono text-xs text-[--text-muted]">{inv.invoice_ref||'—'}</td>
                      <td className="font-bold text-[--text-primary]">{fmt(inv.amount)}</td>
                      <td className="text-sm text-[--text-muted]">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                      <td><span className={`badge ${`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[inv.status]||'badge-gray'}`}`}>{inv.status}</span></td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          {inv.status === 'pending' && (
                            <button className="btn-ghost btn-sm text-[--brand]" onClick={() => approve(inv.id)}>Approve</button>
                          )}
                          {inv.status === 'approved' && (
                            <button className="btn-ghost btn-sm text-[--green]" onClick={() => markPaid(inv.id)}>Mark paid</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={modal==='create'} onClose={() => setModal(null)} title="New vendor invoice" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={create} disabled={busy}>{busy?'Creating…':'Create'}</button></>}>
        <div className="p-5 flex flex-col gap-3">
          <div className="form-group">
            <label className="label">Vendor *</label>
            <select className="input" value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">Select vendor…</option>
              {(vendors||[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Property *</label>
            <select className="input" value={form.property_id} onChange={set('property_id')}>
              <option value="">Select property…</option>
              {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Invoice reference</label>
            <input className="input" value={form.invoice_ref} onChange={set('invoice_ref')} placeholder="e.g. INV-2026-001" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="form-group">
              <label className="label">Amount (KES) *</label>
              <input className="input" type="number" value={form.amount} onChange={set('amount')} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="label">Due date</label>
              <input className="input" type="date" value={form.due_date} onChange={set('due_date')} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={set('description')} placeholder="What is this invoice for?" />
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
