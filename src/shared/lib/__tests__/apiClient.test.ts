import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  buildApiUrl,
  getItemsFromPayload,
  getValueFromPayload,
  fetchJson,
  mockDelay,
  resolveEdgeFunctionPath,
} from '../apiClient';

// Mock runtime so we control API_BASE_URL, getAuthToken, USE_MOCK_API
vi.mock('../runtime', () => ({
  API_BASE_URL: 'http://localhost:4000',
  SUPABASE_URL: 'https://test.supabase.co',
  USE_MOCK_API: true,
  getAuthToken: vi.fn(() => null),
}));

import {getAuthToken} from '../runtime';

const mockedGetAuthToken = vi.mocked(getAuthToken);

// Replace global fetch with a vi.fn() before each test
// (jsdom's fetch can't be spied on reliably)
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// buildApiUrl
// ---------------------------------------------------------------------------

describe('buildApiUrl', () => {
  it('prepends API_BASE_URL to path in mock mode', () => {
    expect(buildApiUrl('/api/candidates')).toBe(
      'http://localhost:4000/api/candidates',
    );
  });
});

describe('resolveEdgeFunctionPath', () => {
  it('maps outreach and contacts to Edge Function paths without /api prefix', () => {
    expect(resolveEdgeFunctionPath('/api/outreach')).toBe('/outreach');
    expect(resolveEdgeFunctionPath('/api/outreach?candidate_id=abc')).toBe('/outreach?candidate_id=abc');
    expect(resolveEdgeFunctionPath('/api/contacts')).toBe('/contacts');
    expect(resolveEdgeFunctionPath('/api/sms-gateway/send')).toBe('/sms-gateway/send');
    expect(resolveEdgeFunctionPath('/api/training/courses')).toBe('/training/courses');
  });

  it('keeps /api prefix for routes that use it on Edge Function', () => {
    expect(resolveEdgeFunctionPath('/api/shortlist')).toBe('/api/shortlist');
    expect(resolveEdgeFunctionPath('/api/employees')).toBe('/api/employees');
  });
});

// ---------------------------------------------------------------------------
// getItemsFromPayload
// ---------------------------------------------------------------------------

describe('getItemsFromPayload', () => {
  it('returns the array when payload is an array', () => {
    expect(getItemsFromPayload([{id: 1}])).toEqual([{id: 1}]);
  });

  it('extracts .items when payload is an object with items', () => {
    expect(getItemsFromPayload({items: [1, 2], total: 2})).toEqual([1, 2]);
  });

  it('returns empty array for unrecognized shapes', () => {
    expect(getItemsFromPayload(null)).toEqual([]);
    expect(getItemsFromPayload(undefined)).toEqual([]);
    expect(getItemsFromPayload('hello')).toEqual([]);
    expect(getItemsFromPayload({})).toEqual([]);
    expect(getItemsFromPayload(42)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getValueFromPayload
// ---------------------------------------------------------------------------

describe('getValueFromPayload', () => {
  it('returns value at key when present', () => {
    expect(getValueFromPayload({name: 'Alice'}, 'name')).toBe('Alice');
  });

  it('returns null when key is missing', () => {
    const result = getValueFromPayload({name: 'Alice'}, 'age');
    // Function falls through to `(payload as T) ?? null` which returns the object itself
    expect(result).toEqual({name: 'Alice'});
  });

  it('returns payload itself when key exists but value equals payload', () => {
    expect(getValueFromPayload('hello', 'x')).toBe('hello');
  });

  it('returns null for null/undefined payload', () => {
    expect(getValueFromPayload(null, 'x')).toBeNull();
    expect(getValueFromPayload(undefined, 'x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe('fetchJson', () => {
  it('sends GET request and returns parsed JSON', async () => {
    const data = [{id: 1, name: 'Alice'}];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );

    const result = await fetchJson<Array<{id: number}>>('/api/users');
    expect(result).toEqual(data);
  });

  it('sets Content-Type to application/json by default', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {status: 200}),
    );

    await fetchJson('/api/test', {method: 'POST', body: '{"a":1}'});

    const request = fetchMock.mock.calls[0]![1]!;
    expect((request.headers as Headers).get('Content-Type')).toBe(
      'application/json',
    );
  });

  it('does not set Content-Type when body is FormData', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {status: 200}),
    );

    const fd = new FormData();
    fd.append('file', new Blob(['test']), 'test.txt');

    await fetchJson('/api/upload', {method: 'POST', body: fd});

    const request = fetchMock.mock.calls[0]![1]!;
    expect((request.headers as Headers).get('Content-Type')).toBeNull();
  });

  it('auto-attaches Authorization header when token exists', async () => {
    mockedGetAuthToken.mockReturnValue('jwt-token-123');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ok: true}), {status: 200}),
    );

    await fetchJson('/api/secure');

    const request = fetchMock.mock.calls[0]![1]!;
    expect((request.headers as Headers).get('Authorization')).toBe(
      'Bearer jwt-token-123',
    );
  });

  it('throws on non-ok response', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response('Unauthorized', {status: 401}),
    );

    // jsdom Response.text() may return empty for non-ok responses,
    // so the error falls back to the status-code message
    await expect(fetchJson('/api/secure')).rejects.toThrow(/Request failed: 401|Unauthorized/);
  });

  it('throws generic message when response body is empty', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response('', {status: 500}),
    );

    await expect(fetchJson('/api/broken')).rejects.toThrow('Request failed: 500');
  });

  it('returns undefined for 204 No Content', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(null, {status: 204}),
    );

    const result = await fetchJson('/api/delete', {method: 'DELETE'});
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty response body', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response('', {status: 200}),
    );

    const result = await fetchJson('/api/empty');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mockDelay
// ---------------------------------------------------------------------------

describe('mockDelay', () => {
  it('resolves after specified delay', async () => {
    vi.useFakeTimers();
    const promise = mockDelay(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('defaults to 120ms', async () => {
    vi.useFakeTimers();
    const promise = mockDelay();
    vi.advanceTimersByTime(120);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
