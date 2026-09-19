import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { tokenStore } from '../api';

/**
 * useSSE
 *
 * Authenticated Server-Sent Events connection.
 * Uses fetchEventSource so the JWT can be sent in
 * the Authorization header.
 */
export default function useSSE() {
  const qc = useQueryClient();

  const controllerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const retriesRef = useRef(0);

  const MAX_RETRIES = 8;

  const connect = useCallback(async () => {
    // Close previous connection
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }

    // Cancel previous reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const token = tokenStore.getAccess();

    // No login token yet.
    // Check again shortly so SSE can start after login.
    if (!token) {
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 2000);

      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    const apiUrl = import.meta.env.VITE_API_URL || '';

    const url = `${apiUrl}/api/events`;

    try {
      await fetchEventSource(url, {
        method: 'GET',

        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },

        credentials: 'include',

        signal: controller.signal,

        openWhenHidden: true,

        async onopen(response) {
          if (response.status === 401) {
            throw new Error('SSE authentication failed');
          }

          if (!response.ok) {
            throw new Error(
              `SSE connection failed: ${response.status} ${response.statusText}`
            );
          }

          const contentType =
            response.headers.get('content-type') || '';

          if (!contentType.includes('text/event-stream')) {
            throw new Error(
              `Expected text/event-stream but received ${contentType}`
            );
          }

          // Connected successfully
          retriesRef.current = 0;
        },

        onmessage(event) {
          let message;

          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }

          const { type, payload: data } = message;

          switch (type) {
            case 'connected':
              console.log('Smart Nyumba SSE connected');
              break;

            case 'notification':
              qc.invalidateQueries({
                queryKey: ['notifications'],
              });

              if (data?.message) {
                toast(data.message, {
                  icon: '🔔',
                });
              }
              break;

            case 'message':
              qc.invalidateQueries({
                queryKey: ['messages'],
              });
              break;

            case 'payment_confirmed':
              qc.invalidateQueries({
                queryKey: ['invoices'],
              });

              qc.invalidateQueries({
                queryKey: ['payments'],
              });

              toast.success(
                `Payment confirmed! Receipt: ${
                  data?.receipt_number || ''
                }`
              );

              window.dispatchEvent(
                new CustomEvent('payment_confirmed', {
                  detail: data,
                })
              );

              break;

            case 'maintenance_update':
              qc.invalidateQueries({
                queryKey: ['maintenance'],
              });
              break;

            case 'announcement':
              qc.invalidateQueries({
                queryKey: ['announcements'],
              });

              toast(data?.title || 'New announcement', {
                icon: '📢',
              });

              break;

            case 'lease_expiring':
              qc.invalidateQueries({
                queryKey: ['tenancies'],
              });
              break;

            default:
              break;
          }
        },

        onclose() {
          if (controller.signal.aborted) {
            return;
          }

          scheduleReconnect();
        },

        onerror(error) {
          if (controller.signal.aborted) {
            return;
          }

          throw error;
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      console.warn('SSE connection lost:', error?.message || error);

      scheduleReconnect();
    }

    function scheduleReconnect() {
      if (controller.signal.aborted) {
        return;
      }

      if (retriesRef.current >= MAX_RETRIES) {
        console.warn('SSE maximum reconnect attempts reached');
        return;
      }

      const delay = Math.min(
        1000 * Math.pow(2, retriesRef.current),
        30000
      );

      retriesRef.current += 1;

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    }
  }, [qc]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, [connect]);
}