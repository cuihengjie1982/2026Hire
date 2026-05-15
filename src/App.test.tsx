import type {ReactNode} from 'react';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import App from './App';
import {AUTH_SESSION_STORAGE_KEY} from './shared/lib/runtime';

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

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders login page when no persisted session exists', () => {
    render(<App />);

    expect(screen.getByText('mock-login')).toBeInTheDocument();
    expect(screen.queryByText('mock-router')).not.toBeInTheDocument();
  });

  it('restores authenticated shell from localStorage', () => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'true');
    // App also requires a valid auth token to restore the shell
    localStorage.setItem('em-box.auth-token', 'mock-jwt-token');

    render(<App />);

    expect(screen.getByText('mock-router')).toBeInTheDocument();
    expect(screen.queryByText('mock-login')).not.toBeInTheDocument();
  });
});
