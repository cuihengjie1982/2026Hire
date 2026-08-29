import {describe, expect, it} from 'vitest';
import type {TrainingCourse} from '../types';
import {getCourseForTargetVideo} from './PublicTrainingVideoPage';

const makeCourse = (videoUrls: string[]): TrainingCourse => ({
  id: 'course-1',
  title: '测试课程',
  description: '',
  category: '综合',
  difficulty: '初级',
  durationMinutes: 5,
  content: videoUrls.map((contentUrl, index) => ({
    sectionTitle: `视频 ${index + 1}`,
    contentType: 'video',
    contentUrl,
  })),
  materials: [],
  assessmentConfig: {type: 'quiz', passingScore: 60},
  isActive: true,
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
});

describe('public training video target compatibility', () => {
  it('uses the sole canonical course video when an old shared target is stale', () => {
    const canonicalUrl = 'https://storage.example.com/materials/ios-compatible-l41-v2/video.mp4';
    const staleTarget = 'https://storage.example.com/materials/video.mp4';

    const result = getCourseForTargetVideo(makeCourse([canonicalUrl]), staleTarget);

    expect(result.content.find(section => section.contentType === 'video')?.contentUrl).toBe(canonicalUrl);
  });

  it('keeps an unmatched target when the course has multiple videos', () => {
    const staleTarget = 'https://storage.example.com/materials/legacy.mp4';

    const result = getCourseForTargetVideo(makeCourse([
      'https://storage.example.com/materials/one.mp4',
      'https://storage.example.com/materials/two.mp4',
    ]), staleTarget);

    expect(result.content.find(section => section.contentType === 'video')?.contentUrl).toBe(staleTarget);
  });
});
