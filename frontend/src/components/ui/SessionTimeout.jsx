import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const IDLE_MINUTES   = 30;  // warn after 30 min idle
const WARNING_SECONDS = 60; // give 60s to respond before logout

export default function SessionTimeout() {
  const { user, signOut } = useAuth() || {};
  const navigate          = useNavigate();
  const [warning, setWarning]   = useState(false);
  const [countdown, setCountdown] = useState(WARNING_SECONDS);
  const idleTimer   = useRef(null);
  const countTimer  = useRef(null);

  const resetIdle = useCallback(() => {
    if (!user) return;
    clearTimeout(idleTimer.current);
    clearInterval(countTimer.current);
    setWarning(false);
    setCountdown(WARNING_SECONDS);
    idleTimer.current = setTimeout(() => {
      setWarning(true);
      setCountdown(WARNING_SECONDS);
      countTimer.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(countTimer.current);
            signOut && signOut();
            navigate('/login', { replace: true });
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, IDLE_MINUTES * 60 * 1000);
  }, [user, signOut, navigate]);

  const stayActive = () => {
    clearInterval(countTimer.current);
    setWarning(false);
    resetIdle();
  };

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown','keydown','touchstart','scroll','mousemove'];
    events.forEach(e => document.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      events.forEach(e => document.removeEventListener(e, resetIdle));
      clearTimeout(idleTimer.current);
      clearInterval(countTimer.current);
    };
  }, [user, resetIdle]);

  if (!warning || !user) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center animate-fade-in">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">⏰</div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Session expiring</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">
          You've been inactive. You will be signed out in:
        </p>
        <p className="text-4xl font-bold text-amber-500 my-4">{countdown}s</p>
        <div className="flex gap-3">
          <button
            onClick={() => { signOut && signOut(); navigate('/login', { replace: true }); }}
            className="btn-secondary flex-1">
            Sign out now
          </button>
          <button onClick={stayActive} className="btn-primary flex-1">
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
