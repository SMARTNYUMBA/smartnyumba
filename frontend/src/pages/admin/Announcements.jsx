import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import api, { getAnnouncements, createAnnouncement, getProperties } from '../../api';
import { fmtDate } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';

const PRIORITY_COLORS = { normal:'border-l-brand-400', important:'border-l-amber-400', urgent:'border-l-red-500' };
// BUG FIX: this component is reused as-is by the manager AND caretaker
// portals (see pages/manager/Announcements.jsx, and App.jsx's
// CaretakerPages.Announcements). The backend only allows
// super_admin/property_manager/tenant to POST an announcement, and only
// super_admin/property_manager to send an SMS blast — but the "+ Post
// announcement" button was always shown to everyone, so a caretaker
// viewing /caretaker/announcements would fill out the form and get a
// generic "Failed" toast with no explanation. Gate the button on role.
const CAN_POST = ['super_admin', 'property_manager', 'tenant'];
const CAN_SMS  = ['super_admin', 'property_manager'];

export default function Announcements() {
  const { user } = useAuth();
  const canPost = CAN_POST.includes(user?.role);
  const canSms  = CAN_SMS.includes(user?.role);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: () => getAnnouncements().then(r => r.data.announcements) });
  const { data: props } = useQuery({ queryKey: ['properties'], queryFn: () => getProperties().then(r => r.data.properties) });
  const [modal,    setModal]    = useState(false);
  const [smsModal, setSmsModal] = useState(false);
  const [smsForm,  setSmsForm]  = useState({ property_id:'', message:'' });
  const [smsBusy,  setSmsBusy]  = useState(false);
  const [form, setForm]   = useState({ property_id:'', title:'', message:'', priority:'normal' });
  const [busy, setBusy]   = useState(false);
  const set = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const propOpts = (props||[]).map(p => ({ value: p.id, label: p.name }));

  const sendSmsBlast = async () => {
    if (!smsForm.message.trim()) return toast.error('Message required');
    setSmsBusy(true);
    try {
      const { data: r } = await api.post('/bulk-comms/sms-blast', smsForm);
      toast.success(`✅ SMS sent to ${r.sent} tenants${r.failed > 0 ? ` (${r.failed} failed)` : ''}`);
      setSmsModal(false);
      setSmsForm({ property_id:'', message:'' });
    } catch(e) { toast.error(e.response?.data?.error || 'Failed to send SMS'); }
    finally { setSmsBusy(false); }
  };

  const save = async () => {
    if (!form.title || !form.message) return toast.error('Title and message required');
    setBusy(true);
    try { await createAnnouncement(form); toast.success('Announcement posted!'); qc.invalidateQueries(['announcements']); setModal(false); }
    catch (e) { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  return (
    <AppLayout title="Announcements" actions={
      <div className="flex gap-2">
        {/* BUG FIX: this modal/handler already existed fully wired up
            (state, API call, error handling) but had no button to open
            it anywhere in the UI — the SMS blast feature was dead. */}
        {canSms  && <button className="btn-secondary btn-sm" onClick={() => setSmsModal(true)}>📱 SMS blast</button>}
        {canPost && <button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Post announcement</button>}
      </div>
    }>
      {isLoading ? <p className="text-[--text-muted]">Loading...</p> : (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {(data||[]).map((a,i) => (
            <div key={i} className={`card card-body border-l-4 ${PRIORITY_COLORS[a.priority] || ''}`}>
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-[--text-primary]">{a.title}</h3>
                <div className="flex gap-2 text-xs text-[--text-muted]">
                  <span className={`badge ${a.priority==='urgent'?'badge-red':a.priority==='important'?'badge-amber':'badge-gray'}`}>{a.priority}</span>
                  <span>{fmtDate(a.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-[--text-secondary] mt-2 leading-relaxed">{a.message}</p>
              <p className="text-xs text-[--text-muted] mt-2">Posted by {a.posted_by} {a.property_name ? `• ${a.property_name}` : '• All properties'}</p>
            </div>
          ))}
          {!data?.length && <div className="card card-body text-center py-12 text-[--text-muted]">No announcements yet</div>}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Post announcement">
        <div className="p-5 space-y-1">
          <Input label="Title *" value={form.title} onChange={set('title')} placeholder="e.g. Water supply interruption" />
          <Select label="Property (leave blank for all)" value={form.property_id} onChange={v => setForm(p=>({...p,property_id:v}))} options={propOpts} placeholder="All properties" />
          <Select label="Priority" value={form.priority} onChange={v => setForm(p=>({...p,priority:v}))} options={[{value:'normal',label:'Normal'},{value:'important',label:'Important'},{value:'urgent',label:'Urgent'}]} />
          <Textarea label="Message *" rows={5} value={form.message} onChange={set('message')} placeholder="Write your announcement here..." />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Posting...':'Post announcement'}</button>
        </div>
      </Modal>
      {/* SMS Blast Modal */}
      <Modal open={smsModal} onClose={() => setSmsModal(false)} title="📱 Send SMS to all tenants" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setSmsModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={sendSmsBlast} disabled={smsBusy}>{smsBusy ? 'Sending…' : 'Send SMS'}</button></>}>
        <div className="p-5 flex flex-col gap-3">
          <div className="alert-warning text-xs">
            ⚠️ This will send an SMS to ALL active tenants in the selected property. Use responsibly.
          </div>
          <div className="form-group">
            <label className="label">Property (leave blank for all)</label>
            <select className="input" value={smsForm.property_id} onChange={e => setSmsForm(f=>({...f,property_id:e.target.value}))}>
              <option value="">All properties</option>
              {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Message *</label>
            <textarea className="input" rows={4} maxLength={160}
              value={smsForm.message} onChange={e => setSmsForm(f=>({...f,message:e.target.value}))}
              placeholder="Your message to tenants..." />
            <p className="hint">{smsForm.message.length}/160 characters</p>
          </div>
        </div>
      </Modal>

    </AppLayout>
  );
}
