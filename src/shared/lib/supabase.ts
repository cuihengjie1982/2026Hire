import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Lazy initialization to avoid build-time errors when env vars aren't set yet
let _supabase: ReturnType<typeof createClient> | null = null;

export const getSupabase = () => {
  if (!_supabase) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase environment variables are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
};

// Check if Supabase is configured (env vars present)
const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Alias for backward compatibility — lazily initialized
// When env vars are missing, returns a mock that simulates no active session
// so the app can run in local/mock mode without Supabase.
export const supabase = isSupabaseConfigured
  ? (new Proxy({} as ReturnType<typeof createClient>, {
      get(_target, prop) {
        return getSupabase()[prop as keyof ReturnType<typeof createClient>];
      },
    }))
  : (new Proxy({} as ReturnType<typeof createClient>, {
      get(_target, prop) {
        // Mock auth methods for local development without Supabase
        if (prop === 'auth') {
          return {
            getSession: async () => ({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
            signOut: async () => ({}),
          };
        }
        return undefined;
      },
    }));
