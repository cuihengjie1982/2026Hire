import {useCallback, useState} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {listCandidates} from './api';
import {type CandidateCard} from './types';

export const useCandidates = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const loader = useCallback(() => listCandidates(), [refreshKey]);
  const result = useAsyncData<CandidateCard[]>(loader, []);
  return {
    ...result,
    refresh: () => setRefreshKey((k) => k + 1),
  };
};
