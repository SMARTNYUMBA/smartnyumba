import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * useSSE — replaces all setInterval/refetchInterval polling.
 * Opens one persistent SSE connection and invalidates the right
 * TanStack Query caches when the server pushes an event.
 *
 * Automatically reconnects with exponential backoff on disconnect.
 */
export default function useSSE() {
  const qc      = useQueryClient();
  const esRef   = useRef(null);
  const retries = useRef(0);
  const MAX_RETRIES = 8;

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const es = new EventSource('/api/events', { withCredentials: true });
    esRef.current = es;

    es.onopen = () => { retries.current = 0; };

    es.onmessage = (e) => {
      let payload;
      try { payload = JSON.parse(e.data); } catch { return; }
      const { type, payload: data } = payload;

      switch (type) {
        case 'notification':
          qc.invalidateQueries({ queryKey: ['notifications'] });
          if (data?.message) toast(data.message, { icon: '🔔' });
          break;
        case 'message':
          qc.invalidateQueries({ queryKey: ['messages'] });
          break;
        case 'payment_confirmed':
          qc.invalidateQueries({ queryKey: ['invoices'] });
          qc.invalidateQueries({ queryKey: ['payments'] });
          toast.success(`Payment confirmed! Receipt: ${data?.receipt_number || ''}`);
          // Dispatch custom event for STK polling components to stop
          window.dispatchEvent(new CustomEvent('payment_confirmed', { detail: data }));
          break;
        case 'maintenance_update':
          qc.invalidateQueries({ queryKey: ['maintenance'] });
          break;
        case 'announcement':
          qc.invalidateQueries({ queryKey: ['announcements'] });
          toast(data?.title || 'New announcement', { icon: '📢' });
          break;
        case 'lease_expiring':
          qc.invalidateQueries({ queryKey: ['tenancies'] });
          break;
        default:
          break;
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (retries.current >= MAX_RETRIES) return;
      const delay = Math.min(1000 * Math.pow(2, retries.current), 30000);
      retries.current++;
      setTimeout(connect, delay);
    };
  }, [qc]);

  useEffect(() => {
    connect();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [connect]);
}
