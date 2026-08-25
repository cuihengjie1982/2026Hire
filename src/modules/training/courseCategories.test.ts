import {describe, expect, it} from 'vitest';
import {CATEGORY_COLORS, TRAINING_CATEGORIES} from './courseCategories';

describe('training course categories', () => {
  it('offers explicit video categories alongside legacy course categories', () => {
    expect(TRAINING_CATEGORIES).toEqual(expect.arrayContaining([
      '正向视频',
      '负向视频',
      '沟通表达',
      '专业能力',
      '综合',
    ]));
  });

  it('provides visible tags for explicit video categories', () => {
    expect(CATEGORY_COLORS['正向视频']).toBeTruthy();
    expect(CATEGORY_COLORS['负向视频']).toBeTruthy();
  });
});
