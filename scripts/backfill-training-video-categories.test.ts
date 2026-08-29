// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inferCategory, planChanges } from './backfill-training-video-categories.mjs';

describe('safe video category backfill', () => {
  it.each([['正向视频-擦桌子', '正向视频'], ['负向视频-整理桌面', '负向视频'], ['负面视频-整理桌面', '负向视频']])('recognizes explicit prefix %s', (sectionTitle, expected) => {
    expect(inferCategory({ content: [{ contentType: 'video', sectionTitle }] })).toBe(expected);
  });
  it('handles legacy snake case fields but does not infer from a title or ordinary text', () => {
    expect(inferCategory({ content: [{ content_type: 'video', section_title: ' 正向视频-示范' }] })).toBe('正向视频');
    expect(inferCategory({ title: '正向视频', content: [{ contentType: 'text', sectionTitle: '正向视频-文档' }] })).toBeNull();
    expect(inferCategory({ content: [{ contentType: 'video', sectionTitle: '普通示范' }] })).toBeNull();
  });
  it('does not overwrite already classified courses or conflicting multi-video courses', () => {
    const content = [{ contentType: 'video', sectionTitle: '正向视频-示范' }];
    expect(planChanges([{ id: 'a', category: '负向视频', content }])).toEqual([]);
    expect(inferCategory({ content: [...content, { contentType: 'video', sectionTitle: '负面视频-示范' }] })).toBeNull();
  });
  it('plans only category writes and leaves the input intact', () => {
    const course = { id: 'a', category: '沟通表达', content: [{ contentType: 'video', sectionTitle: '正向视频-示范', contentUrl: 'unchanged.mp4' }], assessment_config: { captions: [1] } };
    const before = structuredClone(course);
    expect(planChanges([course])).toEqual([{ id: 'a', oldCategory: '沟通表达', newCategory: '正向视频' }]);
    expect(course).toEqual(before);
  });
});
