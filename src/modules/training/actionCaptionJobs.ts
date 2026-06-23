import {generateTrainingActionCaptions} from './api';
import type {TrainingCourse} from './types';

export type ActionCaptionJobStatus = 'running' | 'succeeded' | 'failed';

export interface ActionCaptionJob {
  id: string;
  courseId: string;
  courseTitle: string;
  targetUrl?: string;
  progress: number;
  status: ActionCaptionJobStatus;
  error?: string;
  startedAt: number;
  updatedAt: number;
  promise: Promise<void>;
}

type ActionCaptionJobListener = (jobs: ActionCaptionJob[]) => void;

const jobs = new Map<string, ActionCaptionJob>();
const listeners = new Set<ActionCaptionJobListener>();
const cleanupTimers = new Map<string, number>();

export const getActionCaptionJobKey = (courseId: string, targetUrl?: string) => (
  `${courseId}::${targetUrl ?? ''}`
);

export const listActionCaptionJobs = () => Array.from(jobs.values())
  .sort((a, b) => b.updatedAt - a.updatedAt);

const notify = () => {
  const snapshot = listActionCaptionJobs();
  listeners.forEach(listener => listener(snapshot));
};

const setJob = (job: ActionCaptionJob) => {
  jobs.set(job.id, job);
  notify();
};

const scheduleCleanup = (jobId: string, delayMs = 60000) => {
  const existing = cleanupTimers.get(jobId);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    jobs.delete(jobId);
    cleanupTimers.delete(jobId);
    notify();
  }, delayMs);
  cleanupTimers.set(jobId, timer);
};

export const subscribeActionCaptionJobs = (listener: ActionCaptionJobListener) => {
  listeners.add(listener);
  listener(listActionCaptionJobs());
  return () => {
    listeners.delete(listener);
  };
};

export const startActionCaptionJob = (
  course: TrainingCourse,
  targetUrl?: string,
): ActionCaptionJob => {
  const id = getActionCaptionJobKey(course.id, targetUrl);
  const existing = jobs.get(id);
  if (existing?.status === 'running') return existing;
  const cleanupTimer = cleanupTimers.get(id);
  if (cleanupTimer) {
    window.clearTimeout(cleanupTimer);
    cleanupTimers.delete(id);
  }

  const now = Date.now();
  const promise = generateTrainingActionCaptions(course, targetUrl, progress => {
    const current = jobs.get(id);
    if (!current || current.status !== 'running') return;
    setJob({
      ...current,
      progress: Math.max(current.progress, Math.min(99, progress)),
      updatedAt: Date.now(),
    });
  })
    .then(() => {
      const current = jobs.get(id);
      if (!current) return;
      setJob({
        ...current,
        progress: 100,
        status: 'succeeded',
        updatedAt: Date.now(),
      });
      scheduleCleanup(id, 60000);
    })
    .catch(error => {
      const current = jobs.get(id);
      if (!current) return;
      setJob({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : '生成动作流失败',
        updatedAt: Date.now(),
      });
      scheduleCleanup(id, 5 * 60 * 1000);
    });

  const job: ActionCaptionJob = {
    id,
    courseId: course.id,
    courseTitle: course.title || '培训视频',
    targetUrl,
    progress: 0,
    status: 'running',
    startedAt: now,
    updatedAt: now,
    promise,
  };
  setJob(job);
  return job;
};
