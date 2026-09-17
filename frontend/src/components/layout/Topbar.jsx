import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLang } from '../../context/LanguageContext';
import NotificationBell from '../ui/NotificationBell';
import { roleName } from '../../utils/helpers';
import api from '../../api';

const TYPE_ICON = {
  tenant: '👤', unit: '🏠', property: '🏢',
  invoice: '🧾', maintenance: '🔧', vendor: '🔨',
};

export default function Topbar({ title, actions, onMenuClick }) {
  const { user }                     = useAuth() || {};
  const { dark, toggle: toggleDark } = useTheme();
  const { lang, toggle: toggleLang } = useLang();
  const navigate                     = useNavigate();

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef             = useRef(null);
  const timerRef              = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/search', { params: { q } });
      setResults(data.results || []);
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const onChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(q), 280);
  };

  const pick = (url) => { navigate(url); setQuery(''); setOpen(false); setResults([]); };

  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <header
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
      className="flex items-center gap-4 px-5 flex-shrink-0 z-20">

      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 flex flex-col gap-1.5 items-center justify-center flex-shrink-0"
        aria-label="Open menu">
        <span style={{ background: 'var(--text-primary)' }} className="w-5 h-0.5 rounded" />
        <span style={{ background: 'var(--text-primary)' }} className="w-4 h-0.5 rounded" />
        <span style={{ background: 'var(--text-primary)' }} className="w-5 h-0.5 rounded" />
      </button>

      {/* Page title */}
      <h1
        style={{ fontFamily: 'Fraunces, Georgia, serif', color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.02em' }}
        className="flex-shrink-0 hidden sm:block">
        {title}
      </h1>

      {/* Search */}
      <div className="flex-1 max-w-sm relative" ref={searchRef}>
        <div style={{ background: 'var(--surface-muted)', borderRadius: 10, border: '1px solid var(--border)' }}
          className="flex items-center gap-2 px-3 py-1.5">
          <svg viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--text-muted)', width: 15, height: 15, flexShrink: 0 }}>
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={onChange}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Search tenants, units, invoices…"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-primary)', width: '100%' }}
            className="placeholder:text-[--text-muted]"
          />
          {loading && (
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }} className="flex-shrink-0">…</span>
          )}
        </div>

        {/* Dropdown */}
        {open && results.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
            className="absolute top-full mt-2 left-0 right-0 z-50 overflow-hidden animate-fade-in">
            {results.map((r, i) => (
              <button key={i} onClick={() => pick(r.url)}
                style={{ borderBottom: i < results.length-1 ? '1px solid var(--border)' : 'none' }}
                className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span className="text-base flex-shrink-0">{TYPE_ICON[r.type] || '📄'}</span>
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }} className="truncate">{r.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }} className="truncate">{r.subtitle}</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.type}</span>
              </button>
            ))}
          </div>
        )}
        {open && query.length >= 2 && results.length === 0 && !loading && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem 1rem', fontSize: 13, color: 'var(--text-muted)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
            className="absolute top-full mt-2 left-0 right-0 z-50 animate-fade-in text-center">
            No results for "{query}"
          </div>
        )}
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        <NotificationBell />

        {/* Lang toggle */}
        <button onClick={toggleLang}
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, padding: '0.3rem 0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}
          className="transition-colors hover:border-[--brand] hover:text-[--brand]"
          title={lang === 'en' ? 'Switch to Swahili' : 'Switch to English'}>
          {lang === 'en' ? 'SW' : 'EN'}
        </button>

        {/* Dark mode toggle */}
        <button onClick={toggleDark}
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32 }}
          className="flex items-center justify-center transition-all hover:border-[--brand]"
          title={dark ? 'Light mode' : 'Dark mode'}>
          {dark
            ? <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14, color: 'var(--brand)' }}><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
            : <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14, color: 'var(--text-secondary)' }}><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
          }
        </button>

        {/* User chip */}
        <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '0.75rem', marginLeft: 4 }}
          className="flex items-center gap-2">
          <div style={{ background: 'var(--brand)', width: 30, height: 30, borderRadius: '50%', fontSize: 12, color: 'white', fontWeight: 700 }}
            className="flex items-center justify-center flex-shrink-0">
            {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="hidden sm:block min-w-0">
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }} className="truncate max-w-[120px]">
              {user?.full_name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roleName(user?.role)}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
