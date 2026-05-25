import {useEffect, useState} from 'react';
import {AppRouter} from './app/router/AppRouter';
import {LoginPage} from './modules/auth/pages/LoginPage';
import {AUTH_SESSION_STORAGE_KEY, AUTH_TOKEN_KEY, removeUserName, setAuthToken} from './shared/lib/runtime';
import {supabase} from './shared/lib/supabase';
import {ErrorBoundary} from './shared/components/ErrorBoundary';
import {ToastProvider} from './shared/components/ToastProvider';
import {NotificationProvider} from './shared/components/NotificationProvider';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      setIsAuthenticated(!!data.session);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
