import {API_BASE_URL, AUTH_TOKEN_KEY, USE_MOCK_API, SUPABASE_URL, getAuthToken, setAuthToken} from './runtime';
import {supabase} from './supabase';

const REFRESH_TOKEN_KEY = 'em-box.refresh-token';

/**
 * 全局 Token 刷新锁 — 防止并发请求同时触发多次刷新
 * 所有 401 请求共享同一个刷新 Promise，刷新成功后统一重试
 */
let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns new access token on success, null on failure.
 * Uses a global lock to prevent concurrent refresh requests.
 */
async function tryRefreshToken(): Promise<string | null> {
  // 如果已有刷新请求在进行中，复用它
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refreshToken}),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.token) {
        setAuthToken(data.token);
        if (data.refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        }
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      // 刷新完成后释放锁
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Maps Express /api/* paths to Edge Function paths where naming differs.
 * Deployed embox-api uses /outreach, /contacts, /sms-gateway/* (no /api prefix),
 * while shortlist/employees/insights keep /api/* on both sides.
 */
export const resolveEdgeFunctionPath = (apiPath: string): string => {
  const aliases: [string, string][] = [
    ['/api/outreach', '/outreach'],
    ['/api/contacts', '/contacts'],
    ['/api/sms-gateway', '/sms-gateway'],
    ['/api/training', '/training'],
  ];
  for (const [expressPrefix, edgePrefix] of aliases) {
    if (apiPath === expressPrefix || apiPath.startsWith(`${expressPrefix}?`) || apiPath.startsWith(`${expressPrefix}/`)) {
      return edgePrefix + apiPath.slice(expressPrefix.length);
    }
  }
  return apiPath;
};

/** True when URL points at local Express (cannot verify Supabase Auth JWT). */
const isLocalBackendUrl = (url: string): boolean =>
  !url || url.includes('localhost') || url.includes('127.0.0.1');

/**
 * Supabase project URL when API_BASE_URL is local Express; otherwise API_BASE_URL.
 * See docs/LOCAL_DEV_API_ROUTING.md — Express JWT_SECRET ≠ Supabase Auth JWT.
 */
export const resolveCloudBackendUrl = (): string => {
  const base = API_BASE_URL;
  const cloudBase = isLocalBackendUrl(base) ? SUPABASE_URL : base;
  return cloudBase && !isLocalBackendUrl(cloudBase) ? cloudBase : base;
};

/**
 * Build embox-api Edge Function URL for paths that are already Edge-shaped
 * (e.g. `/settings/users/me`, `/agents`, `/stats/sidebar` — no `/api` prefix).
 *
 * Prefer this over `${API_BASE_URL}/functions/v1/embox-api...` so localhost
 * correctly remounts to Supabase. For Express-style `/api/*` paths, use
 * `buildApiUrl` / `fetchJson` instead.
 */
export const buildEdgeFunctionUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveCloudBackendUrl()}/functions/v1/embox-api${normalizedPath}`;
};

/**
 * Resolve a request URL for `fetchJson`.
 * - Absolute `http(s)://...` — returned as-is (base ignored for absolute paths starting with http)
 * - `/functions/...` — prepend cloud backend (localhost → Supabase)
 * - `/api/*` in real mode — rewrite through embox-api when cloud backend is available
 * - otherwise — `${API_BASE_URL}${path}` (Vite proxy / Express local-only)
 */
export const buildApiUrl = (path: string) => {
  const base = API_BASE_URL;
  if (path.startsWith('http')) {
    return path;
  }
  // Already an Edge Function absolute path — remount onto cloud backend when local
  if (path.startsWith('/functions/')) {
    return `${resolveCloudBackendUrl()}${path}`;
  }
  // In real mode, route /api/* through Supabase Edge Function when cloud backend is configured.
  // Login uses Supabase Auth JWT — Express localhost cannot verify those tokens.
  if (!USE_MOCK_API && path.startsWith('/api/')) {
    const cloudBase = resolveCloudBackendUrl();
    if (cloudBase && !isLocalBackendUrl(cloudBase)) {
      return `${cloudBase}/functions/v1/embox-api${resolveEdgeFunctionPath(path)}`;
    }
  }
  return `${base}${path}`;
};

