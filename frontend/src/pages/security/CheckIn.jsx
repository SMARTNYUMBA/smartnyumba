// frontend/src/pages/security/CheckIn.jsx  — ENHANCED
// New: vehicle plate lookup bar, access status badge on each unit/tenant

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import KpiCard     from '../../components/ui/KpiCard';
import { useAuth } from '../../context/AuthContext';
import api, { checkInVisitor, checkOutVisitor, getVisitors, getUnits, getProperties } from '../../api';
import { fmtTime, fmtDateTime } from '../../utils/helpers';

function AccessBadge({ status }) {
  if (!status || status === 'granted')
    return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">✅ ACCESS GRANTED</span>;
  if (status === 'restricted')
    return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">🚫 ACCESS RESTRICTED</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-700">⚠️ SUSPENDED</span>;
}

export default function CheckIn() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Visitor check-in state
  const { data: visitors, isLoading } = useQuery({ queryKey:['visitors-today'], queryFn: () => getVisitors({ date: new Date().toISOString().split('T')[0] }).then(r=>r.data) });
  const { data: units }  = useQuery({ queryKey:['units','occupied'], queryFn: () => getUnits({ status:'occupied' }).then(r=>r.data.units) });
  const { data: props }  = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });
  const [form, setForm]  = useState({ property_id: user?.property_id ? String(user.property_id) : '', unit_id:'', name:'', phone:'', vehicle_plate:'', purpose:'' });
  const [busy, setBusy]  = useState(false);
  const setE = k => e => setForm(p=>({...p,[k]:e.target.value}));

  // Vehicle lookup state
  const [plateSearch, setPlateSearch]   = useState('');
  const [plateResults, setPlateResults] = useState(null);
  const [plateBusy, setPlateBusy]       = useState(false);
  const [activeTab, setActiveTab]       = useState('visitor'); // 'visitor' | 'vehicle'

  const unitOpts = (units||[])
    .filter(u => !form.property_id || String(u.property_id) === String(form.property_id))
    .map(u => ({ value:u.id, label:`${u.unit_number} — ${u.tenant_name||''}` }));
  const propOpts = (props||[]).map(p => ({ value:String(p.id), label:p.name }));
  const onSite   = (visitors?.visitors||[]).filter(v=>v.status==='checked_in');

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => qc.invalidateQueries(['visitors-today']), 30000);
    return () => clearInterval(id);
  }, [qc]);

  const doCheckIn = async () => {
    if (!form.property_id || !form.name) return toast.error('Property and visitor name required');
    setBusy(true);
    try {
      // Check blacklist before allowing entry
      if (form.id_number || form.vehicle_plate) {
        try {
          const bl = await api.get('/visitors/blacklist');
          const blacklist = bl.data.blacklist || [];
          const hit = blacklist.find(b =>
            (form.id_number && b.id_number && b.id_number === form.id_number) ||
            (form.vehicle_plate && b.vehicle_plate && b.vehicle_plate.replace(/\s/g,'') === form.vehicle_plate.replace(/\s/g,''))
          );
          if (hit) {
            setBusy(false);
            toast.error('🚫 BLACKLISTED: ' + (hit.name||'Visitor') + ' — ' + hit.reason, { duration: 8000 });
            return;
          }
        } catch (_) {} // non-fatal
      }
      await checkInVisitor({ ...form, checked_in_by: user?.sub || user?.id });
      toast.success(`${form.name} checked in!`);
      qc.invalidateQueries(['visitors-today']);
      setForm(f=>({ ...f, name:'', phone:'', vehicle_plate:'', purpose:'' }));
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const doCheckOut = async (id, name) => {
    try {
      await checkOutVisitor(id);
      toast.success(`${name} checked out`);
      qc.invalidateQueries(['visitors-today']);
    } catch { toast.error('Failed'); }
  };

  const doVehicleLookup = async () => {
    if (!plateSearch.trim() || plateSearch.trim().length < 3)
      return toast.error('Enter at least 3 characters');
    setPlateBusy(true);
    setPlateResults(null);
    try {
      const { data } = await api.get('/security/vehicle-lookup', { params:{ plate: plateSearch.trim() } });
      setPlateResults(data);
    } catch(e) { toast.error(e.response?.data?.error||'Lookup failed'); }
    finally { setPlateBusy(false); }
  };

  return (
    <AppLayout title="Gate Check-In">
      <div className="space-y-4 animate-fade-in">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Visitors today"  value={(visitors?.visitors||[]).length} icon="👋" color="brand" />
          <KpiCard label="Currently on site" value={onSite.length}                  icon="🏠" color="green" />
          <KpiCard label="Checked out"     value={(visitors?.visitors||[]).filter(v=>v.status!=='checked_in').length} icon="✅" color="teal" />
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[--surface-muted] p-1 rounded-xl w-fit">
          <button onClick={()=>setActiveTab('visitor')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab==='visitor'?'bg-[--surface] shadow text-[--text-primary]':'text-[--text-muted] hover:text-[--text-primary]'}`}>
            👤 Visitor check-in
          </button>
          <button onClick={()=>setActiveTab('vehicle')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab==='vehicle'?'bg-[--surface] shadow text-[--text-primary]':'text-[--text-muted] hover:text-[--text-primary]'}`}>
            🚗 Vehicle lookup
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* LEFT: Check-in form OR Vehicle lookup */}
          {activeTab === 'visitor' ? (
            <div className="card card-body space-y-3">
              <h2 className="text-sm font-semibold text-[--text-primary]">Register visitor</h2>
              {user?.property_id ? (
                <div className="form-group">
                  <label className="label">Property</label>
                  <div className="input bg-[--surface-muted] text-[--text-muted] cursor-not-allowed">
                    {propOpts.find(p => p.value === String(user.property_id))?.label || 'My property'}
                  </div>
                </div>
              ) : (
                <Select label="Property *" options={propOpts} value={form.property_id}
                  onChange={v => setForm(f=>({...f,property_id:v,unit_id:''}))} />
              )}
              <Select label="Visiting unit" options={unitOpts} value={form.unit_id}
                onChange={v => setForm(f=>({...f,unit_id:v}))} />
              <Input label="Visitor name *" value={form.name} onChange={setE('name')} placeholder="Full name" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" value={form.phone} onChange={setE('phone')} placeholder="07XX XXX XXX" />
                <Input label="Vehicle plate" value={form.vehicle_plate} onChange={setE('vehicle_plate')} placeholder="KBZ 123A" />
              </div>
              <div>
                <label className="label">Purpose of visit</label>
                <select className="input" value={form.purpose} onChange={setE('purpose')}>
                  <option value="">Select purpose...</option>
                  <option value="visiting_tenant">Visiting tenant</option>
                  <option value="delivery">Delivery</option>
                  <option value="contractor">Contractor / worker</option>
                  <option value="official_business">Official business</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button className="btn-primary w-full" onClick={doCheckIn} disabled={busy}>
                {busy ? 'Checking in...' : '✅ Check in visitor'}
              </button>
            </div>
          ) : (
            <div className="card card-body space-y-4">
              <h2 className="text-sm font-semibold text-[--text-primary]">🚗 Vehicle & resident lookup</h2>
              <p className="text-xs text-[--text-muted]">Search by vehicle registration plate to see tenant information and access status.</p>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono uppercase text-lg tracking-widest text-center"
                  placeholder="KBZ 123A"
                  value={plateSearch}
                  onChange={e=>setPlateSearch(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==='Enter'&&doVehicleLookup()}
                />
                <button className="btn-primary px-5" onClick={doVehicleLookup} disabled={plateBusy}>
                  {plateBusy ? '...' : 'Search'}
                </button>
              </div>

              {plateResults && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {!plateResults.found ? (
                    <div className="p-4 bg-[--red-bg] rounded-xl text-center">
                      <p className="font-medium text-[--red]">🔍 No resident found for plate "{plateResults.plate}"</p>
                      <p className="text-xs text-red-400 mt-1">Vehicle not registered in the system</p>
                    </div>
                  ) : (
                    plateResults.results.map((r, i) => (
                      <div key={i} className={`p-4 rounded-xl border-2 ${r.access_status==='restricted'?'border-[--red-bg] bg-[--red-bg]':'border-[--green-bg] bg-[--green-bg]'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-[--text-primary] text-base">{r.full_name}</p>
                            <p className="text-sm text-[--text-secondary]">Unit {r.unit_number} · {r.property_name}</p>
                            {r.vehicle_plate && <p className="text-xs text-[--text-muted] mt-0.5">🚗 {r.vehicle_plate} | Parking: {r.parking_slot||'Not allocated'}</p>}
                          </div>
                          <AccessBadge status={r.access_status} />
                        </div>
                        {r.access_status === 'restricted' && (
                          <div className="mt-2 p-2 bg-red-100 rounded-lg">
                            <p className="text-xs text-red-700 font-medium">
                              ⚠️ {r.access_restricted_reason || `Outstanding balance: KES ${Number(r.outstanding||0).toLocaleString()}`}
                            </p>
                            <p className="text-xs text-[--red] mt-1">Do not grant entry without manager approval.</p>
                          </div>
                        )}
                        {r.access_status !== 'restricted' && r.outstanding > 0 && (
                          <p className="text-xs text-[--amber] mt-1">Note: KES {Number(r.outstanding).toLocaleString()} outstanding balance</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* RIGHT: Currently on site */}
          <div className="card card-body">
            <h2 className="text-sm font-semibold mb-3 text-[--text-primary]">
              On site now
              <span className="ml-2 bg-[--brand] text-white text-xs px-2 py-0.5 rounded-full">{onSite.length}</span>
            </h2>
            {!onSite.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-[--text-muted]">
                <span className="text-4xl mb-2">👥</span>
                <p className="text-sm">No visitors currently on site</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {onSite.map((v, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[--surface-muted] rounded-xl">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-[--text-primary] truncate">{v.name}</p>
                      <p className="text-xs text-[--text-muted]">
                        In: {fmtTime(v.check_in_time||v.check_in)} · Unit {v.unit_number||'?'}
                        {v.vehicle_plate && ` · ${v.vehicle_plate}`}
                      </p>
                    </div>
                    <button onClick={() => doCheckOut(v.id, v.name)}
                      className="btn-secondary btn-sm flex-shrink-0 ml-2 text-xs">
                      Check out
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Today's log */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold mb-3 text-[--text-primary]">Today's visitor log</h2>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Visitor</th><th>Phone</th><th>Unit</th><th>Purpose</th>
                  <th>Checked in</th><th>Checked out</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!(visitors?.visitors||[]).length
                  ? <tr><td colSpan={7} className="text-center py-6 text-[--text-muted]">No visitors today</td></tr>
                  : (visitors.visitors||[]).map((v,i) => (
                    <tr key={i}>
                      <td>
                        <p className="font-medium text-sm">{v.name}</p>
                        {v.vehicle_plate && <p className="text-xs text-[--text-muted]">🚗 {v.vehicle_plate}</p>}
                      </td>
                      <td className="text-xs">{v.phone||'—'}</td>
                      <td className="text-xs">{v.unit_number||'—'}</td>
                      <td className="text-xs capitalize">{(v.purpose||'').replace(/_/g,' ')||'—'}</td>
                      <td className="text-xs">{fmtTime(v.check_in_time||v.check_in)}</td>
                      <td className="text-xs">{v.check_out_time||v.check_out ? fmtTime(v.check_out_time||v.check_out) : <span className="text-[--green]">On site</span>}</td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.status==='checked_in'?'bg-green-100 text-green-700':'bg-[--surface-muted] text-[--text-muted]'}`}>
                          {v.status==='checked_in'?'On site':'Departed'}
                        </span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}