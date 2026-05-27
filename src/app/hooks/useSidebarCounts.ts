import {useCallback, useEffect, useState} from 'react';
import {fetchJson} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';

export interface SidebarCounts {
  runningAgents: number;
  shortlistCount: number;
  pendingApprovals: number;
  totalCandidates: number;
}

const EMPTY_COUNTS: SidebarCounts = {
  runningAgents: 0,
  shortlistCount: 0,
  pendingApprovals: 0,
  totalCandidates: 0,
};

// In-memory cache: 30 seconds TTL
let cachedCounts: SidebarCounts = EMPTY_COUNTS;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000;

export const useSidebarCounts = () => {
  const [counts, setCounts] = useState<SidebarCounts>(cachedCounts);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (force = false) => {
    // Return cache if fresh
    if (!force && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL) {
      setCounts(cachedCounts);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (USE_MOCK_API) {
        // Mock: return plausible counts
        const c: SidebarCounts = {
          runningAgents: Math.floor(Math.random() * 3),
          shortlistCount: Math.floor(Math.random() * 20),
          pendingApprovals: Math.floor(Math.random() * 5),
          totalCandidates: 0,
        };
        cachedCounts = c;
        cacheTimestamp = Date.now();
        setCounts(c);
      } else {
        const base = API_BASE_URL;
        const resp = await fetch(`${base}/api/stats/sidebar`, {
          headers: {'Authorization': `Bearer ${getAuthToken() ?? ''}`},
        });
        if (resp.ok) {
          const data = await resp.json() as SidebarCounts;
          cachedCounts = data;
          cacheTimestamp = Date.now();
          setCounts(data);
        }
      }
    } catch (e) {
      console.error('Failed to load sidebar counts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {counts, loading, refresh};
};
