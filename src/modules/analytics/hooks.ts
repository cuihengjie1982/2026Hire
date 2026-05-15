import {useCallback} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {getInsightsOverview} from './api';
import {insightsOverviewFixture} from './fixtures';
import {type InsightsOverview} from './types';

export const useInsightsOverview = (timeRange = 'all') => {
  const loader = useCallback(() => getInsightsOverview(timeRange), [timeRange]);
  return useAsyncData<InsightsOverview>(loader, insightsOverviewFixture);
};
