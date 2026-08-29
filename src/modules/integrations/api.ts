import {buildEdgeFunctionUrl} from '../../shared/lib/apiClient';
import {USE_MOCK_API, getAuthToken} from '../../shared/lib/runtime';
import {integrationsOverviewFixture} from './fixtures';
import {type IntegrationOverview} from './types';

const efetch = async <T>(path: string, method = 'GET'): Promise<T> => {
  const res = await fetch(buildEdgeFunctionUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

export const getIntegrationsOverview = async (): Promise<IntegrationOverview> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return integrationsOverviewFixture;
  }

  try {
    return await efetch<IntegrationOverview>('/integrations');
  } catch (err) {
    console.warn('integrations_overview not available:', err instanceof Error ? err.message : err);
    return integrationsOverviewFixture;
  }
};