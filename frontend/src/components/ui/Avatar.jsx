import { useState } from 'react';

const PALETTE = ['#D97706','#7C3AED','#16A34A','#EA580C','#0D9488','#2563EB','#DB2777'];

export default function Avatar({ name = '', size = 'md', src }) {
  const [err, setErr] = useState(false);

  const dim = { xs: 24, sm: 32, md: 36, lg: 48, xl: 64 }[size] || 36;
  const fs  = { xs: 10, sm: 12, md: 13, lg: 16, xl: 20 }[size] || 13;
  const bg  = PALETTE[(name?.charCodeAt(0) || 0) % PALETTE.length];
  const ini = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  if (src && !err) {
    return (
      <img src={src} alt={name}
        onError={() => setErr(true)}
        style={{ width: dim, height: dim, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--surface)' }}
      />
    );
  }

  return (
    <div style={{
      width: dim, height: dim, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: fs, fontWeight: 700, flexShrink: 0,
      border: '2px solid var(--surface)', letterSpacing: '0.02em',
    }}>
      {ini}
    </div>
  );
}
