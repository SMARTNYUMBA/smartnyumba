import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import Avatar      from '../../components/ui/Avatar';
import Confirm     from '../../components/ui/Confirm';
import api, { getUsers, createUser, getProperties } from '../../api';
import { fmtDate, roleColor, roleName } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ['super_admin','property_manager','tenant','caretaker','security','owner'];
const ROLE_DESC = {
  super_admin:      'Full system access',
  property_manager: 'Manages properties, tenants and billing',
  tenant:           'Resident — pays rent, submits requests',
  caretaker:        'Maintenance, meter readings, inspections',
  security:         'Visitors, parking and access control',
  owner:            'Property owner — views income reports',
};
const NEEDS_PROPERTY = ['property_manager','caretaker','security','tenant'];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exportToCSV(users) {
  const headers = ['Name','Email','Phone','Role','Property','Status','Last Login'];
  const rows = users.map(u => [
    u.full_name,
    u.email,
    u.phone || '',
    roleName(u.role),
    u.property_name || '',
    u.is_suspended ? 'Suspended' : u.is_active ? 'Active' : 'Inactive',
    u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = `users_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── User Detail Drawer ───────────────────────────────────────────────────────

// ─── Emergency Details Component ─────────────────────────────────────────────
function EmergencyDetails({ userId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-detail', userId],
    queryFn: () => api.get('/users/' + userId).then(r => r.data.user),
    enabled: !!userId,
    staleTime: 30000,
  });

  if (isLoading) return (
    <div className="mt-3 pt-3 border-t border-[--border]">
      <div className="space-y-2">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
      </div>
    </div>
  );
  if (!data) return null;

  const hasIdentity = data.id_number || data.passport_number || data.vehicle_plate;
  const hasEmergency = data.emergency_contact || data.emergency_phone;

  return (
    <div className="mt-3 pt-3 border-t border-[--border] space-y-4">
      {/* Identity section */}
      {hasIdentity && (
        <div>
          <p className="text-xs font-bold text-[--text-muted] uppercase tracking-wide mb-2">🪪 Identity</p>
          <div className="space-y-1.5">
            {(data.id_number || data.passport_number) && (
              <div className="flex justify-between items-center">
                <span className="text-[--text-muted] text-xs">{data.id_type === 'passport' ? 'Passport' : 'National ID'}</span>
                <span className="font-mono text-xs font-semibold bg-[--surface-muted] px-2 py-0.5 rounded">{data.id_number || data.passport_number}</span>
              </div>
            )}
            {data.vehicle_plate && (
              <div className="flex justify-between items-center">
                <span className="text-[--text-muted] text-xs">Vehicle plate</span>
                <span className="font-mono text-xs font-bold bg-[--amber-bg] text-amber-800 border border-[--amber-bg] px-2 py-0.5 rounded">{data.vehicle_plate}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Emergency contact */}
      <div>
        <p className="text-xs font-bold text-[--text-muted] uppercase tracking-wide mb-2">🆘 Emergency contact</p>
        {hasEmergency ? (
          <div className="bg-[--red-bg] border border-[--red-bg] rounded-xl p-3 space-y-1.5">
            {data.emergency_contact && (
              <p className="text-sm font-semibold text-[--text-primary]">{data.emergency_contact}</p>
            )}
            {data.emergency_phone && (
              <a href={'tel:' + data.emergency_phone}
                className="flex items-center gap-1.5 text-sm font-medium text-[--red] hover:underline">
                📞 {data.emergency_phone}
              </a>
            )}
          </div>
        ) : (
          <div className="bg-[--surface-muted] rounded-xl p-3">
            <p className="text-xs text-[--text-muted] italic text-center">No emergency contact on file</p>
            <p className="text-xs text-[--text-muted] text-center mt-0.5">User can add this in My Profile</p>
          </div>
        )}
      </div>

      {/* Tenancy info for tenants */}
      {data.tenancy && (
        <div>
          <p className="text-xs font-bold text-[--text-muted] uppercase tracking-wide mb-2">🏠 Active tenancy</p>
          <div className="bg-[--brand-light] border border-brand-200 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[--text-muted]">Unit</span>
              <span className="font-semibold text-[--text-primary]">{data.tenancy.unit_number}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[--text-muted]">Property</span>
              <span className="font-semibold text-[--text-primary]">{data.tenancy.property_name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[--text-muted]">Monthly rent</span>
              <span className="font-semibold text-[--green]">KES {Number(data.tenancy.rent_amount||0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserDrawer({ user, onClose, onResetPw, onSuspend, onUnsuspend, onDelete, me }) {
  if (!user) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[--surface] shadow-2xl h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-[--border] flex items-center justify-between sticky top-0 bg-[--surface] z-10">
          <h3 className="font-semibold text-[--text-primary]">User Details</h3>
          <button onClick={onClose} className="text-[--text-muted] hover:text-[--text-secondary] text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-2 py-3">
            <Avatar name={user.full_name} size="lg" src={user.profile_photo} />
            <p className="font-semibold text-[--text-primary] text-lg">{user.full_name}</p>
            <span className={roleColor(user.role)}>{roleName(user.role)}</span>
            {user.is_suspended
              ? <span className="badge badge-red">Suspended</span>
              : !user.is_active && ['property_manager','caretaker','security'].includes(user.role)
                ? <span className="badge badge-amber">Pending activation</span>
                : <span className={user.is_active ? 'badge badge-green' : 'badge badge-gray'}>{user.is_active ? 'Active' : 'Inactive'}</span>}
          </div>

          {/* Info grid */}
          <div className="space-y-2 text-sm">
            {[
              ['Email',    user.email],
              ['Phone',    user.phone || '—'],
              ['Property', user.property_name || '—'],
              ['Last login', user.last_login ? fmtDate(user.last_login) : 'Never'],
              ['Created',  user.created_at ? fmtDate(user.created_at) : '—'],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between py-2 border-b border-[--border]">
                <span className="text-[--text-muted]">{label}</span>
                <span className="text-[--text-primary] font-medium text-right max-w-[60%] truncate">{val}</span>
              </div>
            ))}
          </div>

          {/* Emergency & identity details for ALL roles */}
          <EmergencyDetails userId={user.id} />

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button className="w-full btn-secondary btn-sm" onClick={() => onResetPw(user)}>🔑 Reset password</button>
            {['property_manager','caretaker','security'].includes(user.role) && (
              user.is_suspended
                ? <button className="w-full text-sm py-2 px-4 rounded-xl bg-[--green-bg] text-green-700 border border-[--green-bg] hover:bg-green-100" onClick={() => onUnsuspend(user)}>✅ Reinstate user</button>
                : !user.is_active
                  ? <button className="w-full text-sm py-2 px-4 rounded-xl bg-[--green-bg] text-green-700 border border-[--green-bg] hover:bg-green-100 font-semibold" onClick={() => onUnsuspend(user)}>✅ Activate account</button>
                  : <button className="w-full text-sm py-2 px-4 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100" onClick={() => onSuspend(user)}>🚫 Suspend user</button>
            )}
            {user.role === 'tenant' && !user.is_active && (
              <button className="w-full text-sm py-2 px-4 rounded-xl bg-[--green-bg] text-green-700 border border-[--green-bg] hover:bg-green-100 font-semibold"
                onClick={() => { api.put('/users/' + user.id + '/approve').then(() => { toast.success(user.full_name + ' approved!'); onClose(); window.location.reload(); }).catch(e => toast.error(e.response?.data?.error || 'Failed')); }}>
                ✅ Approve registration
              </button>
            )}
            {user.id !== me?.id && user.role !== 'super_admin' && (
              <button className="w-full text-sm py-2 px-4 rounded-xl bg-[--red-bg] text-red-700 border border-[--red-bg] hover:bg-red-100" onClick={() => onDelete(user)}>🗑️ Delete user</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({ user, props, open, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name:         user?.full_name || '',
    phone:             user?.phone || '',
    property_id:       user?.property_id || '',
    emergency_contact: user?.emergency_contact || '',
    emergency_phone:   user?.emergency_phone || '',
    id_number:         user?.id_number || '',
    vehicle_plate:     user?.vehicle_plate || '',
  });
  const [busy, setBusy] = useState(false);
  const setE = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Refresh form when user changes (drawer might load fresh data)
  React.useEffect(() => {
    if (user) setForm({
      full_name:         user.full_name || '',
      phone:             user.phone || '',
      property_id:       user.property_id || '',
      emergency_contact: user.emergency_contact || '',
      emergency_phone:   user.emergency_phone || '',
      id_number:         user.id_number || '',
      vehicle_plate:     user.vehicle_plate || '',
    });
  }, [user?.id]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/users/${user.id}`, form);
      toast.success('User updated!');
      onSave();
      onClose();
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit — ${user?.full_name}`} size="md">
      <div className="p-5 flex flex-col gap-3">
        <Input label="Full name *" value={form.full_name} onChange={setE('full_name')} />
        <Input label="Phone" type="tel" value={form.phone} onChange={setE('phone')} placeholder="07XX XXX XXX" />
        {NEEDS_PROPERTY.includes(user?.role) && (
          <div className="form-group">
            <label className="label">Property</label>
            <select className="input" value={form.property_id} onChange={setE('property_id')}>
              <option value="">Select property…</option>
              {(props || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="divider" />
        <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide">Identity & Emergency</p>
        <Input label="National ID / Passport" value={form.id_number} onChange={setE('id_number')} placeholder="e.g. 12345678" />
        <Input label="Vehicle plate" value={form.vehicle_plate} onChange={e => setForm(f => ({...f, vehicle_plate: e.target.value.toUpperCase()}))} placeholder="e.g. KAA 000A" />
        <Input label="Emergency contact name" value={form.emergency_contact} onChange={setE('emergency_contact')} placeholder="Next of kin" />
        <Input label="Emergency contact phone" type="tel" value={form.emergency_phone} onChange={setE('emergency_phone')} placeholder="07XX XXX XXX" />
      </div>
      <div className="px-5 pb-5 flex items-center justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ open, onClose, props }) {
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState('tenant');
  const [propId, setPropId] = useState('');
  const [busy, setBusy]   = useState(false);
  const needsProp = NEEDS_PROPERTY.includes(role);

  const send = async () => {
    if (!email) return toast.error('Email required');
    if (needsProp && !propId) return toast.error('Please select a property');
    setBusy(true);
    try {
      await api.post('/users/invite', { email, role, property_id: propId || undefined });
      toast.success(`Invitation sent to ${email}`);
      onClose();
    } catch(e) { toast.error(e.response?.data?.error || 'Failed to send invite'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite user by email" size="sm">
      <div className="p-5 flex flex-col gap-3">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          📧 An invitation email with a secure sign-up link will be sent to the user.
        </div>
        <Input label="Email address *" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
        <div className="form-group">
          <label className="label">Role *</label>
          <select className="input" value={role} onChange={e => { setRole(e.target.value); setPropId(''); }}>
            {ROLES.map(r => <option key={r} value={r}>{roleName(r)}</option>)}
          </select>
        </div>
        {needsProp && (
          <div className="form-group">
            <label className="label">Property *</label>
            <select className="input" value={propId} onChange={e => setPropId(e.target.value)}>
              <option value="">Select property…</option>
              {(props || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="px-5 pb-5 flex items-center justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : '📨 Send invite'}</button>
      </div>
    </Modal>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

function BulkBar({ selected, onClear, onBulkSuspend, onBulkDelete, onBulkExport }) {
  const count = selected.length;
  if (!count) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900 text-white rounded-2xl shadow-2xl px-5 py-3 text-sm animate-in slide-in-from-bottom-4">
      <span className="font-semibold text-brand-400">{count} selected</span>
      <div className="w-px h-4 bg-slate-600" />
      <button onClick={onBulkExport}  className="hover:text-blue-400 transition">Export CSV</button>
      <button onClick={onBulkSuspend} className="hover:text-orange-400 transition">Suspend all</button>
      <button onClick={onBulkDelete}  className="hover:text-red-400 transition">Delete all</button>
      <div className="w-px h-4 bg-slate-600" />
      <button onClick={onClear} className="text-[--text-muted] hover:text-white transition">&times; Clear</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Users() {
  const { user: me } = useAuth();   // me = currently logged-in user (for can() checks)
  const qc = useQueryClient();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({ queryKey: ['users'],      queryFn: () => getUsers().then(r => r.data) });
  const { data: props }     = useQuery({ queryKey: ['properties'], queryFn: () => getProperties().then(r => r.data.properties) });

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [modal, setModal]                     = useState(null); // 'add' | 'reset' | 'invite' | 'bulkDelete' | 'bulkSuspend'
  const [editTarget, setEditTarget]           = useState(null);
  const [drawerUser, setDrawerUser]           = useState(null);
  const [resetTarget, setResetTarget]         = useState(null);
  const [newPw, setNewPw]                     = useState('');
  const [suspendTarget, setSuspendTarget]     = useState(null);
  const [suspendReason, setSuspendReason]     = useState('');
  const [unsuspendConfirm, setUnsuspendConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm]     = useState(null);
  const [busy, setBusy]                       = useState(false);

  // ── Create form ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'tenant', password: '', property_id: '' });
  const setE = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const needsProperty = NEEDS_PROPERTY.includes(form.role);

  // ── Filters & Search ──────────────────────────────────────────────────────────
  const [search, setSearch]           = useState('');
  const [filterRole, setFilterRole]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProp, setFilterProp]   = useState('');
  const [sortKey, setSortKey]         = useState('full_name');
  const [sortDir, setSortDir]         = useState('asc');

  // ── Pagination ────────────────────────────────────────────────────────────────
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── Selection ─────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState([]);

  const counts = data?.counts || {};
  const allUsers = data?.users || [];

  // ── Filtered & sorted list ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...allUsers];
    if (search)       list = list.filter(u => `${u.full_name} ${u.email} ${u.phone || ''}`.toLowerCase().includes(search.toLowerCase()));
    if (filterRole)   list = list.filter(u => u.role === filterRole);
    if (filterProp)   list = list.filter(u => String(u.property_id) === filterProp);
    if (filterStatus === 'active')    list = list.filter(u => u.is_active && !u.is_suspended);
    if (filterStatus === 'inactive')  list = list.filter(u => !u.is_active && !u.is_suspended && !['property_manager','caretaker','security'].includes(u.role));
    if (filterStatus === 'suspended') list = list.filter(u => u.is_suspended || (!u.is_active && ['property_manager','caretaker','security'].includes(u.role)));
    list.sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [allUsers, search, filterRole, filterProp, filterStatus, sortKey, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated   = filtered.slice((page - 1) * pageSize, page * pageSize);
  const allPageSelected = paginated.length > 0 && paginated.every(u => selected.includes(u.id));

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const toggleAll  = () => setSelected(allPageSelected ? [] : paginated.map(u => u.id));
  const toggleUser = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const clearFilters = () => { setSearch(''); setFilterRole(''); setFilterStatus(''); setFilterProp(''); setPage(1); };
  const hasFilters   = search || filterRole || filterStatus || filterProp;

  // ── CRUD Actions ──────────────────────────────────────────────────────────────

  const save = async () => {
    if (!form.full_name || !form.email || !form.password) return toast.error('Name, email and password required');
    if (needsProperty && !form.property_id) return toast.error('Please assign a property for this role');
    setBusy(true);
    try {
      await createUser(form);
      toast.success('User created!');
      qc.invalidateQueries(['users']);
      setModal(null);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed to create user'); }
    finally { setBusy(false); }
  };

  const doReset = async () => {
    if (!newPw || newPw.length < 8) return toast.error('Minimum 8 characters');
    setBusy(true);
    try {
      await api.put(`/users/${resetTarget.id}/password`, { password: newPw });
      toast.success('Password reset!');
      setModal(null); setResetTarget(null);
    } catch { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  const doSuspend = async () => {
    if (!suspendReason.trim()) return toast.error('Please provide a reason');
    setBusy(true);
    try {
      await api.put(`/users/${suspendTarget.id}/suspend`, { reason: suspendReason });
      toast.success(`${suspendTarget.full_name} suspended`);
      qc.invalidateQueries(['users']);
      setSuspendTarget(null); setSuspendReason('');
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const doUnsuspend = async (u) => {
    try {
      await api.put(`/users/${u.id}/unsuspend`);
      toast.success(`${u.full_name} reinstated`);
      qc.invalidateQueries(['users']);
      setUnsuspendConfirm(null); setDrawerUser(null);
    } catch { toast.error('Failed'); }
  };

  const doDelete = async (target) => {
    const t = target || deleteConfirm;
    if (!t) return;
    setBusy(true);
    try {
      await api.delete(`/users/${t.id}`);
      toast.success(`${t.full_name} deleted`);
      qc.invalidateQueries(['users']);
      setDeleteConfirm(null); setDrawerUser(null);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  // ── Bulk Actions ──────────────────────────────────────────────────────────────

  const doBulkSuspend = async () => {
    setBusy(true);
    let ok = 0;
    const suspendable = selected.filter(id => {
      const u = allUsers.find(x => x.id === id);
      return u && ['property_manager','caretaker','security'].includes(u.role) && !u.is_suspended;
    });
    for (const id of suspendable) {
      try { await api.put(`/users/${id}/suspend`, { reason: 'Bulk suspension by admin' }); ok++; } catch {}
    }
    toast.success(`Suspended ${ok} user(s)`);
    qc.invalidateQueries(['users']);
    setSelected([]); setModal(null); setBusy(false);
  };

  const doBulkDelete = async () => {
    setBusy(true);
    let ok = 0;
    const deletable = selected.filter(id => {
      const u = allUsers.find(x => x.id === id);
      return u && u.id !== me?.id && u.role !== 'super_admin';
    });
    for (const id of deletable) {
      try { await api.delete(`/users/${id}`); ok++; } catch {}
    }
    toast.success(`Deleted ${ok} user(s)`);
    qc.invalidateQueries(['users']);
    setSelected([]); setModal(null); setBusy(false);
  };

  const doBulkExport = () => {
    const sel = allUsers.filter(u => selected.includes(u.id));
    exportToCSV(sel.length ? sel : filtered);
    setSelected([]);
  };

  // ── Sort indicator ────────────────────────────────────────────────────────────
  const SortIcon = ({ k }) => (
    <span className="ml-1 text-[--text-muted] text-xs">
      {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  // ── Table columns ─────────────────────────────────────────────────────────────
  const cols = [
    {
      label: (
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={toggleAll}
          className="rounded"
          onClick={e => e.stopPropagation()}
        />
      ),
      render: r => (
        <input
          type="checkbox"
          checked={selected.includes(r.id)}
          onChange={() => toggleUser(r.id)}
          onClick={e => e.stopPropagation()}
          className="rounded"
        />
      ),
    },
    {
      label: <span className="cursor-pointer select-none" onClick={() => toggleSort('full_name')}>User <SortIcon k="full_name" /></span>,
      render: r => (
        <div className="flex items-center gap-3">
          <Avatar name={r.full_name} size="sm" src={r.profile_photo} />
          <div>
            <p className="font-medium text-sm">{r.full_name}</p>
            <p className="text-xs text-[--text-muted]">{r.email}</p>
          </div>
        </div>
      ),
    },
    { label: 'Phone', render: r => <span className="text-sm">{r.phone || '—'}</span> },
    {
      label: <span className="cursor-pointer select-none" onClick={() => toggleSort('role')}>Role <SortIcon k="role" /></span>,
      render: r => <span className={roleColor(r.role) + ' text-xs'}>{roleName(r.role)}</span>,
    },
    {
      label: <span className="cursor-pointer select-none" onClick={() => toggleSort('property_name')}>Property <SortIcon k="property_name" /></span>,
      render: r => <span className="text-sm">{r.property_name || <span className="text-[--text-muted] text-xs">—</span>}</span>,
    },
    {
      label: 'Status',
      render: r => (
        (r.is_suspended || (!r.is_active && ['property_manager','caretaker','security'].includes(r.role)))
          ? <span className="badge badge-red">Suspended</span>
          : <span className={r.is_active ? 'badge badge-green' : 'badge badge-gray'}>{r.is_active ? 'Active' : 'Inactive'}</span>
      ),
    },
    {
      label: <span className="cursor-pointer select-none" onClick={() => toggleSort('last_login')}>Last login <SortIcon k="last_login" /></span>,
      render: r => <span className="text-xs text-[--text-muted]">{r.last_login ? fmtDate(r.last_login) : 'Never'}</span>,
    },
    {
      label: '',
      render: r => (
        <div className="flex items-center gap-1 flex-wrap justify-end" onClick={e => e.stopPropagation()}>
          <button
            className="btn-ghost btn-sm text-[--blue]"
            onClick={async () => {
                  try {
                    const full = await api.get('/users/' + r.id).then(res => res.data.user);
                    setEditTarget(full || r);
                  } catch { setEditTarget(r); }
                }}>
            Edit
          </button>
          <button
            className="btn-ghost btn-sm text-[--amber]"
            onClick={() => { setResetTarget(r); setNewPw(''); setModal('reset'); }}>
            Reset pw
          </button>
          {['property_manager','caretaker','security'].includes(r.role) && (
            (r.is_suspended || !r.is_active)
              ? <button className="btn-ghost btn-sm text-[--green]" onClick={() => setUnsuspendConfirm(r)}>Reinstate</button>
              : <button className="btn-ghost btn-sm text-orange-500" onClick={() => { setSuspendTarget(r); setSuspendReason(''); }}>Suspend</button>
          )}
          {r.id !== me?.id && r.role !== 'super_admin' && (
            <button className="btn-ghost btn-sm text-[--red]" onClick={() => setDeleteConfirm(r)}>Delete</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout
      title="User Management"
      actions={
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={() => setModal('invite')}>
            📨 Invite user
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => exportToCSV(filtered)}>
            ⬇ Export CSV
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() => { setForm({ full_name:'', email:'', phone:'', role:'tenant', password:'', property_id:'' }); setModal('add'); }}>
            + Add user
          </button>
        </div>
      }>

      {/* ── Role count tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {ROLES.map(role => (
          <button
            key={role}
            className={`card card-body text-center py-3 transition hover:ring-2 hover:ring-brand-400 ${filterRole === role ? 'ring-2 ring-brand-500' : ''}`}
            onClick={() => { setFilterRole(filterRole === role ? '' : role); setPage(1); }}>
            <p className="text-xl font-bold text-[--text-primary]">{counts[role] || 0}</p>
            <p className="text-xs text-[--text-muted] mt-0.5">{roleName(role)}s</p>
          </button>
        ))}
      </div>

      {/* ── Search & Filters ──────────────────────────────────────────────────── */}
      <div className="card card-body mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="label text-xs mb-1">Search</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[--text-muted] text-sm">🔍</span>
              <input
                className="input pl-8"
                placeholder="Name, email or phone…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {/* Role filter */}
          <div className="min-w-[140px]">
            <label className="label text-xs mb-1">Role</label>
            <select className="input" value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1); }}>
              <option value="">All roles</option>
              {ROLES.map(r => <option key={r} value={r}>{roleName(r)}</option>)}
            </select>
          </div>

          {/* Status filter */}
          <div className="min-w-[140px]">
            <label className="label text-xs mb-1">Status</label>
            <select className="input" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Property filter */}
          <div className="min-w-[160px]">
            <label className="label text-xs mb-1">Property</label>
            <select className="input" value={filterProp} onChange={e => { setFilterProp(e.target.value); setPage(1); }}>
              <option value="">All properties</option>
              {(props || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Page size */}
          <div className="min-w-[100px]">
            <label className="label text-xs mb-1">Per page</label>
            <select className="input" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {hasFilters && (
            <button className="btn-ghost btn-sm text-[--text-muted] self-end" onClick={clearFilters}>✕ Clear filters</button>
          )}
        </div>

        {/* Results summary */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[--border] text-xs text-[--text-muted]">
          <span>
            Showing <strong className="text-[--text-primary]">{paginated.length}</strong> of <strong className="text-[--text-primary]">{filtered.length}</strong> users
            {filtered.length !== allUsers.length && ` (filtered from ${allUsers.length} total)`}
          </span>
          {selected.length > 0 && (
            <span className="text-[--brand] font-medium">{selected.length} selected</span>
          )}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-body">
          <Table
            columns={cols}
            data={paginated}
            loading={isLoading}
            onRowClick={r => setDrawerUser(r)}
          />
        </div>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            className="btn-secondary btn-sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}>
            ← Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button
                  key={p}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition ${page === p ? 'bg-brand-600 text-white' : 'hover:bg-[--surface-muted] text-[--text-secondary]'}`}
                  onClick={() => setPage(p)}>
                  {p}
                </button>
              );
            })}
            {totalPages > 7 && page < totalPages - 3 && <span className="text-[--text-muted] px-1">…</span>}
            {totalPages > 7 && page < totalPages - 3 && (
              <button className="w-8 h-8 rounded-lg text-xs font-medium hover:bg-[--surface-muted] text-[--text-secondary]" onClick={() => setPage(totalPages)}>{totalPages}</button>
            )}
          </div>
          <button
            className="btn-secondary btn-sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}>
            Next →
          </button>
        </div>
      )}

      {/* ── User Detail Drawer ─────────────────────────────────────────────────── */}
      <UserDrawer
        user={drawerUser}
        onClose={() => setDrawerUser(null)}
        me={me}
        onResetPw={u => { setResetTarget(u); setNewPw(''); setModal('reset'); setDrawerUser(null); }}
        onSuspend={u => { setSuspendTarget(u); setSuspendReason(''); setDrawerUser(null); }}
        onUnsuspend={u => { setUnsuspendConfirm(u); setDrawerUser(null); }}
        onDelete={u => { setDeleteConfirm(u); setDrawerUser(null); }}
      />

      {/* ── Bulk action bar ────────────────────────────────────────────────────── */}
      <BulkBar
        selected={selected}
        onClear={() => setSelected([])}
        onBulkSuspend={() => setModal('bulkSuspend')}
        onBulkDelete={() => setModal('bulkDelete')}
        onBulkExport={doBulkExport}
      />

      {/* ── Add user modal ─────────────────────────────────────────────────────── */}
      <Modal open={modal === 'add'} onClose={() => setModal(null)} title="Add new user" size="lg">
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="label mb-2">Role *</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: r, property_id: '' }))}
                  className={`text-left p-3 rounded-xl border-2 transition ${form.role === r ? 'border-brand-500 bg-[--brand-light]' : 'border-[--border] hover:border-[--border-strong]'}`}>
                  <p className={`text-sm font-semibold ${form.role === r ? 'text-[--brand-dark]' : 'text-[--text-primary]'}`}>{roleName(r)}</p>
                  <p className="text-xs text-[--text-muted] mt-0.5 leading-tight">{ROLE_DESC[r]}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Full name *" value={form.full_name} onChange={setE('full_name')} /></div>
            <Input label="Email *" type="email" value={form.email} onChange={setE('email')} />
            <Input label="Phone" type="tel" value={form.phone || ''} onChange={setE('phone')} placeholder="07XX XXX XXX" />
            <Input label="Password *" type="password" value={form.password} onChange={setE('password')} placeholder="Min 8 characters" />
          </div>
          {needsProperty && (
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wide">🏢 Property assignment</p>
              <div className="form-group">
                <label className="label">Assign to property *</label>
                <select className="input" value={form.property_id || ''} onChange={setE('property_id')}>
                  <option value="">Select property...</option>
                  {(props || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-xs text-[--text-muted] mt-1">
                  {form.role === 'tenant' && 'The tenant will be linked to this property.'}
                  {form.role === 'property_manager' && 'The manager will only see and manage this property.'}
                  {form.role === 'caretaker' && 'The caretaker will handle maintenance for this property.'}
                  {form.role === 'security' && 'The security officer will be stationed at this property.'}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Creating...' : 'Create user'}</button>
        </div>
      </Modal>

      {/* ── Edit user modal ────────────────────────────────────────────────────── */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          props={props}
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSave={() => qc.invalidateQueries(['users'])}
        />
      )}

      {/* ── Invite modal ───────────────────────────────────────────────────────── */}
      <InviteModal open={modal === 'invite'} onClose={() => setModal(null)} props={props} />

      {/* ── Reset password modal ───────────────────────────────────────────────── */}
      <Modal open={modal === 'reset'} onClose={() => setModal(null)} title="Reset password" size="sm">
        <div className="p-5">
          <p className="text-sm text-[--text-secondary] mb-3">
            Reset password for <strong>{resetTarget?.full_name}</strong>
          </p>
          <Input label="New password *" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={doReset} disabled={busy}>{busy ? 'Resetting...' : 'Reset password'}</button>
        </div>
      </Modal>

      {/* ── Suspend modal ─────────────────────────────────────────────────────── */}
      {suspendTarget && (
        <Modal open={!!suspendTarget} onClose={() => setSuspendTarget(null)} title="Suspend user" size="sm">
          <div className="p-5">
            <div className="alert-danger mb-3 text-sm">
              You are about to suspend <strong>{suspendTarget?.full_name}</strong>. They will be immediately logged out and unable to log in until reinstated.
            </div>
            <Textarea label="Reason for suspension *" value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={3} placeholder="State the reason..." />
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSuspendTarget(null)}>Cancel</button>
            <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium" onClick={doSuspend} disabled={busy}>{busy ? 'Suspending...' : 'Suspend user'}</button>
          </div>
        </Modal>
      )}

      {/* ── Unsuspend confirm ──────────────────────────────────────────────────── */}
      <Confirm
        open={!!unsuspendConfirm}
        onClose={() => setUnsuspendConfirm(null)}
        title="Reinstate user"
        message={`Reinstate ${unsuspendConfirm?.full_name}? They will be able to log in again.`}
        onConfirm={() => doUnsuspend(unsuspendConfirm)}
      />

      {/* ── Delete confirm ─────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete user" size="sm">
          <div className="p-5">
            <div className="p-4 bg-[--red-bg] border border-[--red-bg] rounded-xl text-sm text-red-700 space-y-2">
              <p className="font-semibold">⚠️ This action cannot be undone.</p>
              <p>
                You are about to permanently delete <strong>{deleteConfirm?.full_name}</strong>
                {deleteConfirm?.role === 'tenant' && ' — payment history will be preserved but the account will be removed'}.
              </p>
            </div>
            {deleteConfirm?.role === 'tenant' && (
              <p className="text-xs mt-3 bg-[--amber-bg] p-3 rounded-lg border border-[--amber-bg] text-amber-700">
                ℹ️ Tenants with an <strong>active tenancy</strong> cannot be deleted. Terminate their lease first.
              </p>
            )}
          </div>
          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2" onClick={() => doDelete()} disabled={busy}>
              {busy ? 'Deleting...' : '🗑️ Delete permanently'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Bulk suspend confirm ───────────────────────────────────────────────── */}
      <Modal open={modal === 'bulkSuspend'} onClose={() => setModal(null)} title="Bulk suspend" size="sm">
        <div className="p-5">
          <div className="alert-danger text-sm">
            You are about to suspend <strong>{selected.length}</strong> selected user(s). Only staff roles (manager, caretaker, security) will be affected. This action can be reversed individually.
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium" onClick={doBulkSuspend} disabled={busy}>{busy ? 'Suspending...' : `Suspend ${selected.length} users`}</button>
        </div>
      </Modal>

      {/* ── Bulk delete confirm ────────────────────────────────────────────────── */}
      <Modal open={modal === 'bulkDelete'} onClose={() => setModal(null)} title="Bulk delete" size="sm">
        <div className="p-5">
          <div className="p-4 bg-[--red-bg] border border-[--red-bg] rounded-xl text-sm text-red-700 space-y-1">
            <p className="font-semibold">⚠️ This cannot be undone.</p>
            <p>You are about to delete <strong>{selected.length}</strong> selected user(s). Super admins and your own account will be skipped. Tenants with active leases will fail silently.</p>
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium" onClick={doBulkDelete} disabled={busy}>{busy ? 'Deleting...' : `Delete ${selected.length} users`}</button>
        </div>
      </Modal>

    </AppLayout>
  );
}