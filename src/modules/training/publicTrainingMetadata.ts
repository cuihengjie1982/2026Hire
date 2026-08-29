type MetadataLabel = {name?: string | null} | null | undefined;

export type PublicTrainingMetadataInput = {
  category?: string | null;
  videoPolarity?: string | null;
  difficulty?: string | null;
  durationMinutes?: number | null;
  taskCategory?: MetadataLabel;
  scene?: MetadataLabel;
  qualityTags?: MetadataLabel[];
  videoReviewNote?: string | null;
};

export type PublicTrainingMetadata = {
  polarityLabel: string;
  taskLabel: string;
  sceneLabel: string;
  difficultyLabel: string;
  durationLabel: string;
  qualityLabels: string[];
  reviewNote: string;
};

export const getPublicTrainingMetadata = (
  course: PublicTrainingMetadataInput,
): PublicTrainingMetadata => {
  const polarityLabel = course.videoPolarity === 'positive' || course.category === '正向视频'
    ? '正向视频'
    : course.videoPolarity === 'negative' || course.category === '负向视频' || course.category === '负面视频'
      ? '负向视频'
      : course.category || '培训资料';

  return {
    polarityLabel,
    taskLabel: course.taskCategory?.name?.trim() || '未分类',
    sceneLabel: course.scene?.name?.trim() || '待确认',
    difficultyLabel: course.difficulty?.trim() || '未设置',
    durationLabel: course.durationMinutes && course.durationMinutes > 0
      ? `${course.durationMinutes} 分钟`
      : '',
    qualityLabels: (course.qualityTags ?? [])
      .map(tag => tag?.name?.trim() || '')
      .filter(Boolean),
    reviewNote: course.videoReviewNote?.trim() || '',
  };
};
