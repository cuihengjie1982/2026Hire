// Supabase configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Legacy API base URL (kept for backward compatibility during migration)
// In production (USE_MOCK_API=false), default to Supabase URL instead of localhost
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ?? (import.meta.env.VITE_USE_MOCK_API === 'false' ? SUPABASE_URL : 'http://localhost:4000');

export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false';

export const AUTH_SESSION_STORAGE_KEY = 'em-box.authenticated';
export const AUTH_TOKEN_KEY = 'em-box.auth-token';
export const USER_NAME_STORAGE_KEY = 'em-box.user-name';
export const SELECTED_PROJECT_STORAGE_KEY = 'em-box.selected-project-id';

export function getAuthToken(): string | null {
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}

export function setAuthToken(token: string) {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch { /* noop */ }
}

export function removeAuthToken() {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* noop */ }
}

export function setUserName(name: string) {
  try { localStorage.setItem(USER_NAME_STORAGE_KEY, name); } catch { /* noop */ }
}

export function getUserName(): string | null {
  try { return localStorage.getItem(USER_NAME_STORAGE_KEY); } catch { return null; }
}

export function removeUserName() {
  try { localStorage.removeItem(USER_NAME_STORAGE_KEY); } catch { /* noop */ }
}
