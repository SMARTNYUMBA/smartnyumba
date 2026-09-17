import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import KpiCard     from '../../components/ui/KpiCard';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDateTime } from '../../utils/helpers';

const EVENT_TYPES = [
  {value:'entry',         label:'Entry'},
  {value:'exit',          label:'Exit'},
  {value:'denied',        label:'Access denied'},
  {value:'alarm',         label:'Alarm triggered'},
  {value:'gate_open',     label:'Gate opened'},
  {value:'gate_close',    label:'Gate closed'},
  {value:'intercom',      label:'Intercom call'},
  {value:'camera_motion', label:'Camera motion'},
];

const EVT_COLORS = {
  entry:'badge-green',exit:'badge-blue',denied:'badge-red',alarm:'badge-red',
  camera_motion:'badge-amber',intercom:'badge-purple',gate_open:'badge-green',gate_close:'badge-gray'
};

const SOURCES = [{value:'manual',label:'Manual'},{value:'intercom',label:'Intercom'},{value:'rfid',label:'RFID'},{value:'app',label:'App'}];

export default function AccessLog() {
  const { user }  = useAuth();
  const qc        = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, isLoading } = useQuery({
    queryKey:['access-log',date],
    queryFn: () => api.get('/access-log',{params:{date}}).then(r=>r.data.logs)
  });
  const [modal, setModal] = useState(false);
  // Pre-fill property from user's assigned property
  const [form, setForm] = useState({
    property_id: user?.property_id || '',
    event_type:'entry', actor_name:'', vehicle_plate:'', camera_id:'', source:'manual', notes:''
  });
  const [busy, setBusy] = useState(false);
  const setE = k => e => setForm(f=>({...f,[k]: k==='vehicle_plate'?e.target.value.toUpperCase():e.target.value}));

  const log = async () => {
    if (!form.event_type) return toast.error('Event type required');
    setBusy(true);
    try {
      await api.post('/access-log', form);
      toast.success('Event logged');
      qc.invalidateQueries(['access-log']);
      setModal(false);
      setForm(f=>({...f, actor_name:'', vehicle_plate:'', notes:'', camera_id:''}));
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const counts = (data||[]).reduce((acc,l)=>{acc[l.event_type]=(acc[l.event_type]||0)+1;return acc;},{});

  const cols = [
    { label:'Time',    render: r => <span className="font-mono text-xs">{fmtDateTime(r.created_at)}</span> },
    { label:'Event',   render: r => <span className={`badge ${EVT_COLORS[r.event_type]||'badge-gray'}`}>{r.event_type.replace('_',' ')}</span> },
    { label:'Person',  render: r => r.actor_name||'—' },
    { label:'Vehicle', render: r => r.vehicle_plate ? <span className="font-mono text-xs bg-[--surface-muted] px-2 py-0.5 rounded">{r.vehicle_plate}</span> : '—' },
    { label:'Property',render: r => r.property_name },
    { label:'Source',  render: r => <span className="badge badge-gray">{r.source}</span> },
    { label:'Notes',   render: r => <span className="text-xs text-[--text-muted]">{r.notes?.slice(0,40)||'—'}</span> },
  ];

  return (
    <AppLayout title="Access Log" actions={
      <button className="btn-primary btn-sm" onClick={()=>setModal(true)}>+ Log event</button>
    }>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Entries today" value={counts.entry||0}  icon="🚪" color="green" />
        <KpiCard label="Exits today"   value={counts.exit||0}   icon="🚶" color="brand" />
        <KpiCard label="Denied"        value={counts.denied||0} icon="🚫" color="red"   />
        <KpiCard label="Alarms"        value={counts.alarm||0}  icon="🚨" color="amber" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-[--text-secondary]">Date:</label>
        <input type="date" className="input w-auto" value={date} onChange={e=>setDate(e.target.value)} />
      </div>

      {user?.property_id && (
        <div className="alert-info text-xs mb-4">
          📍 Showing access log for your assigned property only.
        </div>
      )}

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={data} loading={isLoading} emptyMsg="No access events logged for this date" />
        </div>

      <Modal open={modal} onClose={()=>setModal(false)} title="Log access event">
        <div className="p-5 flex flex-col gap-3">
          {user?.property_id && (
            <div className="alert-info text-xs">Property auto-filled from your assignment.</div>
          )}
          <Select label="Event type *" value={form.event_type} onChange={v=>setForm(f=>({...f,event_type:v}))} options={EVENT_TYPES} />
          <Select label="Source" value={form.source} onChange={v=>setForm(f=>({...f,source:v}))} options={SOURCES} />
          <Input label="Person name" value={form.actor_name} onChange={setE('actor_name')} placeholder="Visitor or resident name" />
          <Input label="Vehicle plate" value={form.vehicle_plate} onChange={setE('vehicle_plate')} placeholder="KXX 000A" />
          <Input label="Camera / Gate ID" value={form.camera_id} onChange={setE('camera_id')} placeholder="e.g. CAM-01, GATE-A" />
          <Input label="Notes" value={form.notes} onChange={setE('notes')} placeholder="Any additional details..." />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={log} disabled={busy}>{busy?'Logging...':'Log event'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
