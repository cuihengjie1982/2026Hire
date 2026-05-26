import {fetchJson, mockDelay} from '../../shared/lib/apiClient';
import {insightsOverviewFixture} from './fixtures';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {type InsightsOverview} from './types';

export const getInsightsOverview = async (timeRange = 'all'): Promise<InsightsOverview> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return insightsOverviewFixture;
  }

  // 后端路由：GET /api/insights/overview?timeRange=xxx
  return fetchJson<InsightsOverview>(
    `/api/insights/overview?timeRange=${encodeURIComponent(timeRange)}`,
  );
};
