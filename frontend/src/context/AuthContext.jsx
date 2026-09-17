import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, getMyTenancy, tokenStore } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => tokenStore.getUser());
  const [loading, setLoading] = useState(true);

  /**
   * Fetch the freshest user data from /auth/me, merge tenant tenancy info.
   * Called on mount and after login.
   */
  const refreshUser = useCallback(async () => {
    const token = tokenStore.getAccess();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await getMe();
      let userData = data.user;

      // For tenants: merge live tenancy data so rent_amount, unit, property are always fresh
      if (userData.role === 'tenant') {
        try {
          const { data: td } = await getMyTenancy();
          if (td?.tenancy) {
            userData = {
              ...userData,
              profile: {
                ...(userData.profile || {}),
                tenancy_id:       td.tenancy.id,
                rent_amount:      td.tenancy.rent_amount,
                payment_plan:     td.tenancy.payment_plan,
                grace_period_days:td.tenancy.grace_period_days,
                start_date:       td.tenancy.start_date,
                end_date:         td.tenancy.end_date,
                deposit:          td.tenancy.deposit,
                unit_id:          td.tenancy.unit_id,
                unit_number:      td.tenancy.unit_number,
                property_id:      td.tenancy.property_id,
                property_name:    td.tenancy.property_name,
                property_address: td.tenancy.property_address,
                manager_name:     td.tenancy.manager_name,
                manager_phone:    td.tenancy.manager_phone,
                manager_email:    td.tenancy.manager_email,
                tenancy_status:   td.tenancy.status,
              },
            };
          }
        } catch (_) {
          // Tenancy fetch failure is non-fatal — tenant may not yet have one
        }
      }

      setUser(userData);
      tokenStore.setUser(userData);
    } catch (e) {
      // Only clear session on 401 (unauthorized) — not on network errors or 500s
      // The axios interceptor handles 401 token refresh; we only clear if it propagates here
      if (e?.response?.status === 401 || e?.status === 401) {
        tokenStore.clear();
        setUser(null);
      }
      // For 500/network errors: keep the user logged in with cached data
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  /**
   * Called after a successful login API response.
   * Stores tokens, sets user state, then fetches fresh data.
   */
  const signIn = useCallback((data) => {
    tokenStore.setAccess(data.access_token);
    tokenStore.setRefresh(data.refresh_token);
    tokenStore.setUser(data.user);
    setUser(data.user);
    setLoading(false);   // unblock ProtectedRoute immediately
    // Refresh in background to get freshest data (non-blocking)
    setTimeout(refreshUser, 100);
  }, [refreshUser]);

  /**
   * Called on logout button press.
   * Clears all stored state.
   */
  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Convenience: tenant's profile fields
  const profile = user?.profile || {};

  // ── PWA Push Notification Permission ─────────────────────────────────────
  const requestNotificationPermission = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    // Request after user has been active for 3 seconds (not immediately on login)
    setTimeout(async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('SmartNyumba: Push notifications enabled');
      }
    }, 3000);
  };

  // Request permission once user is logged in
  useEffect(() => {
    if (user && 'Notification' in window && Notification.permission === 'default') {
      requestNotificationPermission();
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signOut,
      refreshUser,
    }}>
      {/* Block render until we know auth status — prevents flash of login page */}
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};