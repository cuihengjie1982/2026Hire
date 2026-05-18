import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {contactsFixture} from './fixtures';
import {type Contact, type ContactChannel} from './types';

let contactsData = [...contactsFixture];

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
    if (projectId) return contactsData.filter(c => c.projectId === projectId);
    return contactsData;
  }
  let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapContact);
};

export const listContactsByCandidate = async (candidateId: string): Promise<Contact[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return contactsData.filter(c => c.candidateId === candidateId);
  }
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapContact);
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
    return newContact;
  }
  const { data, error } = await (supabase.from('contacts' as any).insert({
    candidate_id: input.candidateId,
    candidate_name: input.candidateName,
    position_id: input.positionId,
    position_name: input.positionName,
    project_id: input.projectId,
    project_name: input.projectName,
    outreach_person: input.outreachPerson,
    channel: input.channel,
    reason: input.reason,
    status: 'pending',
  } as any)).select().single() as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Failed to create contact');
  return mapContact(data as Record<string, unknown>);
};

export const updateContactStatus = async (id: string, status: Contact['status']): Promise<Contact> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = contactsData.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Contact not found');
    contactsData[index] = {...contactsData[index], status, updatedAt: new Date().toISOString()};
    return contactsData[index];
  }
  const { data, error } = await (supabase.from('contacts' as any)
    .update({ status, updated_at: new Date().toISOString() } as any) as any).eq('id', id)
    .select()
    .single() as { data: Record<string, unknown> | null; error: Error | null };
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Contact not found');
  return mapContact(data as Record<string, unknown>);
};