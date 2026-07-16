import {buildEdgeFunctionUrl, mockDelay} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL} from '../../shared/lib/runtime';
import {getAuthToken} from '../../shared/lib/runtime';
import {type CandidateCard} from './types';

// Re-export talent data so both modules share the same data source
import {listCandidates as listTalentCandidates, deleteCandidate as deleteTalentCandidate} from '../talent/api';

export const listCandidates = async (): Promise<CandidateCard[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    // Use talent module data which gets updated when resumes are imported
    const talentCandidates = await listTalentCandidates();
    if (talentCandidates.length > 0) {
      return talentCandidates;
    }
    return [];
  }

  return listTalentCandidates();
};

export const deleteCandidate = async (id: string): Promise<void> => {
  return deleteTalentCandidate(id);
};

export const exportCandidatesCsv = async (): Promise<void> => {
  if (USE_MOCK_API) {
    throw new Error('导出功能需要连接后端服务');
  }
  const token = getAuthToken();
  const isLocalDev = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
  const csvUrl = isLocalDev
    ? `${API_BASE_URL}/api/candidates/export/csv`
    : buildEdgeFunctionUrl('/candidate-ops/export/csv');
  const res = await fetch(csvUrl, {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'candidates.csv';
  a.click();
  URL.revokeObjectURL(url);
};
