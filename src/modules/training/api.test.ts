import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../shared/lib/runtime', async () => ({
  ...(await vi.importActual<typeof import('../../shared/lib/runtime')>('../../shared/lib/runtime')),
  USE_MOCK_API: false,
}));

import {
  createTrainingShareLink,
  createVideoTaxonomyOption,
  batchUpdateCourseReviewStatus,
  listAllCourses,
  listPublicVideoShareCourses,
  listVideoTaxonomy,
} from './api';

describe('training course pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads every page for course management instead of stopping at the first page', async () => {
    const total = 450;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input), 'https://hire.example.com');
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
      const start = (page - 1) * pageSize;
      const items = Array.from(
        {length: Math.max(0, Math.min(pageSize, total - start))},
        (_, index) => ({
          id: `course-${start + index + 1}`,
          title: `课程 ${start + index + 1}`,
          content: [],
          materials: [],
          is_active: true,
        }),
      );
      return {
        ok: true,
        json: async () => ({items, total, page, pageSize}),
      } as Response;
    });

    const result = await listAllCourses();

    expect(result.items).toHaveLength(total);
    expect(new Set(result.items.map(course => course.id))).toHaveProperty('size', total);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input), 'https://hire.example.com').searchParams.get('page')))
      .toEqual(['1', '2', '3']);
  });
});

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

describe('video taxonomy course mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps explicit taxonomy fields returned by the public API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{
          id: 'course-1',
          title: '擦桌子',
          description: '',
          category: '正向视频',
          video_polarity: 'positive',
          video_task_category_id: 'task-clean',
          video_scene_id: 'scene-kitchen',
          video_review_status: 'pending_review',
          video_severity: null,
          video_review_note: '动作连贯',
          task_category: {id: 'task-clean', kind: 'task', name: '清洁', sort_order: 1, is_active: true},
          scene: {id: 'scene-kitchen', kind: 'scene', name: '厨房', sort_order: 1, is_active: true},
          quality_tags: [{id: 'tag-natural', kind: 'quality', polarity: 'positive', name: '动作自然', sort_order: 1, is_active: true}],
          content: [],
          materials: [],
          assessment_config: {type: 'quiz', passingScore: 60},
          is_active: true,
          share_token: 'token',
        }],
      }),
    } as Response);

    const result = await listPublicVideoShareCourses();
    const course = result.items[0];

    expect(course.videoPolarity).toBe('positive');
    expect(course.taskCategory?.name).toBe('清洁');
    expect(course.scene?.name).toBe('厨房');
    expect(course.videoReviewStatus).toBe('pending_review');
    expect(course.qualityTags.map(tag => tag.name)).toEqual(['动作自然']);
    expect(course.videoReviewNote).toBe('动作连贯');
  });

  it('derives polarity from the legacy category without changing the source record', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{
          id: 'legacy-course', title: '旧视频', description: '', category: '负向视频',
          content: [], materials: [], assessment_config: {}, is_active: true, share_token: 'token',
        }],
      }),
    } as Response);

    const result = await listPublicVideoShareCourses();

    expect(result.items[0].videoPolarity).toBe('negative');
    expect(result.items[0].category).toBe('负向视频');
  });
});

describe('video taxonomy API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('groups available taxonomy options for the editor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({items: [
        {id: 'task-clean', kind: 'task', name: '清洁', sort_order: 1, is_active: true},
        {id: 'scene-kitchen', kind: 'scene', name: '厨房', sort_order: 2, is_active: true},
        {id: 'tag-natural', kind: 'quality', polarity: 'positive', name: '动作自然', sort_order: 1, is_active: true},
        {id: 'tag-staged', kind: 'quality', polarity: 'negative', name: '摆拍严重', sort_order: 1, is_active: true},
      ]}),
    } as Response);

    const taxonomy = await listVideoTaxonomy();

    expect(taxonomy.taskCategories.map(option => option.name)).toEqual(expect.arrayContaining(['清洁']));
    expect(taxonomy.scenes.map(option => option.name)).toEqual(expect.arrayContaining(['厨房']));
    expect(taxonomy.positiveTags.map(option => option.name)).toEqual(expect.arrayContaining(['动作自然']));
    expect(taxonomy.negativeTags.map(option => option.name)).toEqual(expect.arrayContaining(['摆拍严重']));
  });

  it('returns the normalized option created by an administrator', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({id: 'task-office', kind: 'task', name: '办公操作', sort_order: 8, is_active: true}),
    } as Response);

    const option = await createVideoTaxonomyOption({kind: 'task', name: '办公操作'});

    expect(option).toMatchObject({kind: 'task', name: '办公操作', isActive: true});
  });
});

describe('batch video review API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends selected course IDs and the target review status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({updated: 2, items: []}),
    } as Response);

    const result = await batchUpdateCourseReviewStatus(['course-1', 'course-2'], 'internal');

    expect(result.updated).toBe(2);
    const [, request] = fetchMock.mock.calls[0];
    expect(request?.method).toBe('PATCH');
    expect(JSON.parse(String(request?.body))).toEqual({
      courseIds: ['course-1', 'course-2'],
      videoReviewStatus: 'internal',
    });
  });
});
