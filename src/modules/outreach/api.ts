import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {outreachRecordsFixture, smsTemplatesFixture} from './fixtures';
import {type OutreachRecord, type CreateOutreachRecordInput, type SmsTemplate, type SendSmsInput} from './types';

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

const EF_BASE = `${API_BASE_URL}/functions/v1/embox-api`;

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

// localStorage-backed mock store
let outreachData: OutreachRecord[] = (() => { try { const r = localStorage.getItem('em-box.mock.outreach'); return r ? JSON.parse(r) : [...outreachRecordsFixture]; } catch { return [...outreachRecordsFixture]; } })();
const saveOutreach = () => localStorage.setItem('em-box.mock.outreach', JSON.stringify(outreachData));

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
    return Array.from(new Map(outreachData.map(r => [r.id, r])).values());
  }
  const data = await efetch<Record<string, unknown>[]>('/outreach', 'GET');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapRecord);
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
    outreachData.unshift(newRecord);
    saveOutreach();
    return newRecord;
  }
  const data = await efetch<Record<string, unknown>>('/outreach', 'POST', {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    positionId: input.positionId,
    positionName: input.positionName,
    channel: input.channel,
    content: input.content,
  });
  return mapRecord(data);
};

export const listOutreachRecordsByCandidate = async (candidateId: string): Promise<OutreachRecord[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return outreachData.filter(r => r.candidateId === candidateId);
  }
  const data = await efetch<Record<string, unknown>[]>(`/outreach?candidate_id=${encodeURIComponent(candidateId)}`, 'GET');
  return (data ?? []).map(mapRecord);
};

export const updateOutreachRecordStatus = async (id: string, status: OutreachRecord['status']): Promise<OutreachRecord> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = outreachData.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Outreach record not found');
    outreachData[index] = {...outreachData[index], status};
    saveOutreach();
    return outreachData[index];
  }
  const data = await efetch<Record<string, unknown>>('/outreach', 'PATCH', { id, status });
  return mapRecord(data);
};

export const deleteOutreachRecord = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = outreachData.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Outreach record not found');
    outreachData.splice(index, 1);
    saveOutreach();
    return;
  }
  await efetch('/outreach', 'DELETE', { id });
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
    outreachData.unshift(record);
    saveOutreach();
    return record;
  }
  const raw = await efetch<Record<string, unknown>>('/sms-gateway/send', 'POST', {
    candidateId: input.candidateId,
    templateId: input.templateId,
    templateParamSet: input.templateParamSet,
    positionId: input.positionId,
    positionName: input.positionName,
  });
  return mapRecord(raw);
};

export const listSmsTemplates = async (): Promise<SmsTemplate[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 100));
    return smsTemplatesFixture;
  }
  const raw = await efetch<Record<string, unknown>[]>('/sms-gateway/templates', 'GET');
  return raw.map(r => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    templateId: String(r.template_id ?? ''),
    signName: r.sign_name ? String(r.sign_name) : undefined,
    content: typeof r.content === 'string' ? r.content : undefined,
    parameters: Array.isArray(r.parameters) ? r.parameters.map(String) : [],
  }));
};
