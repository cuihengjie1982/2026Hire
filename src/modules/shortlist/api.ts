import {fetchJson, mockDelay, invokeEdgeFunction} from '../../shared/lib/apiClient';
import {supabase} from '../../shared/lib/supabase';
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
    await new Promise(r => setTimeout(r, 120));
    const base = projectId ? shortlistData.filter(entry => entry.projectId === projectId) : shortlistData;
    return Array.from(new Map(base.map(e => [e.id, e])).values()) as ShortlistEntry[];
  }

  let query = supabase.from('shortlist_entries').select('*');
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const {data, error} = await query;
  if (error) throw new Error(error.message);
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapShortlistEntry);
};

export const listShortlistByPosition = async (positionId: string): Promise<ShortlistEntry[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(shortlistData.filter(entry => entry.positionId === positionId).map(e => [e.id, e])).values());
  }

  const {data, error} = await supabase.from('shortlist_entries').select('*').eq('position_id', positionId);
  if (error) throw new Error(error.message);
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapShortlistEntry);
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
    saveShortlist();
    return newEntry;
  }

  const {data, error} = await (supabase.from('shortlist_entries' as any).insert(input as any) as any).select().single() as { data: Record<string, unknown> | null; error: Error | null };
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
    saveShortlist();
    return shortlistData[index];
  }

  const {data, error} = await invokeEdgeFunction<Record<string, unknown>>('cross-table-ops', {
    body: {
      action: 'shortlist-promote',
      shortlistEntryId: id,
      nextStep,
    },
  });
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
    saveShortlist();
    return shortlistData[index];
  }

  const {data, error} = await invokeEdgeFunction<Record<string, unknown>>('cross-table-ops', {
    body: {
      action: 'shortlist-interview-invite',
      shortlistEntryId: id,
      ...payload,
    },
  });
  return mapShortlistEntry(data as Record<string, unknown>);
};