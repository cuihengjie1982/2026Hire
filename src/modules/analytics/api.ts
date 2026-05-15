import {invokeEdgeFunction} from '../../shared/lib/apiClient';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {insightsOverviewFixture} from './fixtures';
import {type InsightsOverview} from './types';

export const getInsightsOverview = async (timeRange = 'all'): Promise<InsightsOverview> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return insightsOverviewFixture;
  }

  return invokeEdgeFunction<InsightsOverview>('analytics', {
    action: 'overview',
    timeRange,
  });
};