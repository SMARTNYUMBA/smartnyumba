export default function Spinner({ size = 'md' }) {
  const dim = { sm: 16, md: 32, lg: 48 }[size] || 32;
  const bw  = size === 'sm' ? 2 : 3;
  return (
    <div style={{
      width: dim, height: dim, borderRadius: '50%',
      border: `${bw}px solid var(--border)`,
      borderTopColor: 'var(--brand)',
    }} className="animate-spin" />
  );
}

export function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Spinner size="md" />
    </div>
  );
}
