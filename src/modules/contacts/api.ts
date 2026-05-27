import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {contactsFixture} from './fixtures';
import {type Contact, type ContactChannel} from './types';

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

let contactsData: Contact[] = (() => { try { const r = localStorage.getItem('em-box.mock.contacts'); return r ? JSON.parse(r) : [...contactsFixture]; } catch { return [...contactsFixture]; } })();
const saveContacts = () => localStorage.setItem('em-box.mock.contacts', JSON.stringify(contactsData));

const mapContact = (raw: Record<string, unknown>): Contact => ({
  id: String(raw.id ?? ''),
  candidateId: String(raw.candidate_id ?? raw.candidateId ?? ''),
  candidateName: String(raw.candidate_name ?? raw.candidateName ?? ''),
  positionId: String(raw.position_id ?? raw.positionId ?? ''),
  positionName: String(raw.position_name ?? raw.positionName ?? ''),
  projectId: String(raw.project_id ?? raw.projectId ?? ''),
  projectName: String(raw.project_name ?? raw.projectName ?? ''),
  outreachPerson: String(raw.outreach_person ?? raw.outreachPerson ?? ''),
  channel: (raw.channel as ContactChannel) ?? 'email',
  reason: String(raw.reason ?? ''),
  status: (raw.status as Contact['status']) ?? 'pending',
  createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
  updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ''),
});

type CreateContactInput = {
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionName: string;
  projectId: string;
  projectName: string;
  outreachPerson: string;
  channel: ContactChannel;
  reason: string;
};

export const listContacts = async (projectId?: string): Promise<Contact[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const base = projectId ? contactsData.filter(c => c.projectId === projectId) : contactsData;
    return Array.from(new Map(base.map(c => [c.id, c])).values());
  }
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  const data = await efetch<Record<string, unknown>[]>(`/contacts${qs}`, 'GET');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapContact);
};

export const listContactsByCandidate = async (candidateId: string): Promise<Contact[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(contactsData.filter(c => c.candidateId === candidateId).map(c => [c.id, c])).values());
  }
  const data = await efetch<Record<string, unknown>[]>(`/contacts?candidate_id=${encodeURIComponent(candidateId)}`, 'GET');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(mapContact);
};

export const createContact = async (input: CreateContactInput): Promise<Contact> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const newContact: Contact = {
      ...input,
      id: `c-${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    contactsData.push(newContact);
    saveContacts();
    return newContact;
  }
  const data = await efetch<Record<string, unknown>>('/contacts', 'POST', {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    positionId: input.positionId,
    positionName: input.positionName,
    projectId: input.projectId,
    projectName: input.projectName,
    outreachPerson: input.outreachPerson,
    channel: input.channel,
    reason: input.reason,
  });
  return mapContact(data);
};

export const updateContactStatus = async (id: string, status: Contact['status']): Promise<Contact> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = contactsData.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Contact not found');
    contactsData[index] = {...contactsData[index], status, updatedAt: new Date().toISOString()};
    saveContacts();
    return contactsData[index];
  }
  const data = await efetch<Record<string, unknown>>('/contacts', 'PATCH', { id, status });
  return mapContact(data);
};