const isFormData = (value: unknown): value is FormData =>
  typeof FormData !== 'undefined' && value instanceof FormData;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getItemsFromPayload = <T>(payload: unknown): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (isRecord(payload) && Array.isArray(payload.items)) {
    return payload.items as T[];
  }

  return [];
};

export const getValueFromPayload = <T>(
  payload: unknown,
  key: string,
): T | null => {
  if (isRecord(payload) && key in payload) {
    return payload[key] as T;
  }

  return (payload as T) ?? null;
};

export const fetchJson = async <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> => {
  // Offline check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('网络连接已断开，请检查网络设置');
  }

  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !isFormData(init.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Auto-attach JWT token
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Configurable timeout (default 30s, AI endpoints should pass 120s+)
  const controller = new AbortController();
  const timeoutMs = (init as { timeoutMs?: number })?.timeoutMs ?? 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接后重试');
    }
    throw new Error('网络请求失败，请检查网络连接');
  }
  clearTimeout(timeoutId);

  // Auto-refresh on token expiry
  if (response.status === 401 && token) {
    let errorData: Record<string, unknown> = {};
    try { errorData = await response.json(); } catch { /* */ }
    const errObj = errorData?.error as Record<string, unknown> | undefined;
    if (errObj?.code === 'TOKEN_EXPIRED' || errObj?.code === 'TOKEN_REVOKED') {
      const newToken = await tryRefreshToken();
      if (newToken) {
        // Retry with new token
        headers.set('Authorization', `Bearer ${newToken}`);
        response = await fetch(buildApiUrl(path), {
          ...init,
          headers,
        });
        if (!response.ok) {
          let retryErrorData: Record<string, unknown> = {};
          try { retryErrorData = await response.json(); } catch { /* */ }
          const msg = (retryErrorData as {error?:{message?:string}})?.error?.message;
          throw new Error(msg || `Request failed: ${response.status}`);
        }
        // Parse the successful retry response
        const retryText = await response.text();
        if (!retryText) return undefined as T;
        return JSON.parse(retryText) as T;
      } else {
        // Refresh failed — force re-login
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem('em-box.authenticated');
        window.location.reload();
        throw new Error('Session expired. Please log in again.');
      }
    }
  }

  if (!response.ok) {
    let errorText = '';
    try { errorText = await response.text(); } catch { /* body already consumed */ }
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();
  if (!responseText) {
    return undefined as T;
  }

  return JSON.parse(responseText) as T;
};

export const mockDelay = async (ms = 120) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

// ---------------------------------------------------------------------------
// In-memory request cache with TTL
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry<unknown>>();

/**
 * Wrap an async function with in-memory caching.
 * Returns cached data if within TTL, otherwise calls the function and caches the result.
 *
 * @param key  Unique cache key (e.g. 'listProjects')
 * @param fn   Async function that fetches data
 * @param ttlMs  Cache duration in ms (default 60s)
 */
export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const entry = requestCache.get(key);
  if (entry && Date.now() - entry.timestamp < ttlMs) {
    return entry.data as T;
  }
  const data = await fn();
  requestCache.set(key, {data, timestamp: Date.now()});
  return data;
}

/** Invalidate one or all cache entries. Call after mutations (create/update/delete). */
export function invalidateCache(key?: string): void {
  if (key) {
    requestCache.delete(key);
  } else {
    requestCache.clear();
  }
}

/**
 * Invoke a Supabase Edge Function by name.
 * Automatically uses the current auth session.
 */
export const invokeEdgeFunction = async <T>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
};
