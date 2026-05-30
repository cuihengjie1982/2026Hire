import {useEffect, useState} from 'react';
import {AppRouter} from './app/router/AppRouter';
import {LoginPage} from './modules/auth/pages/LoginPage';
import {AUTH_SESSION_STORAGE_KEY, removeUserName, setAuthToken} from './shared/lib/runtime';
import {supabase} from './shared/lib/supabase';
import {ErrorBoundary} from './shared/components/ErrorBoundary';
import {ToastProvider} from './shared/components/ToastProvider';
import {NotificationProvider} from './shared/components/NotificationProvider';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    }).catch(() => {
      setIsAuthenticated(false);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || isAuthenticated === null) return;
    if (isAuthenticated) {
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  }, [isAuthenticated]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setAuthToken(session.access_token);
      }
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    removeUserName();
    setIsAuthenticated(false);
  };

  // Keep JWT in sync with Supabase auth session (fixes 401 on Edge Function calls)
  useEffect(() => {
    const handler = () => {
      supabase.auth.refreshSession().then(({data}) => {
        if (data.session?.access_token) {
          setAuthToken(data.session.access_token);
        } else {
          // Token refresh failed — redirect to login
          handleLogout();
        }
      });
    };
    window.addEventListener('auth:token-expired', handler);
    return () => window.removeEventListener('auth:token-expired', handler);
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c2b7a]">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {isAuthenticated ? (
        <ToastProvider>
          <NotificationProvider>
            <AppRouter onLogout={handleLogout} />
          </NotificationProvider>
        </ToastProvider>
      ) : (
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      )}
    </ErrorBoundary>
  );
}
