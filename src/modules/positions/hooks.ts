import {useCallback} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {getPositionDetail, listPositions} from './api';
import {type PositionDetail, type PositionSummary} from './types';

export const usePositions = () => {
  const loader = useCallback(() => listPositions(), []);
  return useAsyncData<PositionSummary[]>(loader, []);
};

export const usePositionDetail = (positionId: string) => {
  const loader = useCallback(() => getPositionDetail(positionId), [positionId]);
  return useAsyncData<PositionDetail | null>(loader, null);
};
