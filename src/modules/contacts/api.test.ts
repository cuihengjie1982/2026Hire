import {beforeEach, describe, expect, it, vi} from 'vitest';

const fetchJsonMock = vi.fn();

vi.mock('../../shared/lib/runtime', () => ({
  USE_MOCK_API: false,
}));

vi.mock('../../shared/lib/apiClient', () => ({
  fetchJson: fetchJsonMock,
  mockDelay: vi.fn(),
}));

describe('contacts api', () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
  });

  it('uses backend endpoints when mock mode is disabled', async () => {
    const {listContacts, createContact, updateContactStatus} = await import('./api');

    fetchJsonMock.mockResolvedValueOnce([{id: 'c-1'}]);
    await listContacts();
    expect(fetchJsonMock).toHaveBeenNthCalledWith(1, '/api/contacts');

    fetchJsonMock.mockResolvedValueOnce({id: 'c-2'});
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
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      2,
      '/api/contacts',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    fetchJsonMock.mockResolvedValueOnce({id: 'c-2', status: 'contacted'});
    await updateContactStatus('c-2', 'contacted');
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      3,
      '/api/contacts/c-2/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({status: 'contacted'}),
      }),
    );
  });
});
