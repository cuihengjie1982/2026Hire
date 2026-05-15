import {useCallback} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {getApprovalRequest, listApprovalRequests} from './api';
import {type ApprovalRequestSummary} from './types';

export const useApprovalRequests = () => {
  const loader = useCallback(() => listApprovalRequests(), []);
  return useAsyncData<ApprovalRequestSummary[]>(loader, []);
};

export const useApprovalRequest = (approvalId: string) => {
  const loader = useCallback(() => getApprovalRequest(approvalId), [approvalId]);
  return useAsyncData<ApprovalRequestSummary | null>(loader, null);
};
