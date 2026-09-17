import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHome } from '../utils/helpers';

export default function NotFound() {
  const { user } = useAuth() || {};
  const navigate  = useNavigate();
  const home      = roleHome(user?.role) || '/login';

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-white/20 mb-4">404</div>
        <div className="text-5xl mb-4">🏚️</div>
        <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-brand-300 mb-8">
          The page you're looking for doesn't exist or you don't have access to it.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(-1)} className="btn-secondary">
            ← Go back
          </button>
          <Link to={home} className="btn-primary">
            🏠 Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
