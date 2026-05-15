import {useCallback} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {listOutreachRecords} from './api';
import {type OutreachRecord} from './types';

export const useOutreachRecords = () => {
  const loader = useCallback(() => listOutreachRecords(), []);
  return useAsyncData<OutreachRecord[]>(loader, []);
};
