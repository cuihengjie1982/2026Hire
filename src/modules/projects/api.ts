import {supabase} from '../../shared/lib/supabase';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {projectStatsFixture, projectsFixture} from './fixtures';
import {type Project, type ProjectStats, type ProjectStatus} from './types';

export type TimeRange = 'today' | 'week' | 'month' | 'all';

interface GetStatsParams {
  timeRange?: TimeRange;
  startDate?: string;
  endDate?: string;
}

let projectsData = [...projectsFixture];

const getMockProjectStats = (params: GetStatsParams): ProjectStats => {
  const {timeRange = 'week', startDate, endDate} = params;
  const now = new Date();
  const today = now.toDateString();

  // Filter projects based on time range or custom date range
  const filtered = projectsData.filter((p) => {
    if (startDate && endDate) {
      const date = new Date(p.createdAt ?? now);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return date >= start && date <= end;
    }
    if (timeRange === 'all') return true;
    if (timeRange === 'month') {
      const date = new Date(p.createdAt ?? now);
      return date.getMonth() === now.getMonth();
    }
    if (timeRange === 'week') {
      const date = new Date(p.createdAt ?? now);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
    }
    if (timeRange === 'today') {
      const date = new Date(p.createdAt ?? now);
      return date.toDateString() === today;
    }
    return true;
  });

  const activeProjects = filtered.filter((p) => p.status === '进行中').length;
  const candidateReserve = 0;
  const weeklyInterviews = 0;

  return {
    activeProjects: activeProjects || 6,
    candidateReserve: candidateReserve || 406,
    weeklyInterviews: weeklyInterviews || 58,
  };
};

export const getProjectStats = async (params: GetStatsParams = {}): Promise<ProjectStats> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    return getMockProjectStats(params);
  }

  const query = new URLSearchParams();
  if (params.timeRange) query.set('range', params.timeRange);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);

  // Stats computed from real data via supabase.rpc or direct query
  const {data} = await supabase.from('projects').select('id', {count: 'exact'});
  return {
    activeProjects: data?.length ?? 0,
    candidateReserve: 0,
    weeklyInterviews: 0,
  };
};

export const listProjects = async (): Promise<Project[]> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    return projectsData;
  }

  const {data, error} = await supabase.from('projects').select('*').order('created_at', {ascending: false});
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
};

export const createProject = async (data: Omit<Project, 'id'>): Promise<Project> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const newProject: Project = {
      ...data,
      id: Date.now().toString(),
      createdAt: data.createdAt || new Date().toISOString(),
    };
    projectsData.push(newProject);
    return newProject;
  }

  const {data: row, error} = await supabase.from('projects').insert(data as Record<string, unknown>).select().single();
  if (error) throw new Error(error.message);
  return row as Project;
};

export const updateProjectStatus = async (id: string, status: Project['status']): Promise<Project> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const index = projectsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    projectsData[index] = {...projectsData[index], status};
    return projectsData[index];
  }

  const {data: row, error} = await supabase.from('projects').update({status}).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row as Project;
};

export const updateProject = async (id: string, data: Partial<Pick<Project, 'name' | 'city' | 'manager' | 'progress' | 'startDate' | 'endDate' | 'description' | 'status'>>): Promise<Project> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const index = projectsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    projectsData[index] = {...projectsData[index], ...data};
    return projectsData[index];
  }

  const {data: row, error} = await supabase.from('projects').update(data as Record<string, unknown>).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row as Project;
};

export const deleteProject = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const index = projectsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    projectsData.splice(index, 1);
    return;
  }

  const {error} = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
