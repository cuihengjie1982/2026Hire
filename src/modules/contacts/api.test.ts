import {beforeEach, describe, expect, it, vi} from 'vitest';

// Build a chainable + thenable mock for supabase query builder
function qb(result: {data: unknown; error?: Error | null}) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'single', 'not', 'gte']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({data: result.data, error: result.error ?? null}).then(resolve);
  return builder;
}

const mockFrom = vi.fn();

vi.mock('../../shared/lib/supabase', () => ({
  supabase: {from: (...args: unknown[]) => mockFrom(...args)},
}));

vi.mock('../../shared/lib/runtime', () => ({
  USE_MOCK_API: false,
}));

describe('contacts api', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('uses supabase backend when mock mode is disabled', async () => {
    const {listContacts, createContact, updateContactStatus} = await import('./api');

    mockFrom.mockReturnValue(qb({data: [{id: 'c-1'}]}));
    await listContacts();
    expect(mockFrom).toHaveBeenCalledWith('contacts');

    mockFrom.mockReturnValue(qb({data: {id: 'c-2'}}));
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
    expect(mockFrom).toHaveBeenCalledWith('contacts');

    mockFrom.mockReturnValue(qb({data: {id: 'c-2', status: 'contacted'}}));
    await updateContactStatus('c-2', 'contacted');
    expect(mockFrom).toHaveBeenCalledWith('contacts');
  });
});
