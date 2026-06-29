import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createTrainingShareLink} from './api';

describe('training share links', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        courseId: 'course-1',
        token: 'mock-course-1',
        path: '/tv/course-1/mock-course-1',
      }),
    } as Response);
  });

  it('keeps a concrete material target in the public link', async () => {
    const targetUrl = 'https://eqdfyhqeqkbjvivscjau.supabase.co/storage/v1/object/public/training-materials/materials/example.docx';

    const result = await createTrainingShareLink('course-1', targetUrl);

    expect(result.path).toContain('/tv/course-1/mock-course-1');
    expect(result.path).toContain('target=');
    expect(decodeURIComponent(result.path)).toContain(targetUrl);
  });

  it('does not nest an existing public training share link', async () => {
    const targetUrl = 'https://hire.cmbpo.com/tv/83da6999-06ef-4038-b0d7-7daf171b4e38/J_UfdMBBYhJeVtDHEfdXa1WkhGzZKYaZWTvWJn8_5gc';

    const result = await createTrainingShareLink('course-1', targetUrl);

    expect(result.path).toBe('/tv/course-1/mock-course-1');
  });
});
