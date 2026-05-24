import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {insightsOverviewFixture} from './fixtures';
import {type InsightsOverview} from './types';

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

export const getInsightsOverview = async (timeRange = 'all'): Promise<InsightsOverview> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return insightsOverviewFixture;
  }

  return efetch<InsightsOverview>(`/analytics/overview?timeRange=${encodeURIComponent(timeRange)}`);
};
