import {getItemsFromPayload, mockDelay, buildApiUrl} from '../../shared/lib/apiClient';
import {getAuthToken, USE_MOCK_API} from '../../shared/lib/runtime';
import {shortlistFixture} from './fixtures';
import {type CreateShortlistEntryInput, type ShortlistEntry, type BatchAddShortlistResult} from './types';

const loadShortlistFromStorage = (): ShortlistEntry[] => {
  try {
    const r = localStorage.getItem('em-box.mock.shortlist');
    return r ? JSON.parse(r) : [...shortlistFixture];
  } catch {
    return [...shortlistFixture];
  }
};

const efetch = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const res = await fetch(buildApiUrl(`/api/shortlist${path}`), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `API error ${res.status}`);
  }
  return res.json() as T;
};

let shortlistData: ShortlistEntry[] = loadShortlistFromStorage();
const saveShortlist = () => localStorage.setItem('em-box.mock.shortlist', JSON.stringify(shortlistData));
const syncShortlistFromStorage = () => { shortlistData = loadShortlistFromStorage(); };

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
    syncShortlistFromStorage();
    const base = projectId ? shortlistData.filter(entry => entry.projectId === projectId) : shortlistData;
    return Array.from(new Map(base.map(e => [e.id, e])).values());
  }

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const payload = await efetch<Record<string, unknown>>(`${query}`);
  const rows = getItemsFromPayload<Record<string, unknown>>(payload);
  return rows.map(mapShortlistEntry);
};

export const listShortlistByPosition = async (positionId: string): Promise<ShortlistEntry[]> => {
  if (USE_MOCK_API) {
    await mockDelay();
    return Array.from(new Map(shortlistData.filter(entry => entry.positionId === positionId).map(e => [e.id, e])).values());
  }

  const payload = await efetch<Record<string, unknown>>(`?positionId=${encodeURIComponent(positionId)}`);
  const rows = getItemsFromPayload<Record<string, unknown>>(payload);
  return rows.map(mapShortlistEntry);
};

export const addToShortlist = async (input: CreateShortlistEntryInput): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await mockDelay();
    syncShortlistFromStorage();
    const duplicate = shortlistData.find(
      (e) => e.candidateId === input.candidateId && e.positionId === input.positionId,
    );
    if (duplicate) {
      throw new Error('该候选人已在此岗位的入围名单中');
    }
    const newEntry: ShortlistEntry = {
      ...input,
      id: Date.now().toString(),
      nextStep: '待处理',
    };
    shortlistData.push(newEntry);
    saveShortlist();
    return newEntry;
  }

  const row = await efetch<Record<string, unknown>>('', 'POST', input);
  return mapShortlistEntry(row);
};

export const promoteShortlistEntry = async (
  id: string,
  nextStep: string,
): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await mockDelay();
    syncShortlistFromStorage();
    const index = shortlistData.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shortlist entry not found');
    shortlistData[index] = {...shortlistData[index], nextStep};
    saveShortlist();
    return shortlistData[index];
  }

  const row = await efetch<Record<string, unknown>>(`/${id}/promote`, 'POST', {nextStep});
  return mapShortlistEntry(row);
};

export const sendShortlistInterviewInvite = async (
  id: string,
  payload: {
    candidateEmail: string;
    type: string;
    subject: string;
    content: string;
    templateId?: string;
  },
): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await mockDelay();
    syncShortlistFromStorage();
    const index = shortlistData.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shortlist entry not found');
    shortlistData[index] = {...shortlistData[index], nextStep: '已发面试邀请'};
    saveShortlist();
    return shortlistData[index];
  }

  const row = await efetch<Record<string, unknown>>(`/${id}/interview-invite`, 'POST', payload);
  return mapShortlistEntry(row);
};

// Batch operations

export const batchAddToShortlist = async (
  entries: CreateShortlistEntryInput[],
): Promise<BatchAddShortlistResult> => {
  if (USE_MOCK_API) {
    await mockDelay();
    syncShortlistFromStorage();
    const results: ShortlistEntry[] = [];
    const skipped: {candidateId: string; reason: string}[] = [];
    for (const input of entries) {
      const duplicate = shortlistData.find(
        (e) => e.candidateId === input.candidateId && e.positionId === input.positionId,
      );
      if (duplicate) {
        skipped.push({candidateId: input.candidateId, reason: '已在此岗位的入围名单中'});
        continue;
      }
      const newEntry: ShortlistEntry = {
        ...input,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        nextStep: '待处理',
      };
      shortlistData.push(newEntry);
      results.push(newEntry);
    }
    saveShortlist();
    return {added: results.length, skipped, entries: results};
  }

  const result = await efetch<BatchAddShortlistResult & {entries: Record<string, unknown>[]}>('/batch', 'POST', {entries});
  return {
    added: result.added,
    skipped: result.skipped ?? [],
    entries: result.entries.map(mapShortlistEntry),
  };
};

export const batchRemoveFromShortlist = async (
  ids: string[],
): Promise<{removed: number; ids: string[]}> => {
  if (USE_MOCK_API) {
    await mockDelay();
    syncShortlistFromStorage();
    const removed = shortlistData.filter((entry) => ids.includes(entry.id)).map((e) => e.id);
    shortlistData = shortlistData.filter((entry) => !ids.includes(entry.id));
    saveShortlist();
    return {removed: removed.length, ids: removed};
  }

  return efetch<{removed: number; ids: string[]}>('/batch', 'DELETE', {ids});
};

export const removeFromShortlist = async (id: string): Promise<void> => {
  await batchRemoveFromShortlist([id]);
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

  const result = await efetch<{updated: number; entries: Record<string, unknown>[]}>('/batch/status', 'PATCH', {ids, nextStep});
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

  return efetch(`/${id}/history`);
};