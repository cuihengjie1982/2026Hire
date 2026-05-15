import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  AUTH_TOKEN_KEY,
  AUTH_SESSION_STORAGE_KEY,
} from '../runtime';

describe('runtime', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AUTH_TOKEN_KEY / AUTH_SESSION_STORAGE_KEY', () => {
    it('exports consistent storage key constants', () => {
      expect(AUTH_TOKEN_KEY).toBe('em-box.auth-token');
      expect(AUTH_SESSION_STORAGE_KEY).toBe('em-box.authenticated');
    });
  });

  describe('getAuthToken', () => {
    it('returns null when no token is stored', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('returns the stored token', () => {
      localStorage.setItem(AUTH_TOKEN_KEY, 'jwt-abc-123');
      expect(getAuthToken()).toBe('jwt-abc-123');
    });

    it('returns null when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('setAuthToken', () => {
    it('stores the token in localStorage', () => {
      setAuthToken('my-jwt-token');
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('my-jwt-token');
    });

    it('does not throw when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => setAuthToken('token')).not.toThrow();
    });
  });

  describe('removeAuthToken', () => {
    it('removes the token from localStorage', () => {
      localStorage.setItem(AUTH_TOKEN_KEY, 'jwt-abc-123');
      removeAuthToken();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    });

    it('does not throw when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });
      expect(() => removeAuthToken()).not.toThrow();
    });
  });
});
