export const PRIVATE_TRAINING_REVIEW_BUCKET = 'training-review-materials';
export const PRIVATE_TRAINING_REVIEW_PREFIX = 'bulk/negative/';

export const isPrivateTrainingMedia = (bucket?: string | null, path?: string | null): boolean => (
  bucket === PRIVATE_TRAINING_REVIEW_BUCKET
  && typeof path === 'string'
  && path.startsWith(PRIVATE_TRAINING_REVIEW_PREFIX)
);

type CourseMediaShape = {
  content?: Array<Record<string, unknown>>;
  materials?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export const replaceTrainingCourseMediaUrl = <T extends CourseMediaShape>(course: T, signedUrl: string): T => ({
  ...course,
  content: (course.content ?? []).map(section => ({...section, contentUrl: signedUrl})),
  materials: (course.materials ?? []).map(material => ({...material, url: signedUrl})),
});
