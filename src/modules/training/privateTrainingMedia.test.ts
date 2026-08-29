import {describe, expect, it} from 'vitest';
import {
  PRIVATE_TRAINING_REVIEW_BUCKET,
  PRIVATE_TRAINING_REVIEW_PREFIX,
  isPrivateTrainingMedia,
  replaceTrainingCourseMediaUrl,
} from './privateTrainingMedia';

describe('private training review media', () => {
  it('only treats the controlled review bucket and prefix as private media', () => {
    expect(isPrivateTrainingMedia(PRIVATE_TRAINING_REVIEW_BUCKET, `${PRIVATE_TRAINING_REVIEW_PREFIX}001.mp4`)).toBe(true);
    expect(isPrivateTrainingMedia('training-materials', `${PRIVATE_TRAINING_REVIEW_PREFIX}001.mp4`)).toBe(false);
    expect(isPrivateTrainingMedia(PRIVATE_TRAINING_REVIEW_BUCKET, 'materials/001.mp4')).toBe(false);
  });

  it('replaces media URLs without changing course metadata', () => {
    const course = {
      title: '擦桌子',
      content: [{sectionTitle: '视频', contentType: 'video' as const, contentUrl: 'private-url'}],
      materials: [{title: '视频', type: 'video' as const, url: 'private-url'}],
      videoReviewStatus: 'pending_review',
    };

    const result = replaceTrainingCourseMediaUrl(course, 'signed-url');
    expect(result.content[0].contentUrl).toBe('signed-url');
    expect(result.materials[0].url).toBe('signed-url');
    expect(result.title).toBe(course.title);
    expect(result.videoReviewStatus).toBe(course.videoReviewStatus);
  });
});
