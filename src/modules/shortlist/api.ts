import {fetchJson, mockDelay, invokeEdgeFunction} from '../../shared/lib/apiClient';
import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {shortlistFixture} from './fixtures';
import {type CreateShortlistEntryInput, type ShortlistEntry} from './types';

let shortlistData = [...shortlistFixture];

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
    await new Promise(r => setTimeout(r, 120));
    if (projectId) {
      return shortlistData.filter((entry) => entry.projectId === projectId);
    }
    return shortlistData;
  }

  let query = supabase.from('shortlist_entries').select('*');
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const {data, error} = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapShortlistEntry);
};

export const listShortlistByPosition = async (positionId: string): Promise<ShortlistEntry[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return shortlistData.filter((entry) => entry.positionId === positionId);
  }

  const {data, error} = await supabase.from('shortlist_entries').select('*').eq('position_id', positionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapShortlistEntry);
};

export const addToShortlist = async (input: CreateShortlistEntryInput): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const newEntry: ShortlistEntry = {
      ...input,
      id: Date.now().toString(),
      nextStep: '待处理',
    };
    shortlistData.push(newEntry);
    return newEntry;
  }

  const {data, error} = await (supabase.from('shortlist_entries').insert(input) as unknown).select().single() as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to add to shortlist');
  return mapShortlistEntry(data as Record<string, unknown>);
};

export const promoteShortlistEntry = async (
  id: string,
  nextStep: string,
): Promise<ShortlistEntry> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = shortlistData.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shortlist entry not found');
    shortlistData[index] = {...shortlistData[index], nextStep};
    return shortlistData[index];
  }

  const {data, error} = await invokeEdgeFunction<Record<string, unknown>>('cross-table-ops', {
    body: {
      action: 'shortlist-promote',
      shortlistEntryId: id,
      nextStep,
    },
  });
  if (error) throw new Error(error.message);
  return mapShortlistEntry(data as Record<string, unknown>);
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
    await new Promise(r => setTimeout(r, 120));
    const index = shortlistData.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shortlist entry not found');
    shortlistData[index] = {...shortlistData[index], nextStep: '已发面试邀请'};
    return shortlistData[index];
  }

  const {data, error} = await invokeEdgeFunction<Record<string, unknown>>('cross-table-ops', {
    body: {
      action: 'shortlist-interview-invite',
      shortlistEntryId: id,
      ...payload,
    },
  });
  if (error) throw new Error(error.message);
  return mapShortlistEntry(data as Record<string, unknown>);
};