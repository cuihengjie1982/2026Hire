import {describe, expect, it} from 'vitest';
import {
  groupVideoTaxonomyOptions,
  resolveVideoPolarity,
  VIDEO_POLARITY_LABELS,
  VIDEO_SEVERITY_LABELS,
} from './videoTaxonomy';

describe('video taxonomy domain', () => {
  it('prefers explicit polarity and keeps legacy categories compatible', () => {
    expect(resolveVideoPolarity({videoPolarity: 'positive', category: '负向视频'})).toBe('positive');
    expect(resolveVideoPolarity({category: '正向视频'})).toBe('positive');
    expect(resolveVideoPolarity({category: '负面视频'})).toBe('negative');
    expect(resolveVideoPolarity({category: '沟通表达'})).toBeUndefined();
  });

  it('groups active task categories and direction-specific quality tags', () => {
    const result = groupVideoTaxonomyOptions([
      {id: 'task-clean', kind: 'task', name: '清洁', sortOrder: 2, isActive: true},
      {id: 'task-hidden', kind: 'task', name: '停用分类', sortOrder: 1, isActive: false},
      {id: 'positive-natural', kind: 'quality', polarity: 'positive', name: '动作自然', sortOrder: 2, isActive: true},
      {id: 'negative-staged', kind: 'quality', polarity: 'negative', name: '摆拍严重', sortOrder: 1, isActive: true},
    ]);

    expect(result.taskCategories.map(option => option.name)).toEqual(['清洁']);
    expect(result.positiveTags.map(option => option.name)).toEqual(['动作自然']);
    expect(result.negativeTags.map(option => option.name)).toEqual(['摆拍严重']);
  });

  it('provides stable Chinese labels for fixed dimensions', () => {
    expect(VIDEO_POLARITY_LABELS).toEqual({positive: '正向视频', negative: '负向视频'});
    expect(VIDEO_SEVERITY_LABELS.severe).toBe('严重');
  });
});
