import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import api, { tokenStore, getInvoices } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { fmt, fmtDate } from '../../utils/helpers';

const TYPE_ICONS = { rent:'🏠',water:'💧',electricity:'⚡',service_charge:'🏢',
  garbage:'🗑️',parking:'🚗',penalty:'⚠️',deposit:'💰',other:'🧾' };

const STEPS = ['Select Invoice','Enter Amount & Phone','Confirm & Pay','Done'];


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function TenantPayments() {
  const { user, profile: p } = useAuth();
  const qc = useQueryClient();
  // profile from useAuth

  const [step, setStep]           = useState(0);
  const [selectedInv, setSelectedInv] = useState(null);
  const [payAmount, setPayAmount]  = useState('');
  const [phone, setPhone]         = useState(user?.phone || '');
  const [checkoutId, setCheckoutId] = useState(null);
  const [polling, setPolling]     = useState(false);
  const [payResult, setPayResult] = useState(null);
  const [busy, setBusy]           = useState(false);
  const pollRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey:['my-invoices-pay'],
    queryFn: () => getInvoices({}).then(r=>r.data.invoices),
  });

  const unpaid = (data||[]).filter(i => ['unpaid','overdue','partial'].includes(i.status));

  const selectInvoice = (inv) => {
    setSelectedInv(inv);
    setPayAmount(String(inv.balance));
    setStep(1);
  };

  const initiatePayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return toast.error('Enter a valid amount');
    if (!phone || phone.length < 10) return toast.error('Enter a valid phone number');
    if (parseFloat(payAmount) > parseFloat(selectedInv.balance)) 
      return toast.error(`Cannot pay more than balance: ${fmt(selectedInv.balance)}`);
    
    setBusy(true);
    try {
      const { data: r } = await api.post('/payments/stk/initiate', {
        invoice_id: selectedInv.id,
        tenancy_id: p.tenancy_id,
        amount: parseFloat(payAmount),
        phone: phone.replace(/^0/, '254').replace(/^\+/, '')
      });
      setCheckoutId(r.checkout_request_id);
      setStep(2);
      if (r.demo) {
        toast(r.message || 'Demo mode: STK push simulated. Payment will auto-confirm in 5 seconds.', { icon: '⚙️', duration: 8000 });
      } else {
        toast.success('📱 PIN prompt sent! Enter your M-Pesa PIN to confirm payment.');
      }
      startPolling(r.checkout_request_id);
    } catch(e) {
      toast.error(e.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setBusy(false);
    }
  };

  const startPolling = (id) => {
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const { data: r } = await api.get(`/payments/stk/${id}`);
        if (r.status === 'completed') {
          clearInterval(pollRef.current);
          setPolling(false);
          setPayResult(r);
          setStep(3);
          qc.invalidateQueries(['my-invoices-pay']);
          qc.invalidateQueries(['my-invoices']);
          toast.success('Payment confirmed! ✅');
        } else if (r.status === 'failed' || r.status === 'cancelled') {
          clearInterval(pollRef.current);
          setPolling(false);
          toast.error(r.result_desc || 'Payment failed or cancelled');
          setStep(1);
        }
      } catch (_) {}
      if (attempts >= 30) { // 30 x 3s = 90 seconds timeout
        clearInterval(pollRef.current);
        setPolling(false);
        toast.error('Payment timeout. If you were charged, contact support with your M-Pesa message.');
        setStep(1);
      }
    }, 3000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const reset = () => { setStep(0); setSelectedInv(null); setPayAmount(''); setCheckoutId(null); setPayResult(null); };

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Make Payment">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s,i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                i < step ? 'bg-[--green] border-green-500 text-white' :
                i === step ? 'bg-brand-600 border-[--brand] text-white' :
                'bg-[--surface-muted] border-[--border-strong] text-[--text-muted]'}`}>
                {i < step ? '✓' : i+1}
              </div>
              {i < STEPS.length-1 && <div className={`h-1 w-8 sm:w-16 mx-1 rounded ${i < step?'bg-green-400':'bg-[--canvas-200]'}`}/>}
            </div>
          ))}
        </div>
        <p className="text-sm text-[--text-muted] text-center font-medium">{STEPS[step]}</p>
      </div>

      {/* STEP 0: Select Invoice */}
      {step === 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {!unpaid.length ? (
            <div className="card card-body text-center py-16">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-lg font-semibold text-[--text-primary]">All clear!</p>
              <p className="text-[--text-muted] mt-1">No outstanding invoices</p>
            </div>
          ) : unpaid.map((inv,i) => (
            <button key={i} onClick={() => selectInvoice(inv)}
              className="w-full card card-body hover:border-brand-400 hover:shadow-md transition-all cursor-pointer text-left border-2 border-transparent bg-[--surface]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[--surface-muted] flex items-center justify-center text-2xl flex-shrink-0">
                  {TYPE_ICONS[inv.type]||'🧾'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold capitalize">{inv.type.replace(/_/g,' ')} — Invoice #{inv.id}</p>
                  <p className="text-sm text-[--text-muted]">Due: {fmtDate(inv.due_date)}</p>
                  {inv.status === 'overdue' && <p className="text-xs text-[--red] font-medium">⚠️ Overdue</p>}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-[--text-primary]">{fmt(inv.balance)}</p>
                  <p className="text-xs text-[--text-muted]">Balance due</p>
                </div>
                <div className="text-[--brand] font-bold text-lg">›</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* STEP 1: Amount & Phone */}
      {step === 1 && selectedInv && (
        <div className="max-w-md mx-auto space-y-4">
          <div className="card card-body bg-[--brand-light] border border-brand-200">
            <p className="text-xs text-[--brand] font-semibold uppercase tracking-wide">Paying for</p>
            <p className="font-bold text-lg capitalize mt-1">{selectedInv.type.replace(/_/g,' ')} — #{selectedInv.id}</p>
            <p className="text-sm text-[--text-muted]">Total balance: <span className="font-bold text-[--text-primary]">{fmt(selectedInv.balance)}</span></p>
          </div>

          <div className="card card-body space-y-4">
            <div>
              <label className="label">Amount to pay (KES) *</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-[--text-muted] font-medium">KES</span>
                <input type="number" className="input pl-12 text-xl font-bold"
                  value={payAmount} onChange={e=>setPayAmount(e.target.value)}
                  min="1" max={selectedInv.balance} step="1" />
              </div>
              {parseFloat(payAmount) < parseFloat(selectedInv.balance) && payAmount && (
                <p className="text-xs text-[--amber] mt-1">Partial payment — remaining balance will be {fmt(parseFloat(selectedInv.balance)-parseFloat(payAmount))}</p>
              )}
            </div>

            <div>
              <label className="label">M-Pesa phone number *</label>
              <input type="tel" className="input text-lg" value={phone}
                onChange={e=>setPhone(e.target.value)} placeholder="e.g. 0722 123 456" />
              <p className="text-xs text-[--text-muted] mt-1">The M-Pesa PIN prompt will be sent to this number</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={()=>setStep(0)}>Back</button>
            <button className="btn-primary flex-1 py-3 text-base font-bold" onClick={initiatePayment} disabled={busy}>
              {busy ? 'Initiating...' : 'Pay Now via M-Pesa'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Waiting for PIN */}
      {step === 2 && (
        <div className="max-w-md mx-auto">
          <div className="card card-body text-center py-12">
            {polling ? (
              <>
                <div className="w-20 h-20 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-6"/>
                <p className="text-xl font-bold text-[--text-primary]">Waiting for payment...</p>
                <p className="text-[--text-muted] mt-2">Enter your M-Pesa PIN on your phone</p>
                <div className="mt-6 p-4 bg-[--green-bg] rounded-xl border border-[--green-bg]">
                  <p className="text-sm font-semibold text-green-700">Amount: {fmt(payAmount)}</p>
                  <p className="text-sm text-[--text-muted] mt-1">Phone: {phone}</p>
                </div>
                <p className="text-xs text-[--text-muted] mt-4">This page will update automatically once payment is confirmed</p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold">Checking payment...</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Success */}
      {step === 3 && payResult && (
        <div className="max-w-md mx-auto">
          <div className="card card-body text-center py-12">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">✅</span>
            </div>
            <p className="text-2xl font-bold text-[--green]">Payment Confirmed!</p>
            <p className="text-[--text-muted] mt-2">Your payment has been successfully recorded</p>

            <div className="mt-6 p-4 bg-[--surface-muted] rounded-xl text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[--text-muted]">Amount paid</span>
                <span className="font-bold text-[--green]">{fmt(payAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[--text-muted]">M-Pesa code</span>
                <span className="font-mono font-bold">{payResult.transaction_code}</span>
              </div>
              {payResult.receipt_number && (
                <div className="flex justify-between text-sm">
                  <span className="text-[--text-muted]">Receipt</span>
                  <span className="font-bold">{payResult.receipt_number}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={reset}>Pay another</button>
              <button className="text-xs text-[--brand] hover:underline"
              onClick={() => api.get(`/pdf/receipt/${payResult.id}`, { responseType:'blob' }).then(res => {
                const url = URL.createObjectURL(res.data);
                const a = document.createElement('a');
                a.href = url; a.download = `Receipt-${payResult.receipt_number||payResult.id}.pdf`; a.click();
                URL.revokeObjectURL(url);
              })}>📄 Receipt</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
