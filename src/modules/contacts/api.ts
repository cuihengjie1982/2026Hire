import {buildApiUrl} from '../../shared/lib/apiClient';
import {getAuthToken, USE_MOCK_API} from '../../shared/lib/runtime';
import {contactsFixture} from './fixtures';
import {type Contact, type ContactChannel} from './types';

const loadContactsFromStorage = (): Contact[] => {
  try {
    const r = localStorage.getItem('em-box.mock.contacts');
    return r ? JSON.parse(r) : [...contactsFixture];
  } catch {
    return [...contactsFixture];
  }
};

const efetch = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const res = await fetch(buildApiUrl(`/api/contacts${path}`), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

let contactsData: Contact[] = loadContactsFromStorage();
const saveContacts = () => localStorage.setItem('em-box.mock.contacts', JSON.stringify(contactsData));
const syncContactsFromStorage = () => { contactsData = loadContactsFromStorage(); };

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

export type UpdateContactInput = {
  outreachPerson?: string;
  channel?: ContactChannel;
  reason?: string;
  status?: Contact['status'];
};

const findDuplicateContact = (candidateId: string, positionId: string) =>
  contactsData.find((c) => c.candidateId === candidateId && c.positionId === positionId);

export const listContacts = async (projectId?: string): Promise<Contact[]> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    syncContactsFromStorage();
    const base = projectId ? contactsData.filter((c) => c.projectId === projectId) : contactsData;
    return Array.from(new Map(base.map((c) => [c.id, c])).values());
  }
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  const payload = await efetch<Record<string, unknown> | Record<string, unknown>[]>(`${qs}`, 'GET');
  const rows = Array.isArray(payload) ? payload : (payload.items as Record<string, unknown>[] | undefined) ?? [];
  return Array.from(new Map(rows.map((r) => [r.id as string, r])).values()).map(mapContact);
};

export const listContactsByCandidate = async (candidateId: string): Promise<Contact[]> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    syncContactsFromStorage();
    return Array.from(new Map(contactsData.filter((c) => c.candidateId === candidateId).map((c) => [c.id, c])).values());
  }
  const data = await efetch<Record<string, unknown>[]>(`?candidate_id=${encodeURIComponent(candidateId)}`, 'GET');
  return Array.from(new Map((data ?? []).map((r) => [r.id as string, r])).values()).map(mapContact);
};

export const createContact = async (input: CreateContactInput): Promise<Contact> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    syncContactsFromStorage();
    if (findDuplicateContact(input.candidateId, input.positionId)) {
      throw new Error('该候选人已在此岗位的联系人列表中');
    }
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
  const data = await efetch<Record<string, unknown>>('', 'POST', {
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

export const updateContact = async (id: string, input: UpdateContactInput): Promise<Contact> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    syncContactsFromStorage();
    const index = contactsData.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('联系人不存在');
    contactsData[index] = {
      ...contactsData[index],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    saveContacts();
    return contactsData[index];
  }
  const data = await efetch<Record<string, unknown>>('', 'PATCH', {id, ...input});
  return mapContact(data);
};

export const updateContactStatus = async (id: string, status: Contact['status']): Promise<Contact> => {
  return updateContact(id, {status});
};

export const deleteContact = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    syncContactsFromStorage();
    const index = contactsData.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('联系人不存在');
    contactsData.splice(index, 1);
    saveContacts();
    return;
  }
  await efetch<{success: boolean}>(`/${id}`, 'DELETE');
};
