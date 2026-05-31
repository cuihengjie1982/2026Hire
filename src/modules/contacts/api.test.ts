import {beforeEach, describe, expect, it, vi} from 'vitest';

// Mock fetch for efetch() used by contacts API
const originalFetch = globalThis.fetch;

vi.mock('../../shared/lib/runtime', () => ({
  USE_MOCK_API: false,
  API_BASE_URL: 'https://test.supabase.co',
  getAuthToken: vi.fn(() => null),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({data: []}), {status: 200}),
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('contacts api', () => {
  it('uses efetch backend when mock mode is disabled', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{id: 'c-1', candidate_id: 'cand-1'}]), {status: 200}),
    );

    const {listContacts} = await import('./api');
    const result = await listContacts();

    expect(fetchMock).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('createContact sends POST with correct body', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({id: 'c-2', candidate_id: 'candidate-1', candidate_name: '张三'}), {status: 200}),
    );

    const {createContact} = await import('./api');
    await createContact({
      candidateId: 'candidate-1',
      candidateName: '张三',
      positionId: 'position-1',
      positionName: '岗位',
      projectId: 'project-1',
      projectName: '项目',
      outreachPerson: '张招募',
      channel: 'email',
      reason: '匹配度高',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/contacts');
  });

  it('updateContactStatus sends PATCH with id and status', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({id: 'c-2', status: 'contacted'}), {status: 200}),
    );

    const {updateContactStatus} = await import('./api');
    await updateContactStatus('c-2', 'contacted');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/contacts');
  });
});
