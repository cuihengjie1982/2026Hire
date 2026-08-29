export type VideoPolarity = 'positive' | 'negative';
export type VideoSeverity = 'minor' | 'moderate' | 'severe';
export type VideoTaxonomyOptionKind = 'task' | 'quality';

export interface VideoTaxonomyOption {
  id: string;
  kind: VideoTaxonomyOptionKind;
  name: string;
  polarity?: VideoPolarity;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VideoTaxonomy {
  taskCategories: VideoTaxonomyOption[];
  positiveTags: VideoTaxonomyOption[];
  negativeTags: VideoTaxonomyOption[];
}

export const VIDEO_POLARITY_LABELS: Record<VideoPolarity, string> = {
  positive: '正向视频',
  negative: '负向视频',
};

export const VIDEO_SEVERITY_LABELS: Record<VideoSeverity, string> = {
  minor: '轻微',
  moderate: '明显',
  severe: '严重',
};

export const resolveVideoPolarity = (course: {
  videoPolarity?: unknown;
  category?: unknown;
}): VideoPolarity | undefined => {
  if (course.videoPolarity === 'positive' || course.videoPolarity === 'negative') {
    return course.videoPolarity;
  }
  if (course.category === '正向视频') return 'positive';
  if (course.category === '负向视频' || course.category === '负面视频') return 'negative';
  return undefined;
};

const sortOptions = (options: VideoTaxonomyOption[]) => [...options].sort((a, b) => (
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN')
));

export const groupVideoTaxonomyOptions = (
  options: VideoTaxonomyOption[],
  includeInactive = false,
): VideoTaxonomy => {
  const visible = includeInactive ? options : options.filter(option => option.isActive);
  return {
    taskCategories: sortOptions(visible.filter(option => option.kind === 'task')),
    positiveTags: sortOptions(visible.filter(option => option.kind === 'quality' && option.polarity === 'positive')),
    negativeTags: sortOptions(visible.filter(option => option.kind === 'quality' && option.polarity === 'negative')),
  };
};

export const EMPTY_VIDEO_TAXONOMY: VideoTaxonomy = {
  taskCategories: [],
  positiveTags: [],
  negativeTags: [],
};
