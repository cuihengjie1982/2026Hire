import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {outreachRecordsFixture, smsTemplatesFixture} from './fixtures';
import {type OutreachRecord, type CreateOutreachRecordInput, type SmsTemplate, type SendSmsInput} from './types';

const EF_BASE = `${API_BASE_URL}/functions/v1/index`;

async function efFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${EF_BASE}${path}`, {...init, headers});
  if (!res.ok) {
    const err = await res.json().catch(() => ({error: {message: `HTTP ${res.status}`}}));
    throw new Error(err?.error?.message ?? `SMS API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const mapRecord = (raw: Record<string, unknown>): OutreachRecord => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: String(raw.candidate_name ?? raw.candidateName ?? ''),
  positionId: raw.position_id ? String(raw.position_id) : raw.positionId ? String(raw.positionId) : undefined,
  positionName: raw.position_name ? String(raw.position_name) : raw.positionName ? String(raw.positionName) : undefined,
  channel: (raw.channel as OutreachRecord['channel']) ?? 'other',
  status: (raw.status as OutreachRecord['status']) ?? 'pending',
  content: typeof raw.content === 'string' ? raw.content : undefined,
  smsProviderRef: typeof raw.sms_provider_ref === 'string' ? raw.sms_provider_ref : undefined,
  smsStatus: typeof raw.sms_status === 'string' ? raw.sms_status : undefined,
  createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
});

export const listOutreachRecords = async (): Promise<OutreachRecord[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return outreachRecordsFixture;
  }
  const { data, error } = await supabase.from('outreach_records').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRecord);
};

export const createOutreachRecord = async (input: CreateOutreachRecordInput): Promise<OutreachRecord> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const newRecord: OutreachRecord = {
      id: `or-${Date.now()}`,
      ...input,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    outreachRecordsFixture.unshift(newRecord);
    return newRecord;
  }
  const { data, error } = await (supabase.from('outreach_records').insert({
    candidate_id: input.candidateId,
    candidate_name: input.candidateName,
    position_id: input.positionId,
    position_name: input.positionName,
    channel: input.channel,
    status: 'pending',
    content: input.content,
  }) as unknown).select().single() as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to create outreach record');
  return mapRecord(data as Record<string, unknown>);
};

export const listOutreachRecordsByCandidate = async (candidateId: string): Promise<OutreachRecord[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return outreachRecordsFixture.filter(r => r.candidateId === candidateId);
  }
  const { data, error } = await supabase
    .from('outreach_records')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRecord);
};

export const updateOutreachRecordStatus = async (id: string, status: OutreachRecord['status']): Promise<OutreachRecord> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = outreachRecordsFixture.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Outreach record not found');
    outreachRecordsFixture[index] = {...outreachRecordsFixture[index], status};
    return outreachRecordsFixture[index];
  }
  const { data, error } = await (supabase
    .from('outreach_records')
    .update({ status }) as unknown).eq('id', id)
    .select()
    .single() as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to update outreach record');
  return mapRecord(data as Record<string, unknown>);
};

export const deleteOutreachRecord = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = outreachRecordsFixture.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Outreach record not found');
    outreachRecordsFixture.splice(index, 1);
    return;
  }
  const { error } = await supabase.from('outreach_records').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ── SMS ──────────────────────────────────────────────────────────

export const sendSms = async (input: SendSmsInput): Promise<OutreachRecord> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 300));
    const tpl = smsTemplatesFixture.find(t => t.id === input.templateId);
    const content = tpl?.content?.replace(/\{(\d+)\}/g, (_m, idx: string) => input.templateParamSet[parseInt(idx, 10)] ?? '') ?? '';
    const record: OutreachRecord = {
      id: `or-${Date.now()}`,
      candidateId: input.candidateId,
      candidateName: '模拟候选人',
      channel: 'sms',
      status: 'contacted',
      content,
      smsProviderRef: 'mock-sn',
      smsStatus: 'sent',
      createdAt: new Date().toISOString(),
    };
    outreachRecordsFixture.unshift(record);
    return record;
  }
  const raw = await efFetch<Record<string, unknown>>('/sms-gateway/send', {
    method: 'POST',
    body: JSON.stringify({
      candidateId: input.candidateId,
      templateId: input.templateId,
      templateParamSet: input.templateParamSet,
      positionId: input.positionId,
      positionName: input.positionName,
    }),
  });
  return mapRecord(raw);
};

export const listSmsTemplates = async (): Promise<SmsTemplate[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 100));
    return smsTemplatesFixture;
  }
  const raw = await efFetch<Record<string, unknown>[]>('/sms-gateway/templates');
  return raw.map(r => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    templateId: String(r.template_id ?? ''),
    signName: r.sign_name ? String(r.sign_name) : undefined,
    content: typeof r.content === 'string' ? r.content : undefined,
    parameters: Array.isArray(r.parameters) ? r.parameters.map(String) : [],
  }));
};
