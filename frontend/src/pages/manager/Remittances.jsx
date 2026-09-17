/**
 * Manager Remittances — record monthly owner payouts
 * /manager/remittances
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function ManagerRemittances() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ property_id:'', amount:'', period:'', notes:'' });
  const [busy, setBusy]   = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const { data: props } = useQuery({
    queryKey:['manager-props'],
    queryFn: () => api.get('/properties').then(r => r.data.properties||[]),
  });

  const { data, isLoading } = useQuery({
    queryKey:['manager-remittances'],
    queryFn: () => api.get('/owner/remittances-by-manager').then(r => r.data.remittances||[]).catch(()=>[]),
  });

  const save = async () => {
    if (!form.property_id || !form.amount || !form.period)
      return toast.error('Property, amount and period required');
    setBusy(true);
    try {
      await api.post('/owner/remittances', form);
      toast.success('Remittance recorded!');
      setModal(false);
      setForm({ property_id:'', amount:'', period:'', notes:'' });
      qc.invalidateQueries(['manager-remittances']);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <AppLayout title="Owner Remittances" actions={
      <button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Record remittance</button>
    }>
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-[--text-muted]">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Property</th><th>Period</th><th>Amount</th><th>Date</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {(data||[]).length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-[--text-muted]">No remittances recorded yet</td></tr>
                ) : (data||[]).map(r => (
                  <tr key={r.id}>
                    <td>{r.property_name}</td>
                    <td>{r.period}</td>
                    <td>
                      <p className="font-bold text-[--green]">{fmt(r.amount)}</p>
                      {r.net_remittance && r.net_remittance !== r.amount && (
                        <p className="text-xs text-[--text-muted]">Net: {fmt(r.net_remittance)}</p>
                      )}
                    </td>
                    <td className="text-[--text-muted] text-sm">{fmtDate(r.created_at)}</td>
                    <td className="text-[--text-muted] text-sm">{r.notes||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Record owner remittance" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving…':'Record'}</button></>}>
        <div className="p-5 flex flex-col gap-3">
          <div className="form-group">
            <label className="label">Property *</label>
            <select className="input" value={form.property_id} onChange={set('property_id')}>
              <option value="">Select property…</option>
              {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Period *</label>
            <input className="input" type="month" value={form.period} onChange={set('period')} />
          </div>
          <div className="form-group">
            <label className="label">Amount (KES) *</label>
            <input className="input" type="number" value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" />
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
