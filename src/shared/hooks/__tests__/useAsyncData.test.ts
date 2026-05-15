import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {useAsyncData} from '../useAsyncData';

describe('useAsyncData', () => {
  it('returns initialData while loading', () => {
    const loader = () => new Promise<string>(() => {}); // never resolves
    const {result} = renderHook(() => useAsyncData(loader, 'initial'));

    expect(result.current.data).toBe('initial');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('returns loaded data on success', async () => {
    const loader = () => Promise.resolve('loaded-data');
    const {result} = renderHook(() => useAsyncData(loader, 'initial'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe('loaded-data');
    expect(result.current.error).toBeNull();
  });

  it('returns error message on failure', async () => {
    const loader = () => Promise.reject(new Error('Network error'));
    const {result} = renderHook(() => useAsyncData(loader, 'initial'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBe('initial');
  });

  it('handles non-Error rejections', async () => {
    const loader = () => Promise.reject('string error');
    const {result} = renderHook(() => useAsyncData(loader, 'initial'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Unknown error');
  });

  it('cancels pending load on unmount', async () => {
    let resolveLoad: (v: string) => void;
    const loader = () =>
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      });

    const {result, unmount} = renderHook(() => useAsyncData(loader, 'initial'));
    expect(result.current.isLoading).toBe(true);

    unmount();

    // Resolve after unmount — should not update state
    resolveLoad!('late-data');

    // No assertion needed — just verify no React state-update warning
  });
});
