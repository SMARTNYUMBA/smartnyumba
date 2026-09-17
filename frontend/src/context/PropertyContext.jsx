/**
 * PropertyContext — Global property filter
 *
 * Provides a single propertyId string that is shared across all pages
 * and the PropertySelector component in the topbar. Pages that accept a
 * property_id query param simply read from this context instead of
 * maintaining their own local state.
 *
 * Usage:
 *   const { propertyId, setPropertyId } = useProperty();
 *
 * Wrap your app with <PropertyProvider> in App.jsx (inside AuthProvider).
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const PropertyContext = createContext({ propertyId: '', setPropertyId: () => {} });

export function PropertyProvider({ children }) {
  const { user } = useAuth() || {};

  // Initialise from sessionStorage so the filter survives page refreshes
  // but resets when the tab is closed
  const [propertyId, _setPropertyId] = useState(() => {
    try {
      return sessionStorage.getItem('snp_property_id') || '';
    } catch {
      return '';
    }
  });

  const setPropertyId = (id) => {
    _setPropertyId(id);
    try {
      if (id) sessionStorage.setItem('snp_property_id', id);
      else     sessionStorage.removeItem('snp_property_id');
    } catch { /* ignore quota errors */ }
  };

  // When the logged-in user changes (logout / login as different role),
  // reset the stored filter so a caretaker's property doesn't bleed into
  // an admin session.
  useEffect(() => {
    if (!user) {
      setPropertyId('');
    } else if (user.property_id && !propertyId) {
      // Caretaker / security: auto-scope to their assigned property
      const scoped = ['caretaker', 'security'];
      if (scoped.includes(user.role)) {
        setPropertyId(String(user.property_id));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <PropertyContext.Provider value={{ propertyId, setPropertyId }}>
      {children}
    </PropertyContext.Provider>
  );
}

export const useProperty = () => useContext(PropertyContext);
