import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout  from '../../components/layout/AppLayout';
import Modal      from '../../components/ui/Modal';
import Avatar     from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDateTime, fmtDate, roleName } from '../../utils/helpers';

const ROLE_COLOR = {
  super_admin:      'bg-purple-100 text-purple-700',
  property_manager: 'bg-blue-100  text-blue-700',
  owner:            'bg-teal-100  text-teal-700',
  caretaker:        'bg-amber-100 text-amber-700',
  security:         'bg-[--surface-muted] text-[--text-secondary]',
  tenant:           'bg-green-100 text-green-700',
};

export default function Messages() {
  const { user } = useAuth() || {};
  const qc = useQueryClient();
  const bottomRef = useRef(null);

  const [tab,       setTab]     = useState('inbox');
  const [selected,  setSelected]= useState(null);
  const [compose,   setCompose] = useState(false);
  const [reply,     setReply]   = useState('');
  const [replyTarget, setReplyTarget] = useState('');
  const [busy,      setBusy]    = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', to_user_id: '', to_role: '' });

  // ── Data fetching ──────────────────────────────────────────
  const { data: inbox, isLoading: loadingInbox } = useQuery({
    queryKey: ['messages-inbox'],
    queryFn:  () => api.get('/messages/inbox').then(r => r.data),
    refetchInterval: 30000, // poll every 30s for new messages
  });
  const { data: sent } = useQuery({
    queryKey: ['messages-sent'],
    queryFn:  () => api.get('/messages/sent').then(r => r.data),
  });
  // Staff at same property — works for every role
  const { data: staffData } = useQuery({
    queryKey: ['messages-staff'],
    queryFn:  () => api.get('/messages/staff').then(r => r.data.staff || []),
    staleTime: 60000,
  });
  // Full thread for selected message
  const { data: threadData, refetch: refetchThread } = useQuery({
    queryKey: ['message-thread', selected?.id],
    queryFn:  () => api.get(`/messages/${selected.id}/thread`).then(r => r.data.thread || []),
    enabled:  !!selected,
  });

  // Scroll to bottom when thread loads / new reply
  useEffect(() => {
    if (threadData?.length) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [threadData]);

  const messages = tab === 'inbox' ? (inbox?.messages || []) : (sent?.messages || []);
  const unread   = inbox?.unread || 0;
  const staff    = staffData || [];
  const currentUserId = user?.id || user?.sub;

  // Group staff by role for the picker
  const staffByRole = staff.reduce((acc, u) => {
    const r = u.role || 'other';
    if (!acc[r]) acc[r] = [];
    acc[r].push(u);
    return acc;
  }, {});

  // A broadcast has no single recipient, so each reply to it is its own
  // private 1:1 conversation with whoever sent it. If YOU sent the
  // broadcast, "Reply" is ambiguous — the backend needs to know which of
  // the repliers you're responding to, since it can no longer be inferred.
  const isOwnBroadcast = !!selected
    && String(selected.from_user_id) === String(currentUserId)
    && selected.to_user_id == null;

  // Distinct people who've replied so far, in the order they first replied.
  const repliers = isOwnBroadcast
    ? Array.from(
        new Map(
          (threadData || [])
            .filter(m => String(m.from_user_id) !== String(currentUserId))
            .map(m => [m.from_user_id, m])
        ).values()
      )
    : [];

  useEffect(() => {
    if (isOwnBroadcast && repliers.length && !repliers.some(r => String(r.from_user_id) === String(replyTarget))) {
      setReplyTarget(String(repliers[0].from_user_id));
    } else if (!isOwnBroadcast && replyTarget) {
      setReplyTarget('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, threadData]);

  const openMsg = async (msg) => {
    setSelected(msg);
    setReply('');
    setReplyTarget('');
    if (!msg.is_read && tab === 'inbox') {
      await api.put(`/messages/${msg.id}/read`).catch(() => {});
      qc.invalidateQueries(['messages-inbox']);
    }
  };

  const sendMsg = async () => {
    if (!form.body.trim()) return toast.error('Message body is required');
    setBusy(true);
    try {
      await api.post('/messages', {
        body:        form.body,
        subject:     form.subject || undefined,
        to_user_id:  form.to_user_id || undefined,
      });
      toast.success('Message sent!');
      qc.invalidateQueries(['messages-inbox']);
      qc.invalidateQueries(['messages-sent']);
      setCompose(false);
      setForm({ subject: '', body: '', to_user_id: '', to_role: '' });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to send'); }
    finally { setBusy(false); }
  };

  const doReply = async () => {
    if (!reply.trim()) return toast.error('Reply cannot be empty');
    if (isOwnBroadcast && !replyTarget) return toast.error('Select who you are replying to');
    setBusy(true);
    try {
      await api.post(`/messages/${selected.id}/reply`, {
        body: reply,
        ...(isOwnBroadcast ? { to_user_id: replyTarget } : {}),
      });
      toast.success('Reply sent!');
      setReply('');
      refetchThread();
      qc.invalidateQueries(['messages-inbox']);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  // When composing to a role, filter recipients
  const filteredStaff = form.to_role
    ? staff.filter(u => u.role === form.to_role)
    : staff;

  return (
    <AppLayout title="Messages" actions={
      <button className="btn-primary btn-sm" onClick={() => setCompose(true)}>
        ✏️ New message
      </button>
    }>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-160px)] min-h-[500px]">

        {/* ── Message list ──────────────────────────────── */}
        <div className="lg:col-span-4 card overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-[--border] flex-shrink-0">
            {[
              { id: 'inbox', label: 'Inbox' },
              { id: 'sent',  label: 'Sent'  },
            ].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSelected(null); }}
                className={`flex-1 py-3 text-sm font-medium transition ${
                  tab === t.id
                    ? 'text-[--brand] border-b-2 border-[--brand]'
                    : 'text-[--text-muted] hover:text-[--text-primary]'
                }`}>
                {t.label}
                {t.id === 'inbox' && unread > 0 && (
                  <span className="ml-1.5 bg-[--red] text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Message items */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
            {loadingInbox && tab === 'inbox' ? (
              <div className="space-y-3 p-3">
                {[...Array(4)].map((_,i) => (
                  <div key={i} className="h-16 bg-[--surface-muted] rounded animate-pulse" />
                ))}
              </div>
            ) : !messages.length ? (
              <div className="flex flex-col items-center justify-center h-40 text-[--text-muted]">
                <p className="text-3xl mb-2">✉️</p>
                <p className="text-sm">No messages yet</p>
              </div>
            ) : messages.map((m, i) => {
              const isOwn   = String(m.from_user_id) === String(currentUserId);
              const name    = tab === 'inbox' ? (m.from_name || 'Unknown') : (m.to_name || 'All staff');
              const preview = m.subject || m.body?.slice(0, 50);
              const isUnread = !m.is_read && tab === 'inbox';

              return (
                <button key={i} onClick={() => openMsg(m)}
                  className={`w-full text-left px-4 py-3 transition hover:bg-[--surface-muted]
                    ${selected?.id === m.id ? 'bg-[--brand-light] border-l-2 border-brand-500' : ''}
                    ${isUnread ? 'bg-blue-50/60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Avatar name={name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm truncate flex-1 ${isUnread ? 'font-semibold text-[--text-primary]' : 'text-[--text-primary]'}`}>
                          {name}
                        </p>
                        {isUnread && <span className="w-2 h-2 bg-[--brand] rounded-full flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-[--text-muted] truncate mt-0.5">{preview}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-[--text-muted]">{fmtDate(m.created_at)}</p>
                        {m.reply_count > 0 && (
                          <span className="text-xs text-[--text-muted]">· {m.reply_count} {m.reply_count === 1 ? 'reply' : 'replies'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Thread view ───────────────────────────────── */}
        <div className="lg:col-span-8 card flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center flex-1 text-[--text-muted] p-8">
              <p className="text-5xl mb-4">💬</p>
              <p className="font-medium text-[--text-muted]">Select a message to read</p>
              <p className="text-sm mt-1">or compose a new one</p>
              {staff.length > 0 && (
                <div className="mt-6 p-4 bg-[--surface-muted] rounded-xl w-full max-w-sm">
                  <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide mb-3">
                    Staff at your property
                  </p>
                  <div className="space-y-2">
                    {staff.slice(0, 5).map(u => (
                      <div key={u.id} className="flex items-center gap-2">
                        <Avatar name={u.full_name} size="xs" />
                        <span className="text-sm text-[--text-primary] flex-1 truncate">{u.full_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLOR[u.role] || 'bg-[--surface-muted] text-[--text-secondary]'}`}>
                          {roleName(u.role)}
                        </span>
                      </div>
                    ))}
                    {staff.length > 5 && (
                      <p className="text-xs text-[--text-muted] text-center">+{staff.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Thread header */}
              <div className="px-5 py-4 border-b flex-shrink-0">
                <h3 className="font-semibold text-[--text-primary] text-base">
                  {selected.subject || '(No subject)'}
                </h3>
                <p className="text-xs text-[--text-muted] mt-0.5">
                  {selected.property_name && `${selected.property_name} · `}
                  {threadData ? `${threadData.length} message${threadData.length !== 1 ? 's' : ''}` : '…'}
                </p>
              </div>

              {/* Messages thread */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {(threadData || [selected]).map((msg, i) => {
                  const isMe = String(msg.from_user_id) === String(currentUserId);
                  return (
                    <div key={i} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <Avatar name={msg.from_name || user?.full_name} size="sm" />
                      <div className={`flex-1 max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-[--text-primary]">
                            {isMe ? 'You' : msg.from_name}
                          </span>
                          {msg.from_role && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLOR[msg.from_role] || 'bg-[--surface-muted] text-[--text-muted]'}`}>
                              {roleName(msg.from_role)}
                            </span>
                          )}
                          <span className="text-xs text-[--text-muted]">{fmtDateTime(msg.created_at)}</span>
                        </div>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
                          ${isMe
                            ? 'bg-brand-600 text-white rounded-tr-sm'
                            : 'bg-[--surface-muted] text-[--text-primary] rounded-tl-sm'
                          }`}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Reply input */}
              <div className="px-5 py-4 border-t flex-shrink-0 bg-[--surface]">
                {isOwnBroadcast && (
                  repliers.length ? (
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-xs text-[--text-muted]">Replying to:</label>
                      <select
                        className="input text-xs py-1 w-auto"
                        value={replyTarget}
                        onChange={e => setReplyTarget(e.target.value)}>
                        {repliers.map(r => (
                          <option key={r.from_user_id} value={r.from_user_id}>
                            {r.from_name || 'Unknown'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-[--text-muted] mb-2">
                      This is a broadcast — replies will appear here once someone responds.
                    </p>
                  )
                )}
                <div className="flex items-end gap-3">
                  <Avatar name={user?.full_name} size="sm" />
                  <div className="flex-1">
                    <textarea
                      className="input resize-none w-full text-sm py-2"
                      rows={2}
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doReply(); }}
                      placeholder={isOwnBroadcast && !repliers.length ? 'Nothing to reply to yet…' : 'Reply… (Ctrl+Enter to send)'}
                      disabled={isOwnBroadcast && !repliers.length}
                    />
                  </div>
                  <button
                    className="btn-primary btn-sm flex-shrink-0"
                    onClick={doReply}
                    disabled={busy || !reply.trim() || (isOwnBroadcast && !repliers.length)}>
                    {busy ? '…' : '↑ Send'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Compose modal ────────────────────────────────── */}
      <Modal open={compose} onClose={() => setCompose(false)} title="New message" size="md">
        <div className="p-5 flex flex-col gap-4">

          {/* Recipient */}
          <div>
            <label className="label">To</label>
            {/* Role filter */}
            <div className="flex gap-1.5 flex-wrap mb-2">
              <button
                onClick={() => setForm(f => ({ ...f, to_role: '', to_user_id: '' }))}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                  !form.to_role ? 'bg-brand-600 text-white' : 'bg-[--surface-muted] text-[--text-secondary]'
                }`}>
                All roles
              </button>
              {Object.keys(staffByRole).map(role => (
                <button key={role}
                  onClick={() => setForm(f => ({ ...f, to_role: role, to_user_id: '' }))}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    form.to_role === role
                      ? 'bg-brand-600 text-white'
                      : `${ROLE_COLOR[role] || 'bg-[--surface-muted] text-[--text-muted]'}`
                  }`}>
                  {roleName(role)} ({staffByRole[role].length})
                </button>
              ))}
            </div>

            <select className="input text-sm" value={form.to_user_id}
              onChange={e => setForm(f => ({ ...f, to_user_id: e.target.value }))}>
              <option value="">📣 All property staff (broadcast)</option>
              {filteredStaff.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name} — {roleName(u.role)}
                </option>
              ))}
            </select>
            {!form.to_user_id && (
              <p className="text-xs text-[--text-muted] mt-1">
                ℹ️ Broadcast sends to all staff at your property
              </p>
            )}
          </div>

          <div>
            <label className="label">Subject <span className="text-[--text-muted] font-normal">(optional)</span></label>
            <input className="input text-sm" value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. Water pump issue, Shift handover" />
          </div>

          <div>
            <label className="label">Message *</label>
            <textarea className="input resize-none text-sm" rows={5}
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Type your message here…" />
          </div>
        </div>

        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setCompose(false)}>Cancel</button>
          <button className="btn-primary" onClick={sendMsg} disabled={busy || !form.body.trim()}>
            {busy ? 'Sending…' : '📤 Send message'}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
