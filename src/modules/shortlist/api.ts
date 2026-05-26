import {fetchJson, mockDelay} from '../../shared/lib/apiClient';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {shortlistFixture} from './fixtures';
import {type CreateShortlistEntryInput, type ShortlistEntry} from './types';

let shortlistData: ShortlistEntry[] = (() => { try { const r = localStorage.getItem('em-box.mock.shortlist'); return r ? JSON.parse(r) : [...shortlistFixture]; } catch { return [...shortlistFixture]; } })();
const saveShortlist = () => localStorage.setItem('em-box.mock.shortlist', JSON.stringify(shortlistData));

const mapShortlistEntry = (raw: Record<string, unknown>): ShortlistEntry => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: String(raw.candidate_name ?? raw.candidateName ?? ''),
  role: String(raw.role ?? ''),
  positionId: String(raw.position_id ?? raw.positionId ?? ''),
  positionName: String(raw.position_name ?? raw.positionName ?? ''),
  projectId: String(raw.project_id ?? raw.projectId ?? ''),
  projectName: String(raw.project_name ?? raw.projectName ?? ''),
  fitScore: Number(raw.fit_score ?? raw.fitScore ?? 0),
  grade: String(raw.grade ?? ''),
  nextStep: String(raw.next_step ?? raw.nextStep ?? ''),
});

export const listShortlist = async (projectId?: string): Promise<ShortlistEntry[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const base = projectId ? shortlistData.filter(entry => entry.projectId === projectId) : shortlistData;
    return Array.from(new Map(base.map(e => [e.id, e])).values());
  }

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const rows = await fetchJson<Record<string, unknown>[]>(`/api/shortlist${query}`);
  return rows.map(mapShortlistEntry);
};

export const listShortlistByPosition = async (positionId: string): Promise<ShortlistEntry[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return Array.from(new Map(shortlistData.filter(entry => entry.positionId === positionId).map(e => [e.id, e])).values());
  }

  const rows = await fetchJson<Record<string, unknown>[]>(`/api/shortlist?positionId=${encodeURIComponent(positionId)}`);
  return rows.map(mapShortlistEntry);
};

export const addToShortlist = async (input: CreateShortlistEntryInput): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const newEntry: ShortlistEntry = {
      ...input,
      id: Date.now().toString(),
      nextStep: '待处理',
    };
    shortlistData.push(newEntry);
    saveShortlist();
    return newEntry;
  }

  const row = await fetchJson<Record<string, unknown>>('/api/shortlist', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapShortlistEntry(row);
};

export const promoteShortlistEntry = async (
  id: string,
  nextStep: string,
): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const index = shortlistData.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shortlist entry not found');
    shortlistData[index] = {...shortlistData[index], nextStep};
    saveShortlist();
    return shortlistData[index];
  }

  const row = await fetchJson<Record<string, unknown>>(`/api/shortlist/${id}/promote`, {
    method: 'POST',
    body: JSON.stringify({nextStep}),
  });
  return mapShortlistEntry(row);
};

export const sendShortlistInterviewInvite = async (
  id: string,
  payload: {
    candidateEmail: string;
    type: string;
    subject: string;
    content: string;
  },
): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const index = shortlistData.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shortlist entry not found');
    shortlistData[index] = {...shortlistData[index], nextStep: '已发面试邀请'};
    saveShortlist();
    return shortlistData[index];
  }

  const row = await fetchJson<Record<string, unknown>>(`/api/shortlist/${id}/interview-invite`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapShortlistEntry(row);
};

// Batch operations

export const batchAddToShortlist = async (
  entries: CreateShortlistEntryInput[],
): Promise<{added: number; entries: ShortlistEntry[]}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const results: ShortlistEntry[] = [];
    for (const input of entries) {
      const newEntry: ShortlistEntry = {
        ...input,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        nextStep: '待处理',
      };
      shortlistData.push(newEntry);
      results.push(newEntry);
    }
    saveShortlist();
    return {added: results.length, entries: results};
  }

  const result = await fetchJson<{added: number; entries: Record<string, unknown>[]}>('/api/shortlist/batch', {
    method: 'POST',
    body: JSON.stringify({entries}),
  });
  return {added: result.added, entries: result.entries.map(mapShortlistEntry)};
};

export const batchRemoveFromShortlist = async (
  ids: string[],
): Promise<{removed: number; ids: string[]}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    shortlistData = shortlistData.filter(entry => !ids.includes(entry.id));
    saveShortlist();
    return {removed: ids.length, ids};
  }

  return fetchJson<{removed: number; ids: string[]}>('/api/shortlist/batch', {
    method: 'DELETE',
    body: JSON.stringify({ids}),
  });
};

export const batchUpdateShortlistStatus = async (
  ids: string[],
  nextStep: string,
): Promise<{updated: number; entries: ShortlistEntry[]}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    let count = 0;
    const updated: ShortlistEntry[] = [];
    for (const entry of shortlistData) {
      if (ids.includes(entry.id)) {
        entry.nextStep = nextStep;
        count++;
        updated.push(entry);
      }
    }
    saveShortlist();
    return {updated: count, entries: updated};
  }

  const result = await fetchJson<{updated: number; entries: Record<string, unknown>[]}>('/api/shortlist/batch/status', {
    method: 'PATCH',
    body: JSON.stringify({ids, nextStep}),
  });
  return {updated: result.updated, entries: result.entries.map(mapShortlistEntry)};
};

export const getShortlistHistory = async (
  id: string,
): Promise<{id: string; candidate_name: string; next_step: string; status_log: {status: string; at: string}[]}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    const entry = shortlistData.find(e => e.id === id);
    return {
      id,
      candidate_name: entry?.candidateName ?? '',
      next_step: entry?.nextStep ?? '',
      status_log: [],
    };
  }

  return fetchJson(`/api/shortlist/${id}/history`);
};