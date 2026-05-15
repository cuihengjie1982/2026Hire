import {useCallback} from 'react';
import {useAsyncData} from '../../shared/hooks/useAsyncData';
import {getInterviewSession, getInterviewTemplateDetail, listInterviewTemplates} from './api';
import {type InterviewSession, type InterviewTemplateDetail, type InterviewTemplateSummary} from './types';

export const useInterviewTemplates = () => {
  const loader = useCallback(() => listInterviewTemplates(), []);
  return useAsyncData<InterviewTemplateSummary[]>(loader, []);
};

export const useInterviewTemplateDetail = (templateId: string) => {
  const loader = useCallback(() => getInterviewTemplateDetail(templateId), [templateId]);
  return useAsyncData<InterviewTemplateDetail | null>(loader, null);
};

export const useInterviewSession = (sessionId: string) => {
  const loader = useCallback(() => getInterviewSession(sessionId), [sessionId]);
  return useAsyncData<InterviewSession | null>(loader, null);
};
