import {useCallback, useEffect, useState} from 'react';
import {listAgents} from '../../modules/agents/api';
import {listShortlist} from '../../modules/shortlist/api';
import {listApprovalRequests} from '../../modules/approvals/api';
import {getItemsFromPayload} from '../../shared/lib/apiClient';
import type {Agent} from '../../modules/agents/types';
import type {ShortlistEntry} from '../../modules/shortlist/types';
import type {ApprovalRequestSummary} from '../../modules/approvals/types';

export interface SidebarCounts {
  runningAgents: number;
  shortlistCount: number;
  pendingApprovals: number;
}

const EMPTY_COUNTS: SidebarCounts = {
  runningAgents: 0,
  shortlistCount: 0,
  pendingApprovals: 0,
};

export const useSidebarCounts = () => {
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [agents, shortlist, approvalsRaw] = await Promise.all([
        listAgents(),
        listShortlist(),
        listApprovalRequests(),
      ]);

      const approvals = getItemsFromPayload<ApprovalRequestSummary>(approvalsRaw);

      const runningAgents = (agents as Agent[]).filter((a) => a.status === 'running').length;
      const shortlistCount = (shortlist as ShortlistEntry[]).length;
      const pendingApprovals = approvals.filter(
        (a) => a.status === 'pending',
      ).length;

      setCounts({runningAgents, shortlistCount, pendingApprovals});
    } catch (e) {
      console.error('Failed to load sidebar counts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {counts, loading, refresh};
};
