import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar  from './Topbar';

export default function AppLayout({ title, actions, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-muted)' }}>

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main column */}
      {/* BUG FIX: the inline `marginLeft: var(--sidebar-w)` below always
          wins over the `ml-0 lg:ml-[--sidebar-w]` className — inline
          styles beat any CSS class regardless of breakpoint. The
          Sidebar itself is correctly built as an off-canvas drawer on
          mobile (fixed position, translated fully off-screen, so it
          takes no layout space) — but this wrapper was still reserving
          the full sidebar width as a permanent left margin on every
          screen size, squeezing all page content on every single mobile
          page in the app into whatever narrow space was left over.
          Moving the margin entirely into the className lets the lg:
          breakpoint actually take effect. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100vh', overflow: 'hidden' }}
        className="ml-0 lg:ml-[--sidebar-w]">

        <Topbar title={title} actions={actions} onMenuClick={() => setSidebarOpen(true)} />

        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ padding: '1.5rem', maxWidth: 1400 }}>
            {children}
          </div>
        </main>

      </div>
    </div>
  );
}
