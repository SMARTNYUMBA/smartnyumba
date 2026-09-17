import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import api, { getUnits } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { fmtDate } from '../../utils/helpers';

const DEFAULT_CHECKLIST = [
  'Walls and ceiling — no cracks or water damage',
  'Plumbing — taps and drainage working',
  'Electrical — sockets and switches functioning',
  'Windows and doors — open/close properly',
  'Floor condition — no damage',
  'Kitchen fittings — in good order',
  'Bathroom fittings — in good order',
  'Overall cleanliness',
];

const CONDITIONS = [
  {value:'excellent',label:'Excellent ⭐⭐⭐⭐⭐'},
  {value:'good',     label:'Good ⭐⭐⭐⭐'},
  {value:'fair',     label:'Fair ⭐⭐⭐'},
  {value:'poor',     label:'Poor ⭐'},
];


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function Inspections() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { isLoading, data: inspections } = useQuery({ queryKey:['inspections'], queryFn: () => api.get('/inspections').then(r=>r.data.inspections) });
  const myPropId = (user?.profile?.property_id || user?.property_id);
  const { data: units } = useQuery({
    queryKey: ['units', myPropId],
    queryFn:  () => getUnits(myPropId ? { property_id: myPropId } : {}).then(r=>r.data.units),
  });
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ unit_id:'', inspection_date: new Date().toISOString().split('T')[0], condition_rating:'good', notes:'' });
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST.map(item => ({ item, passed: true })));
  const [busy, setBusy]       = useState(false);

  const unitOpts = (units||[]).map(u=>({value:u.id, label:`${u.unit_number} — ${u.property_name}`}));

  const toggleCheck = (i) => setChecklist(c => c.map((x,j) => j===i ? {...x, passed:!x.passed} : x));

  const save = async () => {
    if (!form.unit_id) return toast.error('Select a unit');
    setBusy(true);
    try {
      await api.post('/inspections', { ...form, checklist });
      toast.success('Inspection logged!');
      qc.invalidateQueries(['inspections']);
      setModal(false);
      setChecklist(DEFAULT_CHECKLIST.map(item=>({item,passed:true})));
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const condColor = { excellent:'badge-green', good:'badge-blue', fair:'badge-amber', poor:'badge-red' };

  const cols = [
    { label:'Unit',      render: r => r.unit_number },
    { label:'Property',  render: r => r.property_name },
    { label:'Date',      render: r => fmtDate(r.inspection_date) },
    { label:'Condition', render: r => <span className={condColor[r.condition_rating]}>{r.condition_rating}</span> },
    { label:'Inspector', render: r => r.inspector_name },
    { label:'Notes',     render: r => <span className="text-[--text-muted] text-xs">{r.notes?.slice(0,60)||'—'}</span> },
  ];

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Unit Inspections" actions={<button className="btn-primary btn-sm" onClick={()=>setModal(true)}>+ Log inspection</button>}>
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={inspections||[]} emptyMsg="No inspections logged yet" />
        </div>

      <Modal open={modal} onClose={()=>setModal(false)} title="Log unit inspection" size="lg">
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Unit *" value={form.unit_id} onChange={v=>setForm(f=>({...f,unit_id:v}))} options={unitOpts} placeholder="Select unit..." />
            <Input label="Inspection date *" type="date" value={form.inspection_date} onChange={e=>setForm(f=>({...f,inspection_date:e.target.value}))} />
          </div>
          <Select label="Overall condition *" value={form.condition_rating} onChange={v=>setForm(f=>({...f,condition_rating:v}))} options={CONDITIONS} />

          {/* Checklist */}
          <div>
            <label className="label mb-2">Inspection checklist</label>
            <div className="space-y-2 bg-[--surface-muted] rounded-xl p-4">
              {checklist.map((c,i) => (
                <label key={i} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={c.passed} onChange={()=>toggleCheck(i)}
                    className="w-4 h-4 accent-brand-600 rounded" />
                  <span className={`text-sm ${c.passed?'text-[--text-primary]':'text-[--red] line-through'}`}>{c.item}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[--text-muted] mt-1">
              {checklist.filter(c=>c.passed).length}/{checklist.length} items passed
            </p>
          </div>

          <Textarea label="Additional notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Any observations, damage found, follow-up needed..." />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving...':'Save inspection'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
