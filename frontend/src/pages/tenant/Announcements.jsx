import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal     from '../../components/ui/Modal';
import Textarea  from '../../components/ui/Textarea';
import Input     from '../../components/ui/Input';
import api from '../../api';
import { fmtDate } from '../../utils/helpers';

const PRIORITY_COLORS = {
  normal:    'border-l-brand-400',
  important: 'border-l-amber-400',
  urgent:    'border-l-red-500',
};


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function TenantAnnouncements() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn:  () => api.get('/announcements').then(r => r.data.announcements),
  });
  const [modal, setModal] = useState(false);
  const [form,  setForm]  = useState({ title: '', message: '', priority: 'normal' });
  const [busy,  setBusy]  = useState(false);

  const post = async () => {
    if (!form.title || !form.message) return toast.error('Subject and message required');
    setBusy(true);
    try {
      // POST to /messages instead of /announcements — tenants send messages, not announcements
      await api.post('/messages', {
        subject: form.title,
        body:    form.message,
        // to_user_id omitted → broadcast to all property staff
      });
      toast.success('Message sent to property staff!');
      setModal(false);
      setForm({ title: '', message: '', priority: 'normal' });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Notices & Announcements" actions={
      <button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Send message to staff</button>
    }>
      <div className="alert-info text-xs mb-4">
        You can send messages to your property's management staff. These are not visible to other tenants.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {!(data || []).length
          ? <div className="card card-body text-center py-12 text-[--text-muted]">No announcements from management</div>
          : (data || []).map((a, i) => (
            <div key={i} className={`card card-body border-l-4 ${PRIORITY_COLORS[a.priority] || ''}`}>
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-[--text-primary]">{a.title}</h3>
                <div className="flex gap-2 text-xs text-[--text-muted]">
                  <span className={`badge ${a.priority === 'urgent' ? 'badge-red' : a.priority === 'important' ? 'badge-amber' : 'badge-gray'}`}>
                    {a.priority}
                  </span>
                  <span>{fmtDate(a.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-[--text-secondary] mt-2 leading-relaxed">{a.message}</p>
              <p className="text-xs text-[--text-muted] mt-2">By {a.posted_by}</p>
            </div>
          ))
        }
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Send message to property staff">
        <div className="p-5 flex flex-col gap-3">
          <div className="alert-info text-xs">
            Your message will be sent to the management, caretaker and security of your property only.
          </div>
          <Input label="Subject *" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Noise complaint, Water issue" />
          <Textarea label="Message *" value={form.message} rows={4}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder="Describe your concern or message..." />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={post} disabled={busy}>
            {busy ? 'Sending...' : 'Send to staff'}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
