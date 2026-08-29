import {describe, expect, it} from 'vitest';
import {getPublicTrainingMetadata} from './publicTrainingMetadata';

describe('public training metadata', () => {
  it('keeps the complete classification and review information for learners', () => {
    expect(getPublicTrainingMetadata({
      category: '负向视频',
      videoPolarity: 'negative',
      difficulty: '初级',
      durationMinutes: 6,
      taskCategory: {name: '清洁与擦拭'},
      scene: {name: '厨房'},
      qualityTags: [{name: '动作太慢'}, {name: '画面模糊或失焦'}],
      videoReviewNote: '不通过原因：动作过于缓慢',
    })).toEqual({
      polarityLabel: '负向视频',
      taskLabel: '清洁与擦拭',
      sceneLabel: '厨房',
      difficultyLabel: '初级',
      durationLabel: '6 分钟',
      qualityLabels: ['动作太慢', '画面模糊或失焦'],
      reviewNote: '不通过原因：动作过于缓慢',
    });
  });
});
