import {useCallback} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {getIntegrationsOverview} from './api';
import {integrationsOverviewFixture} from './fixtures';
import {type IntegrationOverview} from './types';

export const useIntegrationsOverview = () => {
  const loader = useCallback(() => getIntegrationsOverview(), []);
  return useAsyncData<IntegrationOverview>(loader, integrationsOverviewFixture);
};
