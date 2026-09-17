import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_HOMES = {
  super_admin:      '/admin',
  property_manager: '/manager',
  tenant:           '/tenant',
  owner:            '/owner',
  security:         '/security',
  caretaker:        '/caretaker',
};

export default function Unauthorized() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const home = user ? (ROLE_HOMES[user.role] || '/login') : '/login';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'var(--color-background-tertiary)',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 420,
        background: 'var(--color-background-primary)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 16,
        padding: '2.5rem 2rem',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h1 style={{
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          margin: '0 0 8px',
        }}>
          Access denied
        </h1>
        <p style={{
          fontSize: 14,
          color: 'var(--color-text-secondary)',
          margin: '0 0 24px',
          lineHeight: 1.6,
        }}>
          You don't have permission to view this page.
          {user && (
            <> Your account role is <strong>{user.role?.replace(/_/g, ' ')}</strong>.</>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(home)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--color-text-info)',
              color: '#fff',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Go to my dashboard
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid var(--color-border-secondary)',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}