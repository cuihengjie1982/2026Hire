import type {ReactNode} from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import App from './App';

vi.mock('./modules/auth/pages/LoginPage', () => ({
  LoginPage: ({onLogin}: {onLogin: () => void}) => (
    <button onClick={onLogin}>mock-login</button>
  ),
}));

vi.mock('./app/router/AppRouter', () => ({
  AppRouter: ({onLogout}: {onLogout: () => void}) => (
    <button onClick={onLogout}>mock-router</button>
  ),
}));

vi.mock('./shared/components/ErrorBoundary', () => ({
  ErrorBoundary: ({children}: {children: ReactNode}) => <>{children}</>,
}));

vi.mock('./shared/components/ToastProvider', () => ({
  ToastProvider: ({children}: {children: ReactNode}) => <>{children}</>,
}));

vi.mock('./shared/components/NotificationProvider', () => ({
  NotificationProvider: ({children}: {children: ReactNode}) => <>{children}</>,
}));

// Mock supabase to control auth state
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock('./shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    },
  },
}));

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    localStorage.clear();
    vi.clearAllMocks();
    // Default: not authenticated
    mockGetSession.mockResolvedValue({data: {session: null}});
    mockOnAuthStateChange.mockReturnValue({data: {subscription: {unsubscribe: vi.fn()}}});
    mockRefreshSession.mockResolvedValue({data: {session: null}});
  });

  it('renders login page when no persisted session exists', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('mock-login')).toBeInTheDocument();
    });
    expect(screen.queryByText('mock-router')).not.toBeInTheDocument();
  });

  it('restores authenticated shell when session exists', async () => {
    mockGetSession.mockResolvedValue({data: {session: {access_token: 'mock-jwt-token'}}});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('mock-router')).toBeInTheDocument();
    });
    expect(screen.queryByText('mock-login')).not.toBeInTheDocument();
  });

  it('allows public training video route without login', async () => {
    window.history.pushState({}, '', '/training/videos/watch?courseId=c1&token=public-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('mock-router')).toBeInTheDocument();
    });
    expect(screen.queryByText('mock-login')).not.toBeInTheDocument();
  });

  it('allows public short training video route without login', async () => {
    window.history.pushState({}, '', '/tv/c1/public-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('mock-router')).toBeInTheDocument();
    });
    expect(screen.queryByText('mock-login')).not.toBeInTheDocument();
  });
});
