import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {integrationsOverviewFixture} from './fixtures';
import {type IntegrationOverview} from './types';

export const getIntegrationsOverview = async (): Promise<IntegrationOverview> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return integrationsOverviewFixture;
  }

  try {
    const {data, error} = await supabase.from('integrations_overview').select('*').single();
    if (error) throw new Error(error.message);
    return data as IntegrationOverview;
  } catch (err) {
    // Table may not exist yet — return empty state gracefully
    console.warn('integrations_overview not available:', err instanceof Error ? err.message : err);
    return integrationsOverviewFixture;
  }
};