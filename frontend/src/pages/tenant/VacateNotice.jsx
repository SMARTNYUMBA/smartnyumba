import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Textarea  from '../../components/ui/Textarea';
import Badge     from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDate } from '../../utils/helpers';

export default function VacateNotice() {
  const { user } = useAuth();
  const p  = user?.profile || {};
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-vacate'],
    queryFn:  () => api.get('/vacate').then(r => r.data.notices || []),
  });

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 30);

  const [form, setForm] = useState({
    vacate_date: minDate.toISOString().split('T')[0],
    reason: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!p.tenancy_id) return toast.error('No active tenancy found. Contact your manager.');
    if (!form.vacate_date) return toast.error('Vacate date required');
    if (!window.confirm('Submit vacate notice? Your landlord will be notified.')) return;
    setBusy(true);
    try {
      await api.post('/vacate', { tenancy_id: p.tenancy_id, ...form });
      toast.success('Vacate notice submitted. Your property manager will contact you.');
      qc.invalidateQueries(['my-vacate']);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit'); }
    finally { setBusy(false); }
  };

  // Use string comparison to avoid type mismatch (DB may return int, profile may be string)
  const myNotices = (data || []).filter(n => String(n.tenancy_id) === String(p.tenancy_id));

  return (
    <AppLayout title="Vacate Notice">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Submit form */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-4">Submit vacate notice</h2>
          <div className="alert-warning mb-4 text-xs">
            Notice period is 30 days minimum. Please ensure your rent balance is settled before your vacate date.
          </div>

          {!p.tenancy_id ? (
            <div className="text-center py-6 text-[--text-muted] text-sm">
              No active tenancy found. Contact your property manager.
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label className="label">Intended vacate date *</label>
                <input type="date" className="input"
                  min={minDate.toISOString().split('T')[0]}
                  value={form.vacate_date}
                  onChange={e => setForm(f => ({ ...f, vacate_date: e.target.value }))} />
              </div>
              <Textarea
                label="Reason for vacating"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Please let us know why you are leaving..."
                rows={4} />
              <button className="btn-danger w-full justify-center" onClick={submit} disabled={busy}>
                {busy ? 'Submitting...' : 'Submit vacate notice'}
              </button>
            </div>
          )}
        </div>

        {/* My notices history */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-4">My notices</h2>
          {isLoading
            ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>
            : !myNotices.length
              ? <p className="text-center py-10 text-[--text-muted] text-sm">No notices submitted yet</p>
              : myNotices.map((n, i) => (
                <div key={i} className="p-3 rounded-xl bg-[--surface-muted] mb-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Submitted {fmtDate(n.notice_date || n.created_at)}</p>
                    <Badge status={n.status} label={n.status} />
                  </div>
                  <p className="text-xs text-[--text-muted] mt-1">Vacate date: {fmtDate(n.vacate_date)}</p>
                  {n.reason && <p className="text-xs text-[--text-secondary] mt-1 italic">"{n.reason}"</p>}
                </div>
              ))
          }
        </div>
      </div>
    </AppLayout>
  );
}